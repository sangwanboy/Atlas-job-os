import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { localIntegrationCache as cache } from "@/lib/services/integration/gmail/local-integration-cache";
import { auth } from "@/auth";

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;

  try {
    // @ts-expect-error
    const account = userId ? await prisma.integrationAccount.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: "google",
        },
      },
      select: {
        status: true,
        // @ts-expect-error
        email: true,
        // @ts-expect-error
        syncStatus: true,
        // @ts-expect-error
        lastSyncedAt: true,
        // @ts-expect-error
        syncError: true,
      },
    }) : null;

    if (account) {
      return NextResponse.json({
        connected: true,
        // @ts-expect-error
        email: account.email,
        status: account.status,
        // @ts-expect-error
        syncStatus: account.syncStatus,
        // @ts-expect-error
        lastSyncedAt: account.lastSyncedAt,
        // @ts-expect-error
        syncError: account.syncError,
      });
    }

    // Check local fallback
    const local = cache.get();
    // @ts-expect-error
    if (local.account) {
      return NextResponse.json({
        connected: true,
        // @ts-expect-error
        email: local.account.email,
        // @ts-expect-error
        status: local.account.status,
        // @ts-expect-error
        syncStatus: local.account.syncStatus,
        // @ts-expect-error
        lastSyncedAt: local.account.lastSyncedAt,
        // @ts-expect-error
        syncError: local.account.syncError,
        isLocal: true
      });
    }

    return NextResponse.json({ connected: false });
  } catch (error) {
    console.warn("[Gmail Status API] Prisma unreachable, checking local fallback.");
    const local = cache.get();
    // @ts-expect-error
    if (local.account) {
      return NextResponse.json({
        connected: true,
        // @ts-expect-error
        email: local.account.email,
        // @ts-expect-error
        status: local.account.status,
        // @ts-expect-error
        syncStatus: local.account.syncStatus,
        // @ts-expect-error
        lastSyncedAt: local.account.lastSyncedAt,
        // @ts-expect-error
        syncError: local.account.syncError,
        isLocal: true,
        dbOffline: true
      });
    }
    return NextResponse.json({ connected: false, dbOffline: true });
  }
}
