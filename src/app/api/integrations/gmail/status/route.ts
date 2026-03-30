import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { localIntegrationCache as cache } from "@/lib/services/integration/gmail/local-integration-cache";
import { auth } from "@/auth";

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;

  try {
    // @ts-ignore
    const account = userId ? await prisma.integrationAccount.findUnique({
      where: {
        userId_provider: {
          userId,
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
    }) : null;

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
