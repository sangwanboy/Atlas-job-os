import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { applicationStatuses, priorities } from "@/lib/domain/enums";
import { mapDbJobToRow } from "@/lib/services/jobs/job-row-mapper";
import { localJobsCache } from "@/lib/services/jobs/local-jobs-cache";
import { requireAuth, isNextResponse } from "@/lib/server/auth-helpers";

const createJobSchema = z.object({
  title: z.string().min(1),
  company: z.string().min(1),
  location: z.string().min(1),
  salary: z.string().optional(),
  url: z.string().optional(),
  source: z.string().min(1),
  status: z.enum(applicationStatuses).optional(),
  priority: z.enum(priorities).optional(),
  description: z.string().optional(),
  skills: z.string().optional(),
  datePosted: z.string().optional(),
  score: z.number().optional(),
});

function safeParseDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return isNaN(d.getTime()) ? undefined : d;
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

function parseSalaryBounds(salary?: string): { salaryMin?: number; salaryMax?: number } {
  if (!salary) {
    return {};
  }

  const values = salary.match(/\d[\d,.]*/g)?.map((part) => Number(part.replace(/,/g, ""))).filter(Number.isFinite) ?? [];
  if (values.length === 0) {
    return {};
  }
  if (values.length === 1) {
    return { salaryMin: Math.round(values[0]) };
  }
  return { salaryMin: Math.round(values[0]), salaryMax: Math.round(values[1]) };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const checkUrls = searchParams.getAll("checkUrl");

    // Internal dedup check — agent passes userId via header, no session cookie needed
    const internalUserId = request.headers.get("x-internal-user-id");
    if (checkUrls.length > 0 && internalUserId) {
      const existing = await prisma.job.findMany({
        where: { sourceUrl: { in: checkUrls }, userId: internalUserId },
        select: { sourceUrl: true },
      });
      return NextResponse.json({ existingUrls: existing.map((j) => j.sourceUrl) });
    }

    const authResult = await requireAuth();
    if (isNextResponse(authResult)) return authResult;
    const { userId } = authResult;

    if (checkUrls.length > 0) {
      const existing = await prisma.job.findMany({
        where: { sourceUrl: { in: checkUrls }, userId },
        select: { sourceUrl: true },
      });
      return NextResponse.json({ existingUrls: existing.map((j) => j.sourceUrl) });
    }

    const jobs = (await prisma.job.findMany({
      where: { userId },
      include: {
        company: { select: { name: true } },
        scores: {
          select: { totalScore: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
      take: 250,
    })) as Array<{
      id: string;
      title: string;
      location: string | null;
      workMode: "REMOTE" | "HYBRID" | "ONSITE" | null;
      salaryMin: number | null;
      salaryMax: number | null;
      currency: string | null;
      applicationStatus: "NEW" | "SAVED" | "APPLIED" | "INTERVIEW" | "OFFER" | "REJECTED" | "ARCHIVED";
      priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
      source: string;
      sourceUrl: string | null;
      postedDate: Date | null;
      createdAt: Date;
      company: { name: string } | null;
      descriptionRaw: string | null;
      descriptionClean: string | null;
      requiredSkills: string[];
      scores?: Array<{ totalScore: number }>;
    }>;

    return NextResponse.json({ jobs: jobs.map((job) => mapDbJobToRow(job as any)) });
  } catch {
    return NextResponse.json({ jobs: [] });
  }
}

export async function POST(request: Request) {
  try {
    const authResult = await requireAuth();
    if (isNextResponse(authResult)) return authResult;
    const { userId } = authResult;

    const body = (await request.json()) as unknown;
    const payload = createJobSchema.parse(body);

    // Validate: reject titles that look like chat messages (contain question marks, very long, or obviously not job titles)
    const junkPatterns = [
      /\?.*\?/,                    // Multiple question marks
      /^(status|do i|what|how|when|where|why|can you|please|help)/i,  // Chat-like starts
      /at \d+$/,                   // "...at 7", "...at 8" (pagination artifacts)
    ];
    if (junkPatterns.some(p => p.test(payload.title)) || payload.title.length > 150) {
      return NextResponse.json({ error: "Title appears to be a chat message, not a job title. Rejected." }, { status: 400 });
    }

    try {
      const company = await ensureCompany(payload.company);
      const salaryBounds = parseSalaryBounds(payload.salary);

      const job = await prisma.job.create({
        data: {
          userId,
          source: payload.source,
          sourceUrl: payload.url,
          title: payload.title,
          companyId: company.id,
          location: payload.location,
          salaryMin: salaryBounds.salaryMin,
          salaryMax: salaryBounds.salaryMax,
          currency: payload.salary ? "GBP" : undefined,
          applicationStatus: payload.status ?? "SAVED",
          priority: payload.priority ?? "MEDIUM",
          descriptionRaw: payload.description,
          requiredSkills: payload.skills ? payload.skills.split(",").map(s => s.trim()).filter(Boolean) : [],
          postedDate: safeParseDate(payload.datePosted),
        },
        select: {
          id: true,
          title: true,
        },
      });

      if (payload.score && payload.score > 0) {
        await prisma.jobScore.create({
          data: {
            jobId: job.id,
            userId,
            totalScore: payload.score,
            confidence: 0.8,
            explanation: "Scraper relevance score",
            factorBreakdown: { scraper: payload.score },
            missingDataPenalty: 0,
          },
        });
      }

      return NextResponse.json({
        success: true,
        job: {
          id: job.id,
          title: job.title,
          company: payload.company,
        },
      });
    } catch (error) {
      console.error("Error creating job in DB:", error);
      return NextResponse.json({ error: "Failed to persist job to database. Ensure Prisma is running." }, { status: 500 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create job";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  try {
    const authResult = await requireAuth();
    if (isNextResponse(authResult)) return authResult;
    const { userId } = authResult;

    const body = (await request.json()) as unknown;
    const { id, ...data } = z.object({ id: z.string().min(1) }).passthrough().parse(body);
    const payload = createJobSchema.partial().parse(data);

    const salaryBounds = payload.salary ? parseSalaryBounds(payload.salary) : {};

    const job = await prisma.job.update({
      where: { id, userId },
      data: {
        source: payload.source,
        sourceUrl: payload.url,
        title: payload.title,
        location: payload.location,
        salaryMin: salaryBounds.salaryMin,
        salaryMax: salaryBounds.salaryMax,
        applicationStatus: payload.status,
        priority: payload.priority,
        descriptionRaw: payload.description,
        requiredSkills: payload.skills ? payload.skills.split(",").map(s => s.trim()) : undefined,
      },
      select: {
        id: true,
        title: true,
      },
    });

    return NextResponse.json({ success: true, job });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update job";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const authResult = await requireAuth();
    if (isNextResponse(authResult)) return authResult;
    const { userId } = authResult;

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("id");
    const cleanJunk = searchParams.get("cleanJunk");
    const deleteAll = searchParams.get("deleteAll");

    if (deleteAll === "true") {
      const deleted = await prisma.job.deleteMany({ where: { userId } });
      localJobsCache.clear();
      return NextResponse.json({ success: true, deletedCount: deleted.count });
    }

    if (cleanJunk === "true") {
      const deleted = await prisma.job.deleteMany({
        where: {
          userId,
          OR: [
            { title: { contains: "?" } },
            { title: { contains: "status" } },
            { title: { startsWith: "do i" } },
            { title: { startsWith: "what" } },
            { title: { startsWith: "how" } },
          ],
        },
      });
      return NextResponse.json({ success: true, deletedCount: deleted.count });
    }

    if (!jobId) {
      return NextResponse.json({ error: "Missing job id" }, { status: 400 });
    }

    await prisma.job.delete({ where: { id: jobId, userId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete job";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
