import { browserService } from "@/lib/services/browser/service/browser-service";
import { continuitySyncService } from "@/lib/services/agent/continuity-sync-service";

async function verifyDiscovery() {
  console.log("🚀 Starting Atlas Job Discovery Verification...");
  const sessionId = "discovery-verify-" + Date.now();
  const jobs: any[] = [];

  try {
    // 1. Verify File-Based State
    console.log("📂 Verifying file-based state...");
    const layers = await continuitySyncService.hydrateTurnContext("test-agent", sessionId, "search");
    if (layers.soul && layers.mind) {
        console.log("✅ Selective hydration confirmed. Soul and Mind layers loaded.");
    } else {
        console.error("❌ Selective hydration failed. Check agents/atlas directory.");
    }

    // 2. Launch Browser
    await browserService.launchBrowser({ headless: true });

    for (let p = 1; p <= 3; p++) {
        console.log(`🔍 Navigating to Adzuna Page ${p}...`);
        await browserService.navigate({
          sessionId,
          url: `https://www.adzuna.co.uk/jobs/search?q=animator+graphic+designer&l=london&p=${p}`
        });

        console.log(`📥 Extracting jobs from Page ${p}...`);
        const result = await browserService.extractJobs({ sessionId });
        if (result.status === "ok" && result.data) {
            const newJobs = result.data.jobs || [];
            console.log(`✅ Found ${newJobs.length} jobs on Page ${p}.`);
            jobs.push(...newJobs);
        } else {
            console.warn(`⚠️ Failed to extract from page ${p}:`, result.error);
        }
    }

    // 4. Print results
    console.log(`\n📊 Total: ${jobs.length} jobs.`);
    console.log("\n--- Combined Extracted Jobs ---");
    jobs.slice(0, 30).forEach((j, i) => {
      console.log(`${i + 1}. ${j.title} at ${j.company} (${j.location})`);
    });

  } catch (error) {
    console.error("❌ Verification failed:", error);
  } finally {
    await browserService.shutdownBrowser();
    console.log("👋 Browser shutdown complete.");
  }
}

verifyDiscovery();
