import { google } from "googleapis";
import { prisma } from "@/lib/db";
import { getValidTokensHelper } from "./oauth";
import { matchThreadToJob } from "./matching-logic";

const SYNC_PAGE_LIMIT = 100; // Increased from 50 to cover a week of emails

const JOB_KEYWORDS = [
  "job", "interview", "application", "recruiter", "offer", "rejected",
  "hiring", "opportunity", "career", "resume", "cv", "portfolio",
  "onboarding", "joining", "compensation", "position", "shortlisted",
  "assessment", "technical test", "coding challenge", "take-home",
  "salary", "start date", "background check", "reference check",
  "invitation to interview", "thank you for applying", "unfortunately",
  "pleased to inform", "next steps", "talent acquisition", "hr team",
  "screening call", "final round", "offer letter", "rejection",
];

function buildGmailQuery(keywords?: string[], days = 7): string {
  const kws = keywords && keywords.length > 0 ? keywords : JOB_KEYWORDS;
  const keywordClause = kws.map(k => (k.includes(" ") ? `"${k}"` : k)).join(" OR ");
  return `(${keywordClause}) newer_than:${days}d`;
}

export async function syncGmail(
  userId: string,
  options?: { keywords?: string[]; days?: number }
) {
  const gmailQuery = buildGmailQuery(options?.keywords, options?.days ?? 7);
  let account: any = null;
  let skipPrisma = false;
  try {
    
    try {
      account = await (prisma as any).integrationAccount.findUnique({
        where: { userId_provider: { userId, provider: "google" } },
        include: { user: { include: { integrationSettings: true } } }
      });
    } catch (e) {
      console.warn("[Gmail Sync] Prisma unreachable, falling back to local cache.");
      skipPrisma = true;
    }

    // Local Fallback
    if (!account || !account.accessToken || account.status !== "CONNECTED") {
      const { localIntegrationCache } = await import("./local-integration-cache");
      const local = localIntegrationCache.get();
      if (local.account && local.account.status === "CONNECTED") {
        account = {
          ...local.account,
          user: { integrationSettings: local }
        };
      }
    }

    if (!account || !account.accessToken || account.status !== "CONNECTED") {
      throw new Error("No active Google Integration found.");
    }

    // Set sync status to locking (try Prisma, ignore if fail)
    if (!skipPrisma && account.id) {
      try {
        await (prisma as any).integrationAccount.update({
          where: { userId_provider: { userId, provider: "google" } },
          data: { syncStatus: "SYNCING", syncError: null }
        });
      } catch {
        skipPrisma = true;
      }
    }

    const oauth2Client = await getValidTokensHelper(
      account.accessToken, 
      account.refreshToken || "", 
      account.expiresAt instanceof Date ? account.expiresAt.getTime() : account.expiresAt
    );
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    console.log(`[Gmail Sync] Query: ${gmailQuery}`);

    // 1. Fetch relevant threads recently modified or matching queries
    const listRes = await gmail.users.threads.list({
      userId: "me",
      maxResults: SYNC_PAGE_LIMIT,
      q: gmailQuery,
    });

    let threadsSynced = 0;
    const threads = listRes.data.threads || [];
    
    for (const thread of threads) {
      if (!thread.id) continue;

      // 2. Fetch full thread content
      const threadRes = await gmail.users.threads.get({ userId: "me", id: thread.id, format: "full" });
      const threadData = threadRes.data;

      if (!threadData.messages || threadData.messages.length === 0) continue;

      // Check if thread already exists (Try Prisma, fallback to False if fail)
      let dbThread: any = null;
      if (!skipPrisma) {
        try {
          dbThread = await (prisma as any).emailThread.findUnique({
            where: { externalId: thread.id }
          });
        } catch {
          skipPrisma = true;
        }
      }

      // ... [Extraction logic remains same] ...
      const firstMsg = threadData.messages[0];
      const lastMsg = threadData.messages[threadData.messages.length - 1];

      const getHeader = (headers: any[], name: string) => headers?.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || "";

      const getBody = (payload: any): string => {
        let body = "";
        if (payload?.body?.data) {
          body = Buffer.from(payload.body.data, "base64").toString("utf-8");
        } else if (payload?.parts) {
          for (const part of payload.parts) {
            body += getBody(part);
          }
        }
        return body;
      };

      const subject = getHeader(firstMsg.payload?.headers || [], "subject");
      const fromHeader = getHeader(lastMsg.payload?.headers || [], "from");
      const firstDate = new Date(Number(firstMsg.internalDate));
      const lastDate = new Date(Number(lastMsg.internalDate));

      // 3. Match logic
      let matchedJobId = dbThread?.jobId || null;
      let status = "REVIEW";
      let matchConfidence = 0;
      let matchReason = "";

      if (!matchedJobId && account.user?.integrationSettings?.autoMatch) {
         const match = await matchThreadToJob(userId, subject, thread.snippet || "", fromHeader, skipPrisma);
         if (match.jobId) {
            matchedJobId = match.jobId;
            status = "MATCHED";
         }
         matchConfidence = match.confidence;
         matchReason = match.reason;
      }

      // 4. Create or Update Thread (Try Prisma, ignore if fail for now since we have no local thread cache yet)
      if (!skipPrisma) {
        try {
          if (!dbThread) {
            dbThread = await (prisma as any).emailThread.create({
              data: {
                userId,
                externalId: thread.id,
                jobId: matchedJobId,
                subject,
                snippet: thread.snippet,
                firstMessageAt: firstDate,
                lastMessageAt: lastDate,
                messageCount: threadData.messages.length,
                status,
                matchConfidence,
                matchReason
              }
            });
          } else {
            await (prisma as any).emailThread.update({
              where: { id: dbThread.id },
              data: {
                lastMessageAt: lastDate,
                messageCount: threadData.messages.length,
                snippet: thread.snippet,
              }
            });
          }

          // 5. Deduplicate and Insert Messages
          for (const msg of threadData.messages) {
            if (!msg.id) continue;

            const msgExists = await (prisma as any).emailMessage.findUnique({ where: { externalId: msg.id } });
            if (msgExists) continue;

            const mSubject = getHeader(msg.payload?.headers || [], "subject");
            const mFrom = getHeader(msg.payload?.headers || [], "from");
            const mTo = getHeader(msg.payload?.headers || [], "to");
            const mDate = new Date(Number(msg.internalDate));
            const bodyContent = getBody(msg.payload);

            await (prisma as any).emailMessage.create({
              data: {
                threadId: dbThread.id,
                externalId: msg.id,
                subject: mSubject,
                sender: mFrom,
                recipients: mTo.split(",").map((m: string) => m.trim()).filter(Boolean),
                bodyText: bodyContent,
                receivedAt: mDate
              }
            });
          }
        } catch (e) {
          console.warn("[Gmail Sync] Could not save thread/message to DB, skipping persistence step.");
          skipPrisma = true;
        }
      }

      threadsSynced++;
    }

    const lastSyncedAt = new Date();
    // Done Syncing (Try Prisma)
    if (!skipPrisma) {
      try {
        await (prisma as any).integrationAccount.update({
          where: { userId_provider: { userId, provider: "google" } },
          data: { syncStatus: "IDLE", lastSyncedAt }
        });
      } catch {}
    }

    // Update Local Cache
    try {
      const { localIntegrationCache } = await import("@/lib/services/integration/gmail/local-integration-cache");
      const current = localIntegrationCache.get();
      localIntegrationCache.update({ 
        account: { 
          ...current.account!,
          syncStatus: "IDLE", 
          lastSyncedAt: lastSyncedAt.getTime() 
        } 
      });
    } catch (e) {
      console.warn("[Gmail Sync] Failed to update local cache:", e);
    }

    const threadSummaries = [];
    for (const thread of threads.slice(0, 10)) { // Return top 10 for the LLM context
       threadSummaries.push({
         id: thread.id,
         snippet: thread.snippet,
         subject: threads.find(t => t.id === thread.id)?.id // We already have snippet
       });
    }

    return { success: true, count: threadsSynced, threads: threadSummaries };
  } catch (error: any) {
    console.error("[Gmail Sync Error]:", error);
    try {
      if (account?.id) {
        await (prisma as any).integrationAccount.update({
          where: { userId_provider: { userId, provider: "google" } },
          data: { syncStatus: "ERROR", syncError: error.message }
        });
      }
    } catch {}
    
    // Update Local Cache on Error
    try {
      const { localIntegrationCache } = await import("./local-integration-cache");
      const current = localIntegrationCache.get();
      const cleanError = error.message ? error.message.slice(0, 500).replace(/[`]/g, "'") : "Unknown sync error";
      
      localIntegrationCache.update({ 
        account: { 
          ...current.account!,
          syncStatus: "ERROR", 
          syncError: cleanError 
        } 
      });
    } catch (cacheErr) {
      console.error("[Sync Engine] Failed to update local cache with error:", cacheErr);
    }
    return { success: false, error: error.message };
  }
}
