import { browserService } from "../lib/services/browser/service/browser-service.js";

async function testStealth() {
  console.log("🚀 Testing Stealth Mode...");
  
  const sessionId = `stealth-test-${Date.now()}`;
  
  try {
    // 1. Launch/Create Session (will use the new stealth context)
    await browserService.launchBrowser({ headless: true });
    const session = await browserService.createSession({ sessionId });
    console.log(`✅ Session created: ${session.data.sessionId}`);
    
    // 2. Navigate to bot detection test
    const url = "https://bot.sannysoft.com";
    console.log(`🔍 Navigating to ${url}...`);
    const nav = await browserService.navigate({ sessionId, url });
    
    // 3. Extract text to see if we passed major checks
    const text = await browserService.extractText({ sessionId, selector: "table" });
    const content = text.data.text;
    
    console.log("\n--- Stealth Results ---");
    const webdriverPassed = !content.includes("WebDriver (New) failed") && !content.includes("WebDriver failed");
    console.log(`WebDriver Masked: ${webdriverPassed ? "✅ YES" : "❌ NO"}`);
    
    const chromePassed = content.includes("Chrome (Basic) passed");
    console.log(`Chrome Signature: ${chromePassed ? "✅ YES" : "❌ NO"}`);
    
    // 4. Take screenshot for manual verification
    const screenshot = await browserService.screenshot({ sessionId, fileName: "stealth-check.png" });
    console.log(`📸 Screenshot saved to: ${screenshot.data.filePath}`);
    
  } catch (error) {
    console.error("❌ Stealth test failed:", error);
  } finally {
    process.exit(0);
  }
}

testStealth();
