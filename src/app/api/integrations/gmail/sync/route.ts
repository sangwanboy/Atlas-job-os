import { NextResponse } from "next/server";
import { syncGmail } from "@/lib/services/integration/gmail/sync-engine";

const HARDCODED_USER_ID = "cm7c10bsw000008ld6v3cct9q";

// Forced recompile to pick up fast-fail offline timeout prevention
export async function POST() {

  try {
    const result = await syncGmail(HARDCODED_USER_ID);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }
    return NextResponse.json({ success: true, count: result.count });
  } catch (error: any) {
    console.error("[Manual Sync Triger Error]:", error);
    return NextResponse.json({ success: false, error: "Database unavailable or Token invalid" }, { status: 503 });
  }
}
