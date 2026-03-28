import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { localJobsCache } from "@/lib/services/jobs/local-jobs-cache";

export async function GET() {
  try {
    // 1. Fetch from Local Cache (Most resilient for Dev)
    const cachedJobs = localJobsCache.list();
    
    // 2. Attempt to fetch from Prisma — queries run in parallel
    let dbJobsCount = 0;
    let dbNewCount = 0;
    try {
      const yesterday = new Date();
      yesterday.setHours(yesterday.getHours() - 24);

      const user = await prisma.user.findFirst({
        where: { email: "local-dev-user@ai-job-os.local" },
        select: { id: true },
      });
      if (user) {
        [dbJobsCount, dbNewCount] = await Promise.all([
          prisma.job.count({ where: { userId: user.id } }),
          prisma.job.count({ where: { userId: user.id, createdAt: { gte: yesterday } } }),
        ]);
      }
    } catch (e) {
      console.warn("Prisma stats failed, falling back to cache:", e);
    }

    // 3. Resolve Metrics (Prefer real discovery data from Cache if DB is empty)
    const finalTotal = Math.max(dbJobsCount, cachedJobs.length);
    const finalNew = Math.max(dbNewCount, cachedJobs.filter(j => {
      const d = new Date(j.postedAt || 0);
      return d.getTime() > (Date.now() - 86400000);
    }).length);
    const applied = cachedJobs.filter(j => j.status === "APPLIED").length;
    const interviewing = cachedJobs.filter(j => j.status === "INTERVIEW").length;

    const kpiMetrics = [
      {
        label: "Total Pipeline",
        value: finalTotal.toString(),
        delta: "Real-time",
        trend: "up" as const,
      },
      {
        label: "New Discovered",
        value: finalNew.toString(),
        delta: "Last 24h",
        trend: finalNew > 0 ? "up" : "flat",
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

    // 4. Generate Weekly Trend (Last 7 Days from Discovery)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (6 - i));
      return d;
    });

    const weeklyTrend = last7Days.map((date) => {
      return {
        date: date.toLocaleDateString("en-US", { weekday: "short" }),
        applied: cachedJobs.filter(j => j.status === "APPLIED").length, // Simple mock for trend until history is deeper
        interviews: cachedJobs.filter(j => j.status === "INTERVIEW").length,
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
