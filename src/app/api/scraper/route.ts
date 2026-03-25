import { NextRequest, NextResponse } from "next/server";
import { ScraperService } from "@/lib/services/scraper/scraper-service";

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url) {
      return NextResponse.json({ success: false, error: "URL is required" }, { status: 400 });
    }

    console.log(`[API/Scraper] SCRAPE REQUEST: ${url}`);
    
    // Performance Note: Crawl4AI can take 10-20s depending on the site.
    // In a production app, this might be a background job, but for Atlas discovery, 
    // we use a direct stream-friendly wait in the orchestrator.
    const result = await ScraperService.scrape(url);
    
    if (!result.success) {
      return NextResponse.json(result, { status: 500 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[API/Scraper] Error:", error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Internal Server Error" 
    }, { status: 500 });
  }
}
