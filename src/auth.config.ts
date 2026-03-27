import Credentials from "next-auth/providers/credentials"
import type { NextAuthConfig } from "next-auth"

export default {
  providers: [],
  pages: {
    signIn: '/login',
  },
  callbacks: {
    authorized({ request, auth }) {
      const { pathname } = request.nextUrl
      // Allow all API routes — they handle their own auth internally
      if (pathname.startsWith('/api/')) return true
      // Allow login and register pages
      if (pathname === '/login' || pathname === '/register') return true
      // Require auth for all app routes
      return !!auth
    },
    jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        session.user.role = token.role as "USER" | "ADMIN"
      }
      return session
    },
  },
} satisfies NextAuthConfig
