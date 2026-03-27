import NextAuth from "next-auth"
import authConfig from "./auth.config"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const { auth } = NextAuth(authConfig)

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Always allow: API routes, static assets, auth pages
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname === '/login' ||
    pathname === '/register' ||
    pathname === '/favicon.ico' ||
    pathname.startsWith('/public/')
  ) {
    return NextResponse.next()
  }

  // For app routes, require a valid session
  const session = await auth(request as any)
  if (!session) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('callbackUrl', request.url)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
