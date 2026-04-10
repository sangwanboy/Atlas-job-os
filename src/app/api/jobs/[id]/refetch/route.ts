import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, isNextResponse } from "@/lib/server/auth-helpers";

type Params = { params: Promise<{ id: string }> };

const BROWSER_SERVER = process.env.BROWSER_SERVICE_URL ?? "http://localhost:3001";

async function browserPost(action: string, sessionId: string, params: Record<string, unknown> = {}) {
  const res = await fetch(`${BROWSER_SERVER}/api/browser`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, sessionId, params }),
  });
  return res.json() as Promise<{ status: string; data?: Record<string, unknown>; error?: string }>;
}

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

  // Check extension status via browser server (extensionBridge only lives in that process)
  let statusResult: { status: string; data?: Record<string, unknown> };
  try {
    statusResult = await browserPost("extension_status", userId);
  } catch {
    return NextResponse.json({ error: "Browser server unreachable — make sure it is running" }, { status: 503 });
  }

  const connected = statusResult?.data?.connected === true;
  if (!connected) {
    return NextResponse.json({ error: "Chrome extension not connected — open Edge with the Atlas extension" }, { status: 503 });
  }

  // Scrape via browser server → extension bridge
  let enrichResult: { status: string; data?: Record<string, unknown>; error?: string };
  try {
    enrichResult = await browserPost("extension_enrich_job", userId, { url: job.sourceUrl });
  } catch {
    return NextResponse.json({ error: "Browser server unreachable — make sure it is running" }, { status: 503 });
  }

  if (enrichResult.status !== "ok" || !enrichResult.data?.job) {
    return NextResponse.json(
      { error: enrichResult.error ?? "Could not extract details from the listing page" },
      { status: 502 }
    );
  }

  const scraped = enrichResult.data.job as { description?: string; skills?: string[] };

  if (!scraped.description && !scraped.skills?.length) {
    return NextResponse.json({ error: "Could not extract details from the listing page" }, { status: 422 });
  }

  const updated = await prisma.job.update({
    where: { id: jobId },
    data: {
      ...(scraped.description ? { descriptionRaw: scraped.description, descriptionClean: scraped.description } : {}),
      ...(scraped.skills?.length ? { requiredSkills: scraped.skills } : {}),
    },
    select: { id: true, descriptionRaw: true, descriptionClean: true, requiredSkills: true },
  });

  return NextResponse.json({ success: true, job: updated });
}
