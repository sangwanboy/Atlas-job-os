import { NextResponse } from "next/server";
import { getAuthorizationUrl } from "@/lib/services/integration/gmail/oauth";

export async function GET() {
  try {
    const url = await getAuthorizationUrl();
    return NextResponse.redirect(url);
  } catch (error: unknown) {
    console.error("[Gmail Connect Error]:", error);
    // Redirect back to settings with an error parameter
    return NextResponse.redirect(new URL("/settings?error=ConfigurationMissing", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"));
  }
}
