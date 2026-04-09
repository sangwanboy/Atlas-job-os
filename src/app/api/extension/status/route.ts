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
    const res = await fetch(`${BROWSER_SERVER_URL}/api/browser`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "extension_status",
        sessionId: session.user.id,
        params: {},
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return NextResponse.json({ connected: false, tabOpen: false });
    }

    const result = await res.json();
    // Browser service wraps payload in result.data
    const payload = result?.data ?? result;
    return NextResponse.json({
      connected: payload?.connected ?? false,
      tabOpen: payload?.tabOpen ?? false,
    });
  } catch {
    return NextResponse.json({ connected: false, tabOpen: false });
  }
}
