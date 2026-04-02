import { NextResponse } from "next/server";
import { exchangeCodeForTokens, getValidTokensHelper } from "@/lib/services/integration/gmail/oauth";
import { prisma } from "@/lib/db";
import { google } from "googleapis";
import { auth } from "@/auth";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (error) {
    return NextResponse.redirect(`${appUrl}/settings?error=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return NextResponse.redirect(`${appUrl}/settings?error=NoCodeProvided`);
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/settings?error=Unauthorized`);
  }
  const userId = session.user.id;

  try {
    const tokens = await exchangeCodeForTokens(code);

    // Fetch user email to verify identity and store visually
    const oauth2Client = await getValidTokensHelper(tokens.access_token!, tokens.refresh_token!, tokens.expiry_date || undefined);
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const profile = await gmail.users.getProfile({ userId: "me" });
    const emailAddress = profile.data.emailAddress || "unknown@gmail.com";

    // Attempt to persist the tokens in the database
    try {
      await prisma.integrationAccount.upsert({
        where: {
          userId_provider: {
            userId,
            provider: "google",
          },
        },
        create: {
          userId,
          provider: "google",
          email: emailAddress,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token || null,
          expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          scopes: tokens.scope,
          status: "CONNECTED",
          syncStatus: "IDLE",
        },
        update: {
          email: emailAddress,
          accessToken: tokens.access_token,
          ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
          expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          scopes: tokens.scope,
          status: "CONNECTED",
          syncStatus: "IDLE",
        },
      });
      
      return NextResponse.redirect(`${appUrl}/settings/success?message=GmailConnected`);
    } catch (dbError) {
      console.warn("[Gmail Callback DB Error] Falling back to local cache:", dbError);
      
      // Save to local cache instead
      const { localIntegrationCache } = await import("@/lib/services/integration/gmail/local-integration-cache");
      localIntegrationCache.saveAccount({
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token || undefined,
        expiresAt: tokens.expiry_date || undefined,
        email: emailAddress,
        status: "CONNECTED",
      });

      return NextResponse.redirect(`${appUrl}/settings?success=GmailConnectedLocal`);
    }

  } catch (err: unknown) {
    console.error("[Gmail Code Exchange Error]:", err);
    return NextResponse.redirect(`${appUrl}/settings?error=TokenExchangeFailed`);
  }
}
