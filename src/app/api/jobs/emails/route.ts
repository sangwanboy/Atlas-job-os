import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";

// Atlas uses this to link email threads to jobs
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { jobId, threadId } = body;

    if (!jobId || !threadId) {
      return NextResponse.json({ success: false, error: "jobId and threadId required" }, { status: 400 });
    }

    // @ts-ignore
    await prisma.emailThread.update({
      where: { externalId: threadId },
      data: { jobId, status: "MATCHED" },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    // Thread may not exist yet — not a fatal error
    console.warn("[Jobs/Emails] Could not link thread:", error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("jobId");

  try {
    // @ts-ignore
    const threads = await prisma.emailThread.findMany({
      where: { userId: session.user.id, ...(jobId ? { jobId } : {}) },
      orderBy: { lastMessageAt: "desc" },
      take: 20,
    });

    return NextResponse.json({ success: true, threads });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
