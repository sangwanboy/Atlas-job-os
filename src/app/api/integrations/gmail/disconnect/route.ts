import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOAuth2Client } from "@/lib/services/integration/gmail/oauth";
import { auth } from "@/auth";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  try {
    const account = await prisma.integrationAccount.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: "google",
        },
      },
    });

    // If no account exists, treat as already disconnected — return success
    if (!account) {
      return NextResponse.json({ success: true, message: "Already disconnected." });
    }

    if (account.accessToken) {
      // Optional: Proactively revoke the token on Google's side
      try {
        const oauth2Client = await getOAuth2Client();
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
          userId,
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
