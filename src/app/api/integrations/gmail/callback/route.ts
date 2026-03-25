import { NextResponse } from "next/server";
import { exchangeCodeForTokens, getValidTokensHelper } from "@/lib/services/integration/gmail/oauth";
import { prisma } from "@/lib/db";
import { google } from "googleapis";

// In production, we would get this from active session auth
const HARDCODED_USER_ID = "cm7c10bsw000008ld6v3cct9q"; 

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

  try {
    const tokens = await exchangeCodeForTokens(code);
    
    // Fetch user email to verify identity and store visually
    const oauth2Client = await getValidTokensHelper(tokens.access_token!, tokens.refresh_token!, tokens.expiry_date || undefined);
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const profile = await gmail.users.getProfile({ userId: "me" });
    const emailAddress = profile.data.emailAddress || "unknown@gmail.com";

    // Attempt to persist the tokens in the database
    try {
      // @ts-ignore
      await prisma.integrationAccount.upsert({
        where: {
          // @ts-ignore
          userId_provider: {
            userId: HARDCODED_USER_ID,
            provider: "google",
          },
        },
        create: {
          userId: HARDCODED_USER_ID,
          provider: "google",
          // @ts-ignore
          email: emailAddress,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token || null,
          // @ts-ignore
          expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          scopes: tokens.scope,
          status: "CONNECTED",
          syncStatus: "IDLE",
        },
        update: {
          // @ts-ignore
          email: emailAddress,
          accessToken: tokens.access_token,
          ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
          // @ts-ignore
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

  } catch (err: any) {
    console.error("[Gmail Code Exchange Error]:", err);
    return NextResponse.redirect(`${appUrl}/settings?error=TokenExchangeFailed`);
  }
}
