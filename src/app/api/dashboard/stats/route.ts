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
    // Total Pipeline = staged/discovered jobs not yet imported (local cache)
    // Jobs Saved = jobs imported into the jobs table (DB)
    const finalTotal = cachedJobs.length;
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
        delta: "Discovered",
        trend: "up" as const,
      },
      {
        label: "Jobs Saved",
        value: finalNew.toString(),
        delta: "Shortlisted",
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
        applied,
        interviews: interviewing,
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
