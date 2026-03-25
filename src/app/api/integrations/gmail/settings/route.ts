import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { localIntegrationCache } from "@/lib/services/integration/gmail/local-integration-cache";

const HARDCODED_USER_ID = "cm7c10bsw000008ld6v3cct9q";

export async function GET() {
  try {
    // Try Prisma first
    // @ts-ignore
    const settings = await prisma.integrationSettings.findUnique({
      where: { userId: HARDCODED_USER_ID },
    });

    if (settings) {
      return NextResponse.json({
        googleClientId: settings.googleClientId || "",
        googleClientSecret: settings.googleClientSecret || "",
        autoMatch: settings.autoMatch,
        draftFirstMode: settings.draftFirstMode,
      });
    }
  } catch (error) {
    console.warn("[Gmail Settings API] Prisma unreachable, falling back to local cache.");
  }

  // Fallback to local cache
  const local = localIntegrationCache.get();
  return NextResponse.json(local);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { googleClientId, googleClientSecret, autoMatch, draftFirstMode } = body;

  // Always save to local cache for resilience
  localIntegrationCache.save({ googleClientId, googleClientSecret, autoMatch, draftFirstMode });

  try {
    const settings = await prisma.integrationSettings.upsert({
      where: { userId: HARDCODED_USER_ID },
      create: {
        userId: HARDCODED_USER_ID,
        googleClientId,
        googleClientSecret,
        autoMatch: autoMatch ?? true,
        draftFirstMode: draftFirstMode ?? true,
      },
      update: {
        googleClientId,
        googleClientSecret,
        autoMatch: autoMatch ?? true,
        draftFirstMode: draftFirstMode ?? true,
      },
    });
    return NextResponse.json(settings);
  } catch (error) {
    console.error("[Gmail Settings API] Failed to save to DB, but saved to local cache.");
    return NextResponse.json(localIntegrationCache.get());
  }
}
