import sys
import json
import asyncio
import io
import re

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

try:
    from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode
    from crawl4ai.extraction_strategy import JsonCssExtractionStrategy
except ImportError:
    print(json.dumps({"success": False, "error": "crawl4ai not installed."}))
    sys.exit(1)


# ── Helpers ───────────────────────────────────────────────────────────────────

def extract_linkedin_job_ids(html: str) -> list:
    """Pull job IDs from data-entity-urn and /jobs/view/ hrefs in raw HTML."""
    ids = []
    for m in re.finditer(r'data-entity-urn=["\']urn:li:jobPosting:(\d{7,})["\']', html):
        ids.append(m.group(1))
    for m in re.finditer(r'/jobs/view/(?:[^/"\'\s?&#]*?-)?(\d{7,})', html):
        c = m.group(1)
        if c not in ids:
            ids.append(c)
    seen, unique = set(), []
    for i in ids:
        if i not in seen:
            seen.add(i)
            unique.append(i)
    return unique


def build_clean_linkedin_url(raw: str) -> str:
    if not raw:
        return ""
    raw = raw.strip()
    m = re.search(r'(https?://[^/]*linkedin\.com/jobs/view/[^?&#]+)', raw)
    if m:
        return m.group(1).rstrip('/') + '/'
    if '/jobs/view/' in raw:
        p = re.search(r'(/jobs/view/[^?&#]+)', raw)
        if p:
            return 'https://www.linkedin.com' + p.group(1).rstrip('/') + '/'
    if raw.startswith('http') and 'linkedin.com' in raw:
        return raw.split('?')[0]
    if raw.startswith('/'):
        return 'https://www.linkedin.com' + raw.split('?')[0]
    return ""


# ── JS: extract structured data from a LinkedIn JOB DETAIL page ──────────────
DETAIL_JS = r"""
(function() {
  const getText = sel => (document.querySelector(sel)?.textContent || '').replace(/\s+/g, ' ').trim();

  // Title / company / location
  const title    = getText('h1.top-card-layout__title, h1.t-24, .job-details-jobs-unified-top-card__job-title');
  const company  = getText('.top-card-layout__card .topcard__org-name-link, .top-card-layout__second-subline a, .job-details-jobs-unified-top-card__company-name a');
  const location = getText('.top-card-layout__bullet, .job-details-jobs-unified-top-card__primary-description-container .tvm__text');

  // Salary — multiple possible locations
  let salary = getText('.salary-range, .compensation__salary, .job-details-jobs-unified-top-card__salary-info, [class*="salary"]');

  // Employment type / seniority
  const empType  = getText('.job-criteria__text--criteria:nth-of-type(1), .description__job-criteria-text');
  const seniority = getText('.job-criteria__text--criteria:nth-of-type(2)');

  // Full description
  const descEl = document.querySelector(
    '.show-more-less-html__markup, .description__text, .job-details-module, article.show-more-less-html, .jobs-description-content__text'
  );
  const description = descEl ? descEl.innerText.replace(/\s+/g, ' ').trim() : '';

  // Skills — collect badge texts
  const skillEls = document.querySelectorAll('.job-details-skill-match-status-list li, .skills-section .skill-badge-text, [class*="skill"] span');
  const skills = Array.from(skillEls).map(e => e.textContent.trim()).filter(Boolean);

  // All criteria rows (job type, seniority, industry, etc.)
  const criteria = {};
  document.querySelectorAll('.job-criteria__list .job-criteria__item').forEach(item => {
    const label = (item.querySelector('.job-criteria__subheader')?.textContent || '').trim();
    const value = (item.querySelector('.job-criteria__text')?.textContent || '').trim();
    if (label && value) criteria[label] = value;
  });

  if (!salary && criteria['Base pay range']) salary = criteria['Base pay range'];
  const jobType   = criteria['Employment type'] || empType || '';
  const senLevel  = criteria['Seniority level'] || seniority || '';
  const industry  = criteria['Industries'] || '';

  return JSON.stringify({ title, company, location, salary, description, skills, jobType, senLevel, industry });
})()
"""

# ── JS: extract job cards from LinkedIn SEARCH results page ──────────────────
SEARCH_JS = r"""
(function() {
  const cards = Array.from(document.querySelectorAll('div.base-card, div.job-search-card'));
  const jobs = [];
  for (const card of cards) {
    const title = (card.querySelector('h3.base-search-card__title, h3.job-search-card__title, .base-card__title')?.textContent || '').trim();
    if (!title) continue;
    const company  = (card.querySelector('h4.base-search-card__subtitle, .job-search-card__company-name, .base-card__subtitle')?.textContent || '').trim();
    const location = (card.querySelector('.job-search-card__location, .base-card__location')?.textContent || '').trim();
    const dateEl   = card.querySelector('time');
    const date_posted = dateEl?.getAttribute('datetime') || dateEl?.textContent?.trim() || '';
    const snippet  = (card.querySelector('.job-search-card__snippet, .base-search-card__metadata')?.textContent || '').trim();
    const salary   = (card.querySelector('.job-search-card__salary-info')?.textContent || '').trim();

    let url = '';
    const linkEl = card.querySelector('a.base-card__full-link, a.job-search-card__link, a[href*="/jobs/view/"]');
    if (linkEl) {
      const href = linkEl.getAttribute('href') || '';
      if (href.includes('/jobs/view/')) {
        const clean = href.split('?')[0];
        url = clean.startsWith('http') ? clean : 'https://www.linkedin.com' + clean;
      }
    }
    if (!url) {
      const urn = card.getAttribute('data-entity-urn') || card.querySelector('[data-entity-urn]')?.getAttribute('data-entity-urn') || '';
      const m = urn.match(/:(\d{7,})$/);
      if (m) url = 'https://www.linkedin.com/jobs/view/' + m[1] + '/';
    }
    jobs.push({ title, company, location, url, date_posted, snippet, salary });
  }
  return JSON.stringify(jobs);
})()
"""


async def scrape_detail(browser_config, url: str, semaphore: asyncio.Semaphore) -> dict:
    """Visit a single job detail page and extract full info. Returns partial dict on failure."""
    async with semaphore:
        try:
            rc = CrawlerRunConfig(
                cache_mode=CacheMode.BYPASS,
                remove_overlay_elements=True,
                process_iframes=False,
                wait_for="css:h1, css:.show-more-less-html__markup, css:.job-details-jobs-unified-top-card__job-title",
                js_code=DETAIL_JS,
                delay_before_return_html=1.5,
                page_timeout=20000,
            )
            async with AsyncWebCrawler(config=browser_config) as crawler:
                result = await crawler.arun(url=url, config=rc)

            if not result.success:
                return {}

            # Try to parse JS result
            val = getattr(result, 'js_return_value', None)
            detail = {}
            if val:
                try:
                    detail = json.loads(val) if isinstance(val, str) else {}
                except Exception:
                    pass

            # Fallback: parse raw HTML for description
            if not detail.get('description'):
                raw = getattr(result, 'html', '') or getattr(result, 'cleaned_html', '') or ''
                # Extract from common LinkedIn description containers
                m = re.search(
                    r'<div[^>]+(?:show-more-less-html__markup|description__text)[^>]*>([\s\S]*?)</div>',
                    raw, re.IGNORECASE
                )
                if m:
                    text = re.sub(r'<[^>]+>', ' ', m.group(1))
                    detail['description'] = ' '.join(text.split())[:3000]

            return detail
        except Exception:
            return {}


async def main():
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "No URL provided"}))
        return

    url = sys.argv[1]
    is_indeed = "indeed.com" in url

    browser_config = BrowserConfig(
        headless=True,
        verbose=False,
        java_script_enabled=True,
        user_agent=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/131.0.0.0 Safari/537.36"
        )
    )

    # ── STEP 1: Scrape search results page ────────────────────────────────────
    if not is_indeed:
        schema = {
            "name": "Job Listing",
            "baseSelector": "div.base-card, div.job-search-card",
            "fields": [
                {"name": "title",       "selector": "h3.base-search-card__title, h3.job-search-card__title", "type": "text"},
                {"name": "company",     "selector": "h4.base-search-card__subtitle, .job-search-card__company-name", "type": "text"},
                {"name": "location",    "selector": ".job-search-card__location, .base-card__location", "type": "text"},
                {"name": "url",         "selector": "a.base-card__full-link, a[href*='/jobs/view/']", "type": "attribute", "attribute": "href"},
                {"name": "date_posted", "selector": "time", "type": "attribute", "attribute": "datetime"},
                {"name": "salary",      "selector": ".job-search-card__salary-info", "type": "text"},
            ]
        }
        wait_selector = "css:div.base-card"
    else:
        schema = {
            "name": "Job Listing",
            "baseSelector": "div.job_seen_beacon, div.resultContent",
            "fields": [
                {"name": "title",       "selector": "h2.jobTitle span[title], h2.jobTitle a", "type": "text"},
                {"name": "company",     "selector": ".companyName", "type": "text"},
                {"name": "location",    "selector": ".companyLocation", "type": "text"},
                {"name": "url",         "selector": "h2.jobTitle a", "type": "attribute", "attribute": "href"},
                {"name": "salary",      "selector": ".salary-snippet-container", "type": "text"},
            ]
        }
        wait_selector = "css:div.job_seen_beacon"

    run_config = CrawlerRunConfig(
        cache_mode=CacheMode.BYPASS,
        extraction_strategy=JsonCssExtractionStrategy(schema, verbose=False),
        remove_overlay_elements=True,
        process_iframes=False,
        wait_for=wait_selector,
        delay_before_return_html=2.0,
    )

    try:
        async with AsyncWebCrawler(config=browser_config) as crawler:
            result = await crawler.arun(url=url, config=run_config)
    except Exception as e:
        print(json.dumps({"success": False, "error": f"Search page crawl failed: {e}", "status_code": 500}))
        return

    if not result.success:
        print(json.dumps({"success": False, "error": str(result.error_message), "status_code": 500}))
        return

    # Parse search results
    base_jobs = []
    if result.extracted_content:
        try:
            base_jobs = json.loads(result.extracted_content)
        except Exception:
            pass

    # Build URL map from raw HTML job IDs (fallback for missing hrefs)
    li_job_ids = extract_linkedin_job_ids(getattr(result, 'html', '') or '') if not is_indeed else []

    # Resolve URLs and filter blanks
    resolved = []
    url_idx = 0
    for job in base_jobs:
        title = ' '.join((job.get('title') or '').split())
        if not title:
            continue

        raw_url = (job.get('url') or '').strip()
        if not is_indeed:
            clean_url = build_clean_linkedin_url(raw_url)
            if not clean_url and url_idx < len(li_job_ids):
                clean_url = f'https://www.linkedin.com/jobs/view/{li_job_ids[url_idx]}/'
                url_idx += 1
            elif clean_url:
                url_idx += 1
        else:
            clean_url = raw_url if raw_url.startswith('http') else (
                'https://uk.indeed.com' + raw_url if raw_url.startswith('/') else ''
            )

        for f in ['title', 'company', 'location', 'salary', 'date_posted']:
            if job.get(f):
                job[f] = ' '.join(str(job[f]).split())

        job['title'] = title
        job['url'] = clean_url
        job['source'] = 'Indeed' if is_indeed else 'LinkedIn'
        resolved.append(job)

    if not resolved:
        print(json.dumps({"success": False, "error": "No jobs found on search page", "status_code": 404}))
        return

    # ── STEP 2: Scrape each job's detail page concurrently ────────────────────
    # Only do this for LinkedIn (Indeed detail pages are harder to scrape as guest)
    if not is_indeed:
        semaphore = asyncio.Semaphore(4)  # max 4 concurrent detail fetches
        detail_tasks = [
            scrape_detail(browser_config, job['url'], semaphore)
            for job in resolved if job.get('url') and 'linkedin.com/jobs/view/' in job.get('url', '')
        ]
        details = await asyncio.gather(*detail_tasks, return_exceptions=True)

        detail_idx = 0
        for job in resolved:
            if job.get('url') and 'linkedin.com/jobs/view/' in job.get('url', ''):
                detail = details[detail_idx] if detail_idx < len(details) else {}
                if isinstance(detail, dict) and detail:
                    if detail.get('description'):
                        job['description'] = detail['description'][:4000]
                    if detail.get('salary') and not job.get('salary'):
                        job['salary'] = detail['salary']
                    if detail.get('skills'):
                        skills = detail['skills']
                        job['skills'] = ', '.join(skills[:20]) if isinstance(skills, list) else str(skills)
                    if detail.get('jobType'):
                        job['jobType'] = detail['jobType']
                    if detail.get('senLevel'):
                        job['senLevel'] = detail['senLevel']
                    if detail.get('industry'):
                        job['industry'] = detail['industry']
                detail_idx += 1

    print(json.dumps({
        "success": True,
        "url": url,
        "jobs": resolved,
        "status_code": 200
    }))


if __name__ == "__main__":
    asyncio.run(main())
