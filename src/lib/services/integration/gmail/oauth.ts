import { google } from "googleapis";
import { prisma } from "@/lib/db";
import { localIntegrationCache } from "./local-integration-cache";

const GOOGLE_REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3000"}/api/integrations/gmail/callback`;
const HARDCODED_USER_ID = "cm7c10bsw000008ld6v3cct9q";

// Ensure environment variables are loaded (legacy/env-first)

/**
 * Fetches OAuth credentials from either environment variables or the database.
 */
export async function getCredentials() {
  const envClientId = process.env.GOOGLE_CLIENT_ID || "";
  const envClientSecret = process.env.GOOGLE_CLIENT_SECRET || "";

  if (envClientId && envClientSecret) {
    return { clientId: envClientId, clientSecret: envClientSecret };
  }

  try {
    // @ts-ignore - integrationSettings might not be in the generated client yet
    const settings = await prisma.integrationSettings.findUnique({
      where: { userId: HARDCODED_USER_ID },
    });

    if (settings?.googleClientId && settings?.googleClientSecret) {
      return {
        clientId: settings.googleClientId,
        clientSecret: settings.googleClientSecret,
      };
    }
  } catch (error) {
    console.warn("[Gmail OAuth] Prisma unreachable during credential fetch, falling back to local cache.");
  }

  // Final fallback to local cache
  const local = localIntegrationCache.get();
  console.log("[Gmail OAuth] DEBUG - Full local object:", JSON.stringify(local));

  if (local.googleClientId && local.googleClientSecret) {
    return {
      clientId: local.googleClientId,
      clientSecret: local.googleClientSecret,
    };
  }

  console.error("[Gmail OAuth] No Google credentials found. Checked keys:", Object.keys(local));
  throw new Error("ConfigurationMissing");
}

export async function getOAuth2Client() {
  const { clientId, clientSecret } = await getCredentials();

  return new google.auth.OAuth2(
    clientId,
    clientSecret,
    GOOGLE_REDIRECT_URI
  );
}

export async function getAuthorizationUrl() {
  const oauth2Client = await getOAuth2Client();

  const scopes = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.labels",
  ];

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // Forces refresh token on every manual auth
    scope: scopes,
  });
}

export async function exchangeCodeForTokens(code: string) {
  const oauth2Client = await getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

export async function getValidTokensHelper(accessToken: string, refreshToken: string, expiryDate?: number) {
  const oauth2Client = await getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: expiryDate,
  });

  // Check if token is expired or about to expire in 5 minutes
  const isExpired = expiryDate ? (expiryDate - Date.now() < 5 * 60 * 1000) : true;

  if (isExpired && refreshToken) {
    console.log("[Gmail OAuth] Token expired or nearing expiry, refreshing...");
    try {
      // @ts-ignore
      const { credentials } = await oauth2Client.refreshAccessToken();
      const newAccessToken = credentials.access_token;
      const newExpiryDate = credentials.expiry_date;

      if (newAccessToken && newExpiryDate) {
        console.log("[Gmail OAuth] Successfully refreshed token. Persisting...");
        
        // Update Local Cache
        localIntegrationCache.update({
          account: {
            accessToken: newAccessToken,
            expiresAt: newExpiryDate,
            status: "CONNECTED"
          }
        });

        // Try Update Prisma
        try {
          // @ts-ignore
          await prisma.integrationAccount.update({
            where: { 
              // Using a safer approach for unique selection if composite key type is failing
              userId_provider: { userId: HARDCODED_USER_ID, provider: "google" } 
            },
            data: { 
              // @ts-ignore
              accessToken: newAccessToken, 
              // @ts-ignore
              expiresAt: new Date(newExpiryDate) 
            }
          });
        } catch (dbError) {
          console.warn("[Gmail OAuth] Failed to persist refreshed token to DB (but local cache updated):", dbError);
        }

        // Apply new credentials to client
        oauth2Client.setCredentials(credentials);
      }
    } catch (refreshError) {
      console.error("[Gmail OAuth] Critical failure during token refresh:", refreshError);
      throw refreshError;
    }
  }

  return oauth2Client;
}
