import { NextResponse } from "next/server";
import { z } from "zod";
import { agentBrowserToolRegistry } from "@/lib/services/browser/tools/agent-browser-tool-registry";
import type { BrowserToolName } from "@/lib/services/browser/types/browser-types";
import { acquireBrowserSlot } from "@/lib/browser-pool";

// Unified Browser API Schema based on USER request and internal registry
const browserRequestSchema = z.object({
  action: z.enum([
    "navigate",
    "click",
    "type",
    "scroll",
    "screenshot",
    "extract_text",
    "extract_jobs",
    "enrich_jobs",
    "close",
    "resume"
  ]),
  sessionId: z.string().min(1),
  params: z.record(z.unknown()).optional()
});

// Map external actions to internal tool names
const actionToToolMap: Record<string, BrowserToolName> = {
  navigate: "browser_navigate",
  click: "browser_click",
  type: "browser_type",
  scroll: "browser_scroll",
  screenshot: "browser_screenshot",
  extract_text: "browser_extract_text",
  extract_jobs: "browser_extract_jobs",
  enrich_jobs: "browser_enrich_jobs",
  close: "browser_close_session",
  resume: "browser_resume"
};

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const { action, sessionId, params } = browserRequestSchema.parse(json);

    const toolName = actionToToolMap[action];

    // Acquire a pool slot — queues if BROWSER_POOL_SIZE concurrent ops are running
    const release = await acquireBrowserSlot();
    let result;
    try {
      result = await agentBrowserToolRegistry.execute(toolName, {
        sessionId,
        ...params,
      });
    } finally {
      release();
    }

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Browser API request failed";
    return NextResponse.json(
      {
        status: "error",
        timestamp: new Date().toISOString(),
        error: {
          code: "BROWSER_API_ERROR",
          message,
        },
      },
      { status: 400 }
    );
  }
}
