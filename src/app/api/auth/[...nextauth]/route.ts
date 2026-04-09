import { handlers } from "@/auth"
import { NextRequest, NextResponse } from "next/server"
import { rateLimit, getClientIP } from "@/lib/rate-limit"

const LOGIN_LIMIT = 5;          // max attempts
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function withLoginRateLimit(handler: (req: NextRequest) => Promise<Response>) {
  return async (req: NextRequest) => {
    // Only rate-limit credential login POSTs
    if (req.method === "POST") {
      const url = new URL(req.url);
      const isCallback = url.pathname.includes("/callback/credentials");
      const isSignin = url.pathname.includes("/signin");

      if (isCallback || isSignin) {
        const ip = getClientIP(req);
        const result = rateLimit("login", ip, LOGIN_LIMIT, LOGIN_WINDOW_MS);

        if (!result.allowed) {
          return NextResponse.json(
            {
              error: "Too many login attempts. Please try again later.",
              retryAfterSeconds: Math.ceil(result.retryAfterMs / 1000),
            },
            {
              status: 429,
              headers: {
                "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)),
              },
            }
          );
        }
      }
    }
    return handler(req as any);
  };
}

export const GET = handlers.GET
export const POST = withLoginRateLimit(handlers.POST as any)
