import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, isNextResponse } from "@/lib/server/auth-helpers";

export async function POST(request: Request) {
  try {
    const authResult = await requireAuth();
    if (isNextResponse(authResult)) return authResult;
    const { userId } = authResult;

    // Get all jobs for this user with minimal fields for dedup comparison
    const jobs = await prisma.job.findMany({
      where: { userId },
      select: { id: true, title: true, location: true, source: true, createdAt: true },
      orderBy: { createdAt: "asc" }, // keep oldest, delete newer dupes
    });

    // Group by normalised title + location + source
    const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().trim().replace(/\s+/g, " ");
    const seen = new Map<string, string>(); // key → first id to keep
    const toDelete: string[] = [];

    for (const job of jobs) {
      const key = `${norm(job.title)}||${norm(job.location)}||${norm(job.source)}`;
      if (seen.has(key)) {
        toDelete.push(job.id);
      } else {
        seen.set(key, job.id);
      }
    }

    if (toDelete.length === 0) {
      return NextResponse.json({ removed: 0, message: "No duplicates found." });
    }

    // Delete scores first (FK constraint), then jobs
    await prisma.jobScore.deleteMany({ where: { jobId: { in: toDelete } } });
    const { count } = await prisma.job.deleteMany({ where: { id: { in: toDelete }, userId } });

    return NextResponse.json({
      removed: count,
      message: `Removed ${count} duplicate job${count !== 1 ? "s" : ""}. Your pipeline is now clean.`,
    });
  } catch (err) {
    console.error("[deduplicate]", err);
    return NextResponse.json({ error: "Failed to deduplicate jobs" }, { status: 500 });
  }
}
