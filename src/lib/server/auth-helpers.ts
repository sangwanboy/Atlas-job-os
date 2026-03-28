import { auth } from "@/auth";
import { NextResponse } from "next/server";

export type AuthSession = { userId: string; email: string; role: "USER" | "ADMIN" };

export async function requireAuth(): Promise<AuthSession | NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return {
    userId: session.user.id,
    email: session.user.email!,
    role: (session.user.role as "USER" | "ADMIN") ?? "USER",
  };
}

export function isNextResponse(val: unknown): val is NextResponse {
  return val instanceof NextResponse;
}
