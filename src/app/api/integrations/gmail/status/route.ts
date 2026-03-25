import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { localIntegrationCache as cache } from "@/lib/services/integration/gmail/local-integration-cache";

const HARDCODED_USER_ID = "cm7c10bsw000008ld6v3cct9q";

export async function GET() {
  try {
    // @ts-ignore
    const account = await prisma.integrationAccount.findUnique({
      where: {
        userId_provider: {
          userId: HARDCODED_USER_ID,
          provider: "google",
        },
      },
      select: {
        status: true,
        // @ts-ignore
        email: true,
        // @ts-ignore
        syncStatus: true,
        // @ts-ignore
        lastSyncedAt: true,
        // @ts-ignore
        syncError: true,
      },
    });

    if (account) {
      return NextResponse.json({
        connected: true,
        // @ts-ignore
        email: account.email,
        status: account.status,
        // @ts-ignore
        syncStatus: account.syncStatus,
        // @ts-ignore
        lastSyncedAt: account.lastSyncedAt,
        // @ts-ignore
        syncError: account.syncError,
      });
    }

    // Check local fallback
    const local = cache.get();
    // @ts-ignore
    if (local.account) {
      return NextResponse.json({
        connected: true,
        // @ts-ignore
        email: local.account.email,
        // @ts-ignore
        status: local.account.status,
        // @ts-ignore
        syncStatus: local.account.syncStatus,
        // @ts-ignore
        lastSyncedAt: local.account.lastSyncedAt,
        // @ts-ignore
        syncError: local.account.syncError,
        isLocal: true
      });
    }

    return NextResponse.json({ connected: false });
  } catch (error) {
    console.warn("[Gmail Status API] Prisma unreachable, checking local fallback.");
    const local = cache.get();
    // @ts-ignore
    if (local.account) {
      return NextResponse.json({
        connected: true,
        // @ts-ignore
        email: local.account.email,
        // @ts-ignore
        status: local.account.status,
        // @ts-ignore
        syncStatus: local.account.syncStatus,
        // @ts-ignore
        lastSyncedAt: local.account.lastSyncedAt,
        // @ts-ignore
        syncError: local.account.syncError,
        isLocal: true,
        dbOffline: true
      });
    }
    return NextResponse.json({ connected: false, dbOffline: true });
  }
}
