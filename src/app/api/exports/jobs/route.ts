import { NextResponse } from "next/server";
import { buildWorkbookFromJobs } from "@/lib/services/export/excel-export";
import { prisma } from "@/lib/db";
import { requireAuth, isNextResponse } from "@/lib/server/auth-helpers";
import type { JobRow } from "@/types/domain";

export async function GET() {
  const authResult = await requireAuth();
  if (isNextResponse(authResult)) return authResult;
  const { userId } = authResult;

  const dbJobs = await prisma.job.findMany({
    where: { userId },
    include: { company: true, scores: { take: 1, orderBy: { createdAt: "desc" } } },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });

  const jobs: JobRow[] = dbJobs.map((j) => ({
    id: j.id,
    title: j.title,
    company: j.company?.name ?? "Unknown",
    location: j.location ?? "",
    workMode: (j.workMode as JobRow["workMode"]) ?? "ONSITE",
    salaryRange: j.salaryMin ? `${j.currency ?? "GBP"} ${j.salaryMin}–${j.salaryMax ?? j.salaryMin}` : "Not disclosed",
    score: j.scores[0]?.totalScore ?? 0,
    status: (j.applicationStatus as JobRow["status"]) ?? "SAVED",
    priority: (j.priority as JobRow["priority"]) ?? "MEDIUM",
    source: j.source ?? "Unknown",
    postedAt: j.postedDate ? new Date(j.postedDate).toISOString().split("T")[0] : "",
    sourceUrl: j.sourceUrl ?? undefined,
  }));

  const fileBuffer = await buildWorkbookFromJobs(jobs);
  const binary = new Uint8Array(fileBuffer);

  return new NextResponse(binary, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=jobs_export.xlsx",
    },
  });
}
