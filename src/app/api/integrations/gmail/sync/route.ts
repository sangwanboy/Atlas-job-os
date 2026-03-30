import { NextResponse } from "next/server";
import { syncGmail } from "@/lib/services/integration/gmail/sync-engine";
import { auth } from "@/auth";

export async function POST(req: Request) {
  const session = await auth();

  // Accept userId from body for internal (server-side) agent calls that have no session cookie
  let userId = session?.user?.id;
  if (!userId) {
    try {
      const body = await req.json();
      userId = body?.userId;
    } catch {}
  }

  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncGmail(userId);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }
    return NextResponse.json({ success: true, count: result.count });
  } catch (error: any) {
    console.error("[Manual Sync Triger Error]:", error);
    return NextResponse.json({ success: false, error: "Database unavailable or Token invalid" }, { status: 503 });
  }
}
