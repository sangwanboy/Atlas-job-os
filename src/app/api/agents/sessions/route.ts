import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { agentStore } from "@/lib/services/agent/agent-store";

let cachedUserId: string | null = null;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get("agentId");
  const sessionId = searchParams.get("sessionId");
  try {
    if (sessionId) {
      const messages = await agentStore.getSessionMessages(sessionId);
      return NextResponse.json({ messages });
    }

    let userId = cachedUserId || "local-dev-user";
    if (!cachedUserId) {
      try {
        let user = await prisma.user.findFirst({
          where: { email: "local-dev-user@ai-job-os.local" },
        });

        if (!user) {
          user = await prisma.user.create({
            data: {
              email: "local-dev-user@ai-job-os.local",
              name: "Local Dev User",
            },
          });
        }
        cachedUserId = user.id;
        userId = user.id;
      } catch (dbError) {
        console.warn("[API/Sessions] Database unreachable, falling back to mock user ID:", dbError instanceof Error ? dbError.message : "Unknown error");
        // Prevent 10-second timeout on every refresh when DB is completely offline
        cachedUserId = "local-dev-user";
      }
    }

    if (agentId) {
      console.log(`[API/Sessions] Listing sessions for agentId="${agentId}", userId="${userId}"`);
      try {
        const sessions = await agentStore.listSessions({ agentId, userId });
        console.log(`[API/Sessions] Found ${sessions.length} sessions`);
        
        let hydratedMessages: any[] = [];
        if (sessions.length > 0) {
          hydratedMessages = await agentStore.getSessionMessages(sessions[0].id);
        }

        return NextResponse.json({ 
          sessions, 
          hydratedSessionId: sessions[0]?.id || null,
          hydratedMessages 
        });
      } catch (innerError) {
        console.error("[API/Sessions] agentStore.listSessions/hydration failed:", innerError);
        return NextResponse.json({ sessions: [] });
      }
    }

    return NextResponse.json({ error: "Missing agentId or sessionId" }, { status: 400 });
  } catch (error) {
    console.error("[API/Sessions] Top-level error:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch session data";
    return NextResponse.json({ 
      error: message, 
      stack: error instanceof Error ? error.stack : undefined 
    }, { status: 500 });
  }
}
