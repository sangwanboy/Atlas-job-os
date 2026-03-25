import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { mapSearchResultToCreatePayload } from "@/lib/services/jobs/job-row-mapper";
import { localJobsCache } from "@/lib/services/jobs/local-jobs-cache";
import { scoreJob } from "@/lib/services/jobs/scoring-engine";
// Note: searchJobs legacy import removed to fix build error.

const searchSchema = z.object({
  keywords: z.string().min(1),
  location: z.string().min(1),
  resultsPerPage: z.number().int().min(1).max(20).optional(),
});

function parseSalaryBounds(salary: string): { salaryMin?: number; salaryMax?: number } {
  const values = salary.match(/\d[\d,.]*/g)?.map((part) => Number(part.replace(/,/g, ""))).filter(Number.isFinite) ?? [];
  if (values.length === 0) {
    return {};
  }
  if (values.length === 1) {
    return { salaryMin: Math.round(values[0]) };
  }
  return { salaryMin: Math.round(values[0]), salaryMax: Math.round(values[1]) };
}

async function ensureLocalDevUser() {
  return prisma.user.upsert({
    where: { email: "local-dev-user@ai-job-os.local" },
    update: { name: "Local Dev User" },
    create: {
      email: "local-dev-user@ai-job-os.local",
      name: "Local Dev User",
    },
    select: { id: true },
  });
}

async function ensureCompany(name: string) {
  const existing = await prisma.company.findFirst({
    where: { name },
    select: { id: true },
  });

  if (existing) {
    return existing;
  }

  return prisma.company.create({
    data: { name },
    select: { id: true },
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as unknown;
    const payload = searchSchema.parse(body);

    // LEGACY ALERT: The job_search API is retired.
    // All job discovery is now handled by Atlas via Browser Navigation.
    return NextResponse.json({
      success: true,
      message: "Legacy API search is disabled. Please use Atlas Browser Discovery for live results.",
      importedCount: 0,
      results: [],
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : "Job search failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
