import { NextResponse } from "next/server";
import { agentStore } from "@/lib/services/agent/agent-store";
import { requireAuth, isNextResponse } from "@/lib/server/auth-helpers";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get("agentId");
  const sessionId = searchParams.get("sessionId");

  const authResult = await requireAuth();
  if (isNextResponse(authResult)) return authResult;
  const { userId } = authResult;

  try {
    if (sessionId) {
      const messages = await agentStore.getSessionMessages(sessionId);
      return NextResponse.json({ messages });
    }

    if (agentId) {
      const sessions = await agentStore.listSessions({ agentId, userId: userId });
      let hydratedMessages: unknown[] = [];
      if (sessions.length > 0) {
        hydratedMessages = await agentStore.getSessionMessages(sessions[0].id);
      }
      return NextResponse.json({
        sessions,
        hydratedSessionId: sessions[0]?.id || null,
        hydratedMessages,
      });
    }

    return NextResponse.json({ error: "Missing agentId or sessionId" }, { status: 400 });
  } catch (error) {
    console.error("[API/Sessions] error:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch session data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
