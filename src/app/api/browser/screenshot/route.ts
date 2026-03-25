import { NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getBrowserRuntimeConfig } from "@/lib/services/browser/config/browser-config";

export async function GET(req: NextRequest) {
  const filePath = req.nextUrl.searchParams.get("path");
  
  if (!filePath) {
    return new Response("Missing path", { status: 400 });
  }

  try {
    const config = getBrowserRuntimeConfig();
    const screenshotDir = config.screenshotDir;
    
    // Security check: Ensure the path is within the screenshot directory
    const normalizedPath = path.normalize(filePath).toLowerCase();
    const normalizedDir = path.normalize(screenshotDir).toLowerCase();
    
    if (!normalizedPath.startsWith(normalizedDir)) {
        console.error("[ScreenshotAPI] Security violation: Attempted access outside screenshot dir", { normalizedPath, normalizedDir });
        return new Response("Unauthorized", { status: 403 });
    }

    const buffer = await readFile(normalizedPath);
    
    return new Response(buffer, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("[ScreenshotAPI] Error reading screenshot", error);
    return new Response("Not Found", { status: 404 });
  }
}
