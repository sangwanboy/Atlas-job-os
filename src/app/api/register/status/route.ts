import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const email = request.nextUrl.searchParams.get("email");
  if (!email) return NextResponse.json({ status: "unknown" });

  const user = await prisma.user.findUnique({
    where: { email },
    select: { status: true },
  });

  // Only reveal PENDING status — everything else returns "unknown" to prevent email enumeration
  if (user?.status === "PENDING") {
    return NextResponse.json({ status: "PENDING" });
  }
  return NextResponse.json({ status: "unknown" });
}
