import sys
import json
import asyncio
import os
import io
import re

# Force stdout to use UTF-8 to avoid 'charmap' errors on Windows
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# Ensure we can import crawl4ai
try:
    from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode
    from crawl4ai.extraction_strategy import JsonCssExtractionStrategy
except ImportError:
    print(json.dumps({"success": False, "error": "crawl4ai components missing. Run: pip install crawl4ai"}))
    sys.exit(1)


def resolve_linkedin_url(raw_url: str) -> str:
    """Ensure LinkedIn job URLs are absolute."""
    if not raw_url:
        return ""
    if raw_url.startswith("http"):
        # Strip tracking params beyond the job ID
        match = re.match(r"(https://[^/]*linkedin\.com/jobs/view/\d+)", raw_url)
        if match:
            return match.group(1)
        return raw_url
    if raw_url.startswith("/"):
        return f"https://www.linkedin.com{raw_url.split('?')[0]}"
    return raw_url


def extract_job_id_from_urn(urn: str) -> str:
    """Extract numeric job ID from LinkedIn URN like urn:li:jobPosting:1234567."""
    match = re.search(r":(\d+)$", urn or "")
    return match.group(1) if match else ""


async def main():
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "No URL provided"}))
        return

    url = sys.argv[1]

    # --- Schema for LinkedIn public job search cards ---
    schema = {
        "name": "Job Listing",
        "baseSelector": "div.base-card, div.job-search-card, li.jobs-search-results__list-item",
        "fields": [
            {
                "name": "title",
                "selector": "h3.base-search-card__title, .job-search-card__title, h3, .base-card__title",
                "type": "text"
            },
            {
                "name": "company",
                "selector": "h4.base-search-card__subtitle, .job-search-card__subtitle, h4, .base-card__subtitle",
                "type": "text"
            },
            {
                "name": "location",
                "selector": "span.job-search-card__location, .base-search-card__metadata span, .base-card__location",
                "type": "text"
            },
            {
                "name": "url",
                "selector": "a.base-card__full-link, a.job-search-card__link, a[data-tracking-control-name='public_jobs_jserp-result_search-card'], a",
                "type": "attribute",
                "attribute": "href"
            },
            {
                "name": "entity_urn",
                "selector": "div.base-card, div.job-search-card",
                "type": "attribute",
                "attribute": "data-entity-urn"
            },
            {
                "name": "date_posted",
                "selector": "time.job-search-card__listdate, time.job-search-card__listdate--new, time",
                "type": "attribute",
                "attribute": "datetime"
            },
            {
                "name": "description",
                "selector": ".job-search-card__snippet, .base-search-card__metadata, p",
                "type": "text"
            },
            {
                "name": "salary",
                "selector": ".job-search-card__salary-info, .base-search-card__salary",
                "type": "text"
            }
        ]
    }

    extraction_strategy = JsonCssExtractionStrategy(schema, verbose=False)

    browser_config = BrowserConfig(
        headless=True,
        verbose=False,
        java_script_enabled=True,
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    )

    run_config = CrawlerRunConfig(
        cache_mode=CacheMode.BYPASS,
        extraction_strategy=extraction_strategy,
        remove_overlay_elements=True,
        process_iframes=False,
        wait_for="css:div.base-card, css:li.jobs-search-results__list-item",
        page_timeout=30000,
    )

    try:
        async with AsyncWebCrawler(config=browser_config) as crawler:
            result = await crawler.arun(url=url, config=run_config)

            if result.success:
                extracted_data = []
                if result.extracted_content:
                    try:
                        raw = json.loads(result.extracted_content)
                        for job in raw:
                            if not job.get("title"):
                                continue
                            # Resolve URL — prefer direct URL, fall back to URN-derived URL
                            raw_url = job.get("url", "")
                            entity_urn = job.get("entity_urn", "")
                            resolved_url = resolve_linkedin_url(raw_url)
                            if not resolved_url and entity_urn:
                                job_id = extract_job_id_from_urn(entity_urn)
                                if job_id:
                                    resolved_url = f"https://www.linkedin.com/jobs/view/{job_id}/"
                            job["url"] = resolved_url
                            job.pop("entity_urn", None)
                            extracted_data.append(job)
                    except Exception:
                        extracted_data = []

                print(json.dumps({
                    "success": True,
                    "url": url,
                    "jobs": extracted_data,
                    "markdown": result.markdown or "",
                    "metadata": result.metadata or {},
                    "status_code": getattr(result, "status_code", 200)
                }))
            else:
                print(json.dumps({
                    "success": False,
                    "error": str(result.error_message or "Unknown crawl error"),
                    "status_code": getattr(result, "status_code", 500)
                }))
    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": f"Exception during crawl: {str(e)}",
            "status_code": 500
        }))


if __name__ == "__main__":
    asyncio.run(main())
