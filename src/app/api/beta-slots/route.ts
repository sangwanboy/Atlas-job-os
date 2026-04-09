import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SLOTS_TOTAL = 50;

export async function GET() {
  try {
    const slotsUsed = await prisma.user.count({ where: { role: "USER", status: "ACTIVE" } });
    const slotsRemaining = Math.max(0, SLOTS_TOTAL - slotsUsed);
    return NextResponse.json(
      { slotsUsed, slotsTotal: SLOTS_TOTAL, slotsRemaining, isWaitlist: slotsRemaining === 0 },
      { headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } }
    );
  } catch {
    return NextResponse.json(
      { slotsUsed: 0, slotsTotal: SLOTS_TOTAL, slotsRemaining: SLOTS_TOTAL, isWaitlist: false },
      { headers: { "Cache-Control": "public, max-age=30" } }
    );
  }
}
