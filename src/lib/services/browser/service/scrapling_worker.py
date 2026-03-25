import sys
import json
import traceback
import time
import os
from scrapling import StealthyFetcher
try:
    from selectolax.lexbor import LexborHTMLParser as HTMLParser
except ImportError:
    try:
        from selectolax.parser import HTMLParser
    except ImportError:
        HTMLParser = None

def extract_metadata(page):
    """Extract general metadata from any page."""
    meta = {"title": "Unknown", "description": "", "keywords": "", "og_title": "", "og_description": "", "canonical": ""}
    try:
        title_el = page.css_first("title")
        if title_el: meta["title"] = title_el.text.strip()
        meta_tags = page.css("meta")
        for tag in meta_tags:
            name = tag.attrib.get("name", "").lower()
            prop = tag.attrib.get("property", "").lower()
            content = tag.attrib.get("content", "").strip()
            if name == "description": meta["description"] = content
            elif name == "keywords": meta["keywords"] = content
            elif prop == "og:title": meta["og_title"] = content
            elif prop == "og:description": meta["og_description"] = content
    except: pass
    return meta

def extract_jobs(page, url=""):
    """Attempt to extract job listings if the site appears to be a job board."""
    jobs = []
    # Broaden selectors for modern LinkedIn/Indeed
    job_selectors = [
        ".job-card-container",
        ".base-card",
        ".base-search-card",
        "div.job-search-card",
        "li.jobs-search-results__list-item",
        ".job_seen_beacon", ".tapItem", "td.resultContent",
        ".iFne8e", ".P87Z9c", ".vt6azd",
        ".job-listing", ".job-item", "[itemtype*='JobPosting']", "article.job",
    ]
    
    for selector in job_selectors:
        try:
            elements = page.css(selector)
            if elements:
                for el in elements:
                    job = {"title": "Unknown", "company": "Unknown", "location": "Unknown", "url": ""}
                    try:
                        title_el = el.css_first("h2, h3, .title, [class*='title'], a[class*='job'], .base-search-card__title")
                        if title_el: job["title"] = title_el.text.strip()
                        company_el = el.css_first(".company, [class*='company'], [class*='brand'], .base-search-card__subtitle")
                        # Metadata extraction with refined selectors
                        company_el = el.css_first(".company, .base-search-card__subtitle, [class*='company'], [class*='brand']")
                        if company_el: job["company"] = company_el.text.strip()
                        
                        location_el = el.css_first(".location, [class*='location'], .job-search-card__location, .base-search-card__metadata")
                        if location_el: job["location"] = location_el.text.strip().split("\n")[0]
                        
                        # Date Posted (support 'time' tag and specific classes)
                        date_el = el.css_first("time, .job-search-card__listdate, .job-search-card__listdate--new, [class*='date']")
                        if date_el: job["date_posted"] = date_el.text.strip()
                        
                        # Salary (often obscured in list, but let's try)
                        salary_el = el.css_first(".salary, [class*='salary'], .job-search-card__salary-info")
                        if salary_el: job["salary"] = salary_el.text.strip()

                        # Broaden link selection: prioritize real URLs (LinkedIn/Indeed/etc.)
                        link_el = el.css_first(".base-card__full-link, .base-search-card__title-link, a[class*='title-link'], a[href*='/jobs/view/'], a[href*='/view/'], a[href*='/rc/clk'], a")
                        potential_url = link_el.attrib.get("href", "") if link_el else ""
                        
                        # Reconstruction logic (handle obscured links)
                        job_id = ""
                        # Try multiple attribute sources for Job ID
                        job_id = (el.attrib.get("data-job-id", "") or 
                                  (el.attrib.get("data-entity-urn") or "").split(":")[-1] if ":" in (el.attrib.get("data-entity-urn") or "") else "" or 
                                  el.attrib.get("data-tracking-control-id", ""))
                        
                        if not job_id and link_el:
                            job_id = link_el.attrib.get("data-job-id", "") or ((link_el.attrib.get("data-entity-urn") or "").split(":")[-1] if ":" in (link_el.attrib.get("data-entity-urn") or "") else "")
                        
                        # FORCE LinkedIn reconstruction if we have a job_id (cleaner than tracking links)
                        if job_id and "linkedin" in url.lower():
                            potential_url = f"https://www.linkedin.com/jobs/view/{job_id}/"
                        elif job_id and (not potential_url or potential_url == "#" or "login" in potential_url):
                            # check if we are on indeed
                            if "indeed" in url.lower():
                                potential_url = f"https://www.indeed.com/viewjob?jk={job_id}"
                            elif "linkedin" in url.lower():
                                potential_url = f"https://www.linkedin.com/jobs/view/{job_id}/"
                        
                        # Indeed specific reconstruction
                        jk = el.attrib.get("data-jk", "") or (link_el.attrib.get("data-jk", "") if link_el else "")
                        if jk and (not potential_url or potential_url == "#"):
                            potential_url = f"https://www.indeed.com/viewjob?jk={jk}"

                        if potential_url and not potential_url.startswith("#"):
                            job["url"] = potential_url
                    except: pass
                    if job["title"] != "Unknown": jobs.append(job)
                if jobs: break
        except: continue
    return jobs

def scrape(url, mode="auto"):
    try:
        # v0.4.2 syntax: Use StealthyFetcher for high-stealth bypass (LinkedIn, Cloudflare)
        # This uses patchright under the hood
        page = StealthyFetcher(url)
        
        # Human-like wait for dynamic content to truly settle
        time.sleep(3) 
        
        content = ""
        # In scrapling 0.4.x, StealthyFetcher has .content and .url attributes
        if hasattr(page, 'content'): content = page.content
        elif hasattr(page, 'text'): content = page.text
        else: content = str(page)

        meta = extract_metadata(page)
        
        # Enhanced blocked detection
        is_blocked = any(word in content.lower() for word in [
            "captcha", "robot", "blocked", "verify you are human", 
            "security check", "please sign in", "authwall", "redirecting"
        ]) or len(content) < 500
        
        # Check current URL for auth-walls
        current_url = url
        try:
            if hasattr(page, 'url'): current_url = page.url
            if "linkedin.com/login" in current_url or "linkedin.com/checkpoint" in current_url:
                is_blocked = True
        except: pass

        is_job_site = any(d in url.lower() for d in ["linkedin", "indeed", "google", "jobs", "career", "greenhouse", "lever"])
        jobs = []
        if (is_job_site or mode == "job") and not is_blocked:
            jobs = extract_jobs(page, url)

        links = []
        try:
            all_links = page.css("a")
            for l in all_links[:50]:
                href = l.attrib.get("href", "")
                text = l.text.strip()
                if href and not href.startswith("#") and not href.startswith("javascript"):
                    links.append({"text": text[:50], "url": href})
        except: pass

        result = {
            "status": "ok",
            "url": current_url,
            "title": meta["title"],
            "metadata": meta,
            "jobs": (jobs or [])[:100],
            "links": (links or [])[:50],
            "content": (content or "")[:50000],
            "is_blocked": is_blocked
        }
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e), "trace": traceback.format_exc()}))

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"status": "error", "message": "No URL or content provided"}))
        return

    target = sys.argv[1]
    mode = sys.argv[2] if len(sys.argv) > 2 else "auto"
    context_url = sys.argv[3] if len(sys.argv) > 3 else ""
    
    try:
        # Check if target is a file or content
        if target.startswith("<html>") or os.path.exists(target) or len(target) > 500:
            content = target
            if os.path.exists(target):
                with open(target, 'r', encoding='utf-8') as f:
                    content = f.read()
            
            if not HTMLParser:
                print(json.dumps({"status": "error", "message": "Selectolax not installed"}))
                return
            
            parser = HTMLParser(content)
            # Use context_url if provided, otherwise fallback to target
            effective_url = context_url if context_url else target
            
            # Patch the parser to mimic the 'page' object expected by extract_jobs
            # In scrapling/selectolax, 'css' and 'css_first' are standard
            meta = extract_metadata(parser)
            
            is_job_site = any(d in effective_url.lower() for d in ["linkedin", "indeed", "google", "jobs", "career", "greenhouse", "lever"])
            jobs = []
            if is_job_site or mode == "job":
                jobs = extract_jobs(parser, effective_url)

            links = []
            try:
                all_links = parser.css("a")
                for l in all_links[:50]:
                    href = l.attrib.get("href", "")
                    text = l.text.strip()
                    if href and not href.startswith("#") and not href.startswith("javascript"):
                        links.append({"text": text[:50], "url": href})
            except: pass
            
            result = {
                "status": "ok",
                "url": "local-content",
                "title": meta["title"],
                "metadata": meta,
                "jobs": (jobs or [])[:100],
                "links": (links or [])[:50],
                "content": (content or "")[:50000],
                "is_blocked": False
            }
            print(json.dumps(result))
        else:
            # Standard URL fetch
            scrape(target, mode)
    except Exception as e:
        print(json.dumps({
            "status": "error", 
            "message": str(e),
            "traceback": traceback.format_exc()
        }))

if __name__ == "__main__":
    main()
