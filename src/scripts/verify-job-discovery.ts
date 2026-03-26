import { ScraperService } from "@/lib/services/scraper/scraper-service";

async function verifyDiscovery() {
  console.log("🚀 Starting Atlas Job Discovery Verification (Crawl4AI)...");
  const jobs: any[] = [];

  const sources = [
    { name: "LinkedIn", url: "https://www.linkedin.com/jobs/search/?keywords=software+engineer&location=london" },
    { name: "Indeed", url: "https://uk.indeed.com/jobs?q=software+engineer&l=london" },
  ];

  for (const source of sources) {
    console.log(`🔍 Scraping ${source.name}...`);
    try {
      const result = await ScraperService.scrape(source.url);
      if (result.success && result.jobs && result.jobs.length > 0) {
        console.log(`✅ Found ${result.jobs.length} jobs from ${source.name}.`);
        jobs.push(...result.jobs.map((j: any) => ({ ...j, source: source.name })));
      } else {
        console.warn(`⚠️ ${source.name} scrape failed: ${result.error || "No jobs found"}`);
      }
    } catch (error) {
      console.error(`❌ ${source.name} error:`, error);
    }
  }

  console.log(`\n📊 Total: ${jobs.length} jobs.`);
  console.log("\n--- Combined Extracted Jobs ---");
  jobs.slice(0, 30).forEach((j, i) => {
    console.log(`${i + 1}. ${j.title} at ${j.company} (${j.location}) [${j.source}]`);
  });

  console.log("👋 Verification complete.");
}

verifyDiscovery();
