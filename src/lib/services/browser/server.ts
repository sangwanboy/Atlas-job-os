import { createServer } from "node:http";
import { agentBrowserToolRegistry } from "./tools/agent-browser-tool-registry";
import { browserService } from "./service/browser-service";
import { extensionBridge } from "./extension-bridge";

const PORT = 3001;

process.on("unhandledRejection", (reason) => {
  console.error("🚨 Unhandled Rejection at:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("🚨 Uncaught Exception:", error);
  process.exit(1);
});

const server = createServer(async (req, res) => {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "http://localhost:3000");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url?.startsWith("/api/browser/observe") && req.method === "GET") {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const sessionId = url.searchParams.get("sessionId");
    
    if (!sessionId) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Missing sessionId");
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    });

    const encoder = new TextEncoder();
    const sendPulse = () => {
      try { res.write(encoder.encode(`data: ${JSON.stringify({ type: "heartbeat", timestamp: new Date().toISOString() })}\n\n`)); } catch {}
    };

    sendPulse();
    const pulseTimer = setInterval(sendPulse, 15000);

    const onObservation = (event: any) => {
      if (event.sessionId === sessionId || sessionId === "all") {
        try {
          console.log(`[ObserveServer] Emitting ${event.type} to ${sessionId}`);
          res.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch (e) {
          console.error("[ObserveServer] Error writing to stream", e);
        }
      }
    };

    browserService.on("observation", onObservation);

    req.on("close", () => {
      console.log(`[ObserveServer] Connection closed for ${sessionId}`);
      clearInterval(pulseTimer);
      browserService.off("observation", onObservation);
    });
    return;
  }

  if (req.url === "/api/browser/cancel" && req.method === "POST") {
    await extensionBridge.cancel();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ cancelled: true }));
    return;
  }

  if (req.url === "/health" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }));
    return;
  }

  if (req.url === "/api/browser" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", async () => {
      let attemptedTool = "unknown";
      try {
        const { action, sessionId, params } = JSON.parse(body);
        attemptedTool = `browser_${action}`;
        
        console.log(`[BrowserService] Executing: ${attemptedTool} for session: ${sessionId}`);
        
        const result = await agentBrowserToolRegistry.execute(attemptedTool as any, {
          sessionId,
          ...params
        });

        console.log(`[BrowserService] Success: ${attemptedTool}`);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (error: any) {
        console.error(`[BrowserService] Error in ${attemptedTool}:`, error.message || error);
        if (error.stack) console.error(error.stack);
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          status: "error",
          error: error instanceof Error ? error.message : "Action failed",
          details: error.details || undefined
        }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`🚀 Browser service running on http://localhost:${PORT}`);
  console.log(`- Health check: http://localhost:${PORT}/health`);
  console.log(`- Browser API: http://localhost:${PORT}/api/browser`);
  extensionBridge.start(3002);
});
