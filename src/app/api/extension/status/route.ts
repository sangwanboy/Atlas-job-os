import { NextResponse } from "next/server";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

const BROWSER_SERVER_URL = process.env.BROWSER_SERVER_URL || "http://localhost:3001";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const res = await fetch(`${BROWSER_SERVER_URL}/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        command: "extension_status",
        sessionId: session.user.id,
        params: {},
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return NextResponse.json({ connected: false, tabOpen: false });
    }

    const data = await res.json();
    return NextResponse.json({
      connected: data?.connected ?? false,
      tabOpen: data?.tabOpen ?? false,
    });
  } catch {
    return NextResponse.json({ connected: false, tabOpen: false });
  }
}
