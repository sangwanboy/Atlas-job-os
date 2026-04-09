import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const HARDCODED_USER_ID = "cm7c10bsw000008ld6v3cct9q";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: jobId } = await params;

    // @ts-expect-error
    const threads = await prisma.emailThread.findMany({
      where: {
        userId: HARDCODED_USER_ID,
        jobId: jobId,
        status: "MATCHED"
      },
      include: {
        messages: {
          orderBy: { receivedAt: "desc" }
        }
      },
      orderBy: { lastMessageAt: "desc" }
    });

    return NextResponse.json({ threads });
  } catch (error) {
    console.error("[Job Emails Get Error]:", error);
    return NextResponse.json({ error: "Failed to fetch job emails" }, { status: 500 });
  }
}
