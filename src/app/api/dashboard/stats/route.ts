import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { localJobsCache } from "@/lib/services/jobs/local-jobs-cache";
import { requireAuth, isNextResponse } from "@/lib/server/auth-helpers";

export async function GET() {
  try {
    const authResult = await requireAuth();
    if (isNextResponse(authResult)) return authResult;
    const { userId } = authResult;

    // 1. Fetch from Local Cache (Most resilient for Dev)
    const cachedJobs = localJobsCache.list();

    // 2. Attempt to fetch from Prisma — queries run in parallel
    let dbJobsCount = 0;
    try {
      dbJobsCount = await prisma.job.count({ where: { userId } });
    } catch (e) {
      console.warn("Prisma stats failed, falling back to cache:", e);
    }

    // 3. Resolve Metrics
    // Pipeline  = pending/staged jobs not yet imported (temp, from pendingJobsStore across all sessions)
    // Jobs Saved = jobs actually imported to DB by Atlas
    const pendingStore: Map<string, { isAlreadyImported?: boolean }[]> =
      (globalThis as any).__pendingJobsStore ?? new Map();
    const pipelineCount = Array.from(pendingStore.values())
      .reduce((sum, jobs) => sum + jobs.filter(j => !j.isAlreadyImported).length, 0);
    const finalTotal = pipelineCount;
    const finalNew = dbJobsCount;
    let applied = 0;
    let interviewing = 0;
    try {
      [applied, interviewing] = await Promise.all([
        prisma.job.count({ where: { userId, applicationStatus: "APPLIED" } }),
        prisma.job.count({ where: { userId, applicationStatus: "INTERVIEW" } }),
      ]);
    } catch {
      // fall through with 0s
    }

    const kpiMetrics = [
      {
        label: "Pipeline",
        value: finalTotal.toString(),
        delta: finalTotal > 0 ? "Pending import" : "Empty",
        trend: finalTotal > 0 ? ("up" as const) : ("flat" as const),
      },
      {
        label: "Jobs Saved",
        value: finalNew.toString(),
        delta: "Imported",
        trend: finalNew > 0 ? ("up" as const) : ("flat" as const),
      },
      {
        label: "Applied",
        value: applied.toString(),
        delta: "Active",
        trend: "flat",
      },
      {
        label: "Interviews",
        value: interviewing.toString(),
        delta: "Scheduled",
        trend: interviewing > 0 ? "up" : "flat",
      },
    ];

    // 4. Generate Weekly Trend (Last 7 Days)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (6 - i));
      return d;
    });

    // Fetch all jobs created in the last 7 days in one query, then bin by day in memory
    let recentJobs: { createdAt: Date; applicationStatus: string | null }[] = [];
    try {
      recentJobs = await prisma.job.findMany({
        where: { userId, createdAt: { gte: last7Days[0] } },
        select: { createdAt: true, applicationStatus: true },
      });
    } catch { /* fall through with empty */ }

    const weeklyTrend = last7Days.map((date) => {
      const nextDay = new Date(date);
      nextDay.setDate(date.getDate() + 1);
      const dayJobs = recentJobs.filter(j => j.createdAt >= date && j.createdAt < nextDay);
      return {
        date: date.toLocaleDateString("en-US", { weekday: "short" }),
        saved: dayJobs.length,
        applied: dayJobs.filter(j => j.applicationStatus === "APPLIED").length,
        interviews: dayJobs.filter(j => j.applicationStatus === "INTERVIEW").length,
        replies: 0,
      };
    });

    return NextResponse.json({ kpiMetrics, weeklyTrend }, {
      headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" },
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    return NextResponse.json({ kpiMetrics: [], weeklyTrend: [] });
  }
}
