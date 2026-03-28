// Edge-compatible auth middleware — uses auth.config.ts (no Credentials provider, no DB)
// The `authorized` callback handles route protection logic
import NextAuth from "next-auth"
import authConfig from "./auth.config"

export const { auth: middleware } = NextAuth(authConfig)

export const config = {
  // Only run on app pages — skip API routes, static assets, auth pages
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|api/|login|register|public/).*)',
  ],
}
