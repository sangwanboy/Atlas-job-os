import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, isNextResponse } from "@/lib/server/auth-helpers";
import { getRedis } from "@/lib/redis";

export async function GET() {
  try {
    const authResult = await requireAuth();
    if (isNextResponse(authResult)) return authResult;
    const { userId } = authResult;

    // 1. Attempt to fetch from Prisma — queries run in parallel
    let dbJobsCount = 0;
    try {
      dbJobsCount = await prisma.job.count({ where: { userId } });
    } catch (e) {
      console.warn("Prisma stats failed, falling back to cache:", e);
    }

    // 3. Resolve Metrics
    // Pipeline  = pending/staged jobs not yet imported (from Redis, session-scoped best-effort)
    // Jobs Saved = jobs actually imported to DB
    let pipelineCount = 0;
    try {
      const r = getRedis();
      const keys = await r.keys("pending:session:*");
      if (keys.length > 0) {
        const vals = await r.mget(...keys);
        pipelineCount = vals.reduce((sum, v) => {
          if (!v) return sum;
          try {
            const jobs = JSON.parse(v) as { isAlreadyImported?: boolean }[];
            return sum + jobs.filter(j => !j.isAlreadyImported).length;
          } catch { return sum; }
        }, 0);
      }
    } catch { /* Redis unavailable — pipeline shows 0 */ }

    // Collapse applied/interviews into one query
    let applied = 0;
    let interviewing = 0;
    try {
      const statusCounts = await prisma.job.groupBy({
        by: ["applicationStatus"],
        where: { userId, applicationStatus: { in: ["APPLIED", "INTERVIEW"] } },
        _count: { id: true },
      });
      for (const row of statusCounts) {
        if (row.applicationStatus === "APPLIED") applied = row._count.id;
        if (row.applicationStatus === "INTERVIEW") interviewing = row._count.id;
      }
    } catch { /* fall through with 0s */ }

    const finalTotal = pipelineCount;
    const finalNew = dbJobsCount;

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
