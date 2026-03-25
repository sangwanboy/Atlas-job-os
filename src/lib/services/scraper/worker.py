import sys
import json
import asyncio
import os
import io

# Force stdout to use UTF-8 to avoid 'charmap' errors on Windows
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# Ensure we can import crawl4ai
try:
    from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode
    from crawl4ai.extraction_strategy import JsonCssExtractionStrategy
except ImportError:
    print(json.dumps({"success": False, "error": "crawl4ai components (JsonCssExtractionStrategy) missing."}))
    sys.exit(1)

async def main():
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "No URL provided"}))
        return

    url = sys.argv[1]
    
    # Define a schema for job extraction (targets LinkedIn public job search)
    schema = {
        "name": "Job Listing",
        "baseSelector": "div.base-card, div.job-search-card",
        "fields": [
            {"name": "title", "selector": "h3.base-search-card__title, .base-card__title, .job-search-card__title", "type": "text"},
            {"name": "company", "selector": "h4.base-search-card__subtitle, .base-card__subtitle, .job-search-card__subtitle", "type": "text"},
            {"name": "location", "selector": "span.job-search-card__location, .base-card__location, .job-search-card__location", "type": "text"},
            {"name": "url", "selector": "a.base-card__full-link, a.job-search-card__link", "type": "attribute", "attribute": "href"},
            {"name": "date_posted", "selector": "time.job-search-card__listdate, time", "type": "attribute", "attribute": "datetime"},
            {"name": "description", "selector": ".job-search-card__snippet, .base-search-card__metadata, .description__text", "type": "text"}
        ]
    }
    
    extraction_strategy = JsonCssExtractionStrategy(schema, verbose=False)
    
    # Configure for high-stealth and automated overlay removal
    browser_config = BrowserConfig(
        headless=True,
        verbose=False,
        java_script_enabled=True,
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
    
    run_config = CrawlerRunConfig(
        cache_mode=CacheMode.BYPASS,  # Bypass cache for live jobs
        extraction_strategy=extraction_strategy,
        remove_overlay_elements=True,  # Kill LinkedIn login popups
        process_iframes=True,
        wait_for="css:div.base-card" # Wait for the cards to appear
    )

    try:
        async with AsyncWebCrawler(config=browser_config) as crawler:
            result = await crawler.arun(
                url=url,
                config=run_config
            )
            
            if result.success:
                # If extraction strategy used, result.extracted_content contains the JSON string
                extracted_data = []
                if result.extracted_content:
                    try:
                        extracted_data = json.loads(result.extracted_content)
                    except:
                        extracted_data = []

                print(json.dumps({
                    "success": True,
                    "url": url,
                    "jobs": extracted_data,
                    "markdown": result.markdown, # Fallback
                    "metadata": result.metadata or {},
                    "status_code": getattr(result, 'status_code', 200)
                }))
            else:
                print(json.dumps({
                    "success": False,
                    "error": str(result.error_message),
                    "status_code": getattr(result, 'status_code', 500)
                }))
    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": f"Exception during crawl: {str(e)}",
            "status_code": 500
        }))

if __name__ == "__main__":
    asyncio.run(main())
