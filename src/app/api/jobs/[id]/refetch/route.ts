import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, isNextResponse } from "@/lib/server/auth-helpers";
import { extensionBridge } from "@/lib/services/browser/extension-bridge";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const authResult = await requireAuth();
  if (isNextResponse(authResult)) return authResult;
  const { userId } = authResult;

  const { id: jobId } = await params;

  const job = await prisma.job.findFirst({
    where: { id: jobId, userId },
    select: { id: true, sourceUrl: true },
  });

  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (!job.sourceUrl) return NextResponse.json({ error: "No source URL for this job" }, { status: 400 });

  if (!extensionBridge.isConnected()) {
    return NextResponse.json({ error: "Chrome extension not connected — open Edge with the Atlas extension" }, { status: 503 });
  }

  let detail: Awaited<ReturnType<typeof extensionBridge.scrapeJobListing>>;
  try {
    detail = await extensionBridge.scrapeJobListing(job.sourceUrl, `refetch-${jobId}`);
  } catch (err) {
    return NextResponse.json(
      { error: `Scrape failed: ${err instanceof Error ? err.message : "unknown error"}` },
      { status: 502 }
    );
  }

  if (!detail.description && !detail.skills?.length) {
    return NextResponse.json({ error: "Could not extract details from the listing page" }, { status: 422 });
  }

  const updated = await prisma.job.update({
    where: { id: jobId },
    data: {
      ...(detail.description ? { descriptionRaw: detail.description, descriptionClean: detail.description } : {}),
      ...(detail.skills?.length ? { requiredSkills: detail.skills } : {}),
    },
    select: { id: true, descriptionRaw: true, descriptionClean: true, requiredSkills: true },
  });

  return NextResponse.json({ success: true, job: updated });
}
