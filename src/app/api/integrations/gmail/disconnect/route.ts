import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOAuth2Client } from "@/lib/services/integration/gmail/oauth";

const HARDCODED_USER_ID = "cm7c10bsw000008ld6v3cct9q";

export async function POST() {
  try {
    const account = await prisma.integrationAccount.findUnique({
      where: {
        userId_provider: {
          userId: HARDCODED_USER_ID,
          provider: "google",
        },
      },
    });

    if (account?.accessToken) {
      // Optional: Proactively revoke the token on Google's side
      try {
        const oauth2Client = getOAuth2Client();
        await oauth2Client.revokeToken(account.accessToken);
      } catch (revokeError) {
        console.warn("[Gmail Revoke Token Error]:", revokeError);
        // We still proceed to scrub the database even if the external revocation fails
      }
    }

    // Scrub integration account
    await prisma.integrationAccount.delete({
      where: {
        userId_provider: {
          userId: HARDCODED_USER_ID,
          provider: "google",
        },
      },
    });

    return NextResponse.json({ success: true, message: "Disconnected successfully." });
  } catch (error) {
    console.error("[Gmail Disconnect Error]:", error);
    return NextResponse.json({ success: false, error: "Database unavailable" }, { status: 503 });
  }
}
