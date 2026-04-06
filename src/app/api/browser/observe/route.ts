import { NextRequest } from "next/server";
import { browserService } from "@/lib/services/browser/service/browser-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  
  if (!sessionId) {
    return new Response("Missing sessionId", { status: 400 });
  }

  // Attempt to proxy to standalone browser server (3001) if available using node http directly
  // to avoid Next.js fetch buffering/timeouts
  const remoteUrl = `http://localhost:3001/api/browser/observe?sessionId=${sessionId}`;
  
  try {
    const { Readable } = await import("stream");
    const http = await import("http");
    
    return new Promise((resolve) => {
      const proxyReq = http.get(remoteUrl, (proxyRes) => {
        if (proxyRes.statusCode === 200) {
          console.log(`[ObserveAPI] Proxying to standalone browser server (3001) for: ${sessionId}`);
          
          const stream = Readable.toWeb(proxyRes);
          resolve(new Response(stream as any, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache, no-transform",
              "Connection": "keep-alive",
            },
          }));
        } else {
          resolve(new Response("upstream error", { status: 502 }));
        }
      });

      proxyReq.on("error", () => resolve(new Response("proxy unavailable", { status: 503 })));
      req.signal.addEventListener("abort", () => proxyReq.destroy());
    }) as Promise<Response>;
  } catch (e) {
    console.log(`[ObserveAPI] Proxy attempt failed, using local service: ${sessionId}`);
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial heartbeat
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "heartbeat", timestamp: new Date().toISOString() })}\n\n`));

      const onObservation = (event: any) => {
        if (event.sessionId === sessionId || sessionId === "all") {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          } catch (e) {
            console.error("[ObserveAPI] Error enqueuing message", e);
          }
        }
      };

      browserService.on("observation", onObservation);

      req.signal.addEventListener("abort", () => {
        browserService.off("observation", onObservation);
        try {
          controller.close();
        } catch (e) {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  });
}
