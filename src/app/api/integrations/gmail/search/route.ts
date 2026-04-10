import { NextResponse } from "next/server";
import { google } from "googleapis";
import { prisma } from "@/lib/db";
import { getValidTokensHelper } from "@/lib/services/integration/gmail/oauth";
import { requireAuth, isNextResponse } from "@/lib/server/auth-helpers";

export async function POST(request: Request) {
  try {
    const authResult = await requireAuth();
    if (isNextResponse(authResult)) return authResult;
    const { userId } = authResult;

    const { query } = await request.json();
    if (!query) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    let account: any = null;

    // 1. Get Integration Account (Try Prisma, fallback to local cache)
    try {
      account = await (prisma as any).integrationAccount.findUnique({
        where: { userId_provider: { userId, provider: "google" } }
      });
    } catch (e) {
      console.warn("[Gmail Search] Prisma unreachable, falling back to local cache.");
    }

    if (!account || !account.accessToken || account.status !== "CONNECTED") {
      const { localIntegrationCache } = await import("@/lib/services/integration/gmail/local-integration-cache");
      const local = localIntegrationCache.get();
      if (local.account && local.account.status === "CONNECTED") {
        account = local.account;
      }
    }

    if (!account || !account.accessToken || account.status !== "CONNECTED") {
      return NextResponse.json({ error: "Gmail not connected" }, { status: 401 });
    }

    // 2. Auth with Google
    const oauth2Client = await getValidTokensHelper(
      account.accessToken, 
      account.refreshToken || "", 
      account.expiresAt instanceof Date ? account.expiresAt.getTime() : account.expiresAt
    );
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    // 3. Search Threads
    const listRes = await gmail.users.threads.list({
      userId: "me",
      maxResults: 10,
      q: query,
    });

    const threadSummaries = [];
    const threads = listRes.data.threads || [];
    
    for (const thread of threads) {
      if (!thread.id) continue;
      const t = await gmail.users.threads.get({ userId: "me", id: thread.id, format: "minimal" });
      const firstMsg = t.data.messages?.[0];
      const headers = firstMsg?.payload?.headers || [];
      const subject = headers.find(h => h.name?.toLowerCase() === "subject")?.value || "No Subject";
      const from = headers.find(h => h.name?.toLowerCase() === "from")?.value || "Unknown Sender";
      const date = firstMsg?.internalDate ? new Date(Number(firstMsg.internalDate)).toISOString() : "Unknown Date";

      threadSummaries.push({
        threadId: thread.id,
        subject,
        from,
        date,
        snippet: thread.snippet
      });
    }

    return NextResponse.json({ results: threadSummaries });
  } catch (error: any) {
    console.error("[Gmail Search API Error]:", error);
    return NextResponse.json({ error: error.message || "Search failed" }, { status: 500 });
  }
}
