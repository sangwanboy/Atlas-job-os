import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, isNextResponse } from "@/lib/server/auth-helpers";

const mockSources = [
  { source: "LinkedIn Alert", count: 12 },
  { source: "CSV Import", count: 7 },
  { source: "Manual", count: 5 },
  { source: "Recruiter Email", count: 4 },
];

export async function GET() {
  const authResult = await requireAuth();
  if (isNextResponse(authResult)) return authResult;
  const { userId } = authResult;
  try {
    const jobs = (await prisma.job.findMany({
      where: { userId },
      select: { source: true },
      take: 250,
    })) as Array<{ source: string }>;

    if (jobs.length === 0) {
      return NextResponse.json(mockSources);
    }

    const grouped = jobs.reduce((acc: Record<string, number>, job) => {
      const key = job.source?.trim() || "Unknown";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    return NextResponse.json(
      Object.entries(grouped).map(([source, count]) => ({ source, count })),
    );
  } catch {
    return NextResponse.json(mockSources);
  }
}
