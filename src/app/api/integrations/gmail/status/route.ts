import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { localIntegrationCache as cache } from "@/lib/services/integration/gmail/local-integration-cache";
import { auth } from "@/auth";

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;

  try {
    const account = userId ? await (prisma as any).integrationAccount.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: "google",
        },
      },
      select: {
        status: true,
        email: true,
        syncStatus: true,
        lastSyncedAt: true,
        syncError: true,
      },
    }) : null;

    if (account) {
      return NextResponse.json({
        connected: true,
        email: (account as any).email,
        status: account.status,
        syncStatus: (account as any).syncStatus,
        lastSyncedAt: (account as any).lastSyncedAt,
        syncError: (account as any).syncError,
      });
    }

    // Check local fallback
    const local = cache.get();
    if ((local as any).account) {
      return NextResponse.json({
        connected: true,
        email: (local as any).account.email,
        status: (local as any).account.status,
        syncStatus: (local as any).account.syncStatus,
        lastSyncedAt: (local as any).account.lastSyncedAt,
        syncError: (local as any).account.syncError,
        isLocal: true
      });
    }

    return NextResponse.json({ connected: false });
  } catch (error) {
    console.warn("[Gmail Status API] Prisma unreachable, checking local fallback.");
    const local = cache.get();
    if ((local as any).account) {
      return NextResponse.json({
        connected: true,
        email: (local as any).account.email,
        status: (local as any).account.status,
        syncStatus: (local as any).account.syncStatus,
        lastSyncedAt: (local as any).account.lastSyncedAt,
        syncError: (local as any).account.syncError,
        isLocal: true,
        dbOffline: true
      });
    }
    return NextResponse.json({ connected: false, dbOffline: true });
  }
}
