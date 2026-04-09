import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { applicationStatuses } from "@/lib/domain/enums";
import { localJobsCache } from "@/lib/services/jobs/local-jobs-cache";
import { requireAuth, isNextResponse } from "@/lib/server/auth-helpers";

const updateSchema = z.object({
  status: z.enum(applicationStatuses),
});

type Params = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, { params }: Params) {
  const authResult = await requireAuth();
  if (isNextResponse(authResult)) return authResult;

  const { id: jobId } = await params;

  try {
    const body = (await request.json()) as unknown;
    const payload = updateSchema.parse(body);

    try {
      const updated = await prisma.job.update({
        where: { id: jobId },
        data: { applicationStatus: payload.status },
        select: { id: true, applicationStatus: true },
      });

      return NextResponse.json({ success: true, job: updated });
    } catch {
      const fallback = localJobsCache.updateStatus(jobId, payload.status);
      if (!fallback) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
      }
      return NextResponse.json({
        success: true,
        warning: "Prisma unavailable. Updated fallback cache only.",
        job: { id: fallback.id, applicationStatus: fallback.status },
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update job";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const session = await requireAuth();
  if (isNextResponse(session)) return session;

  const { id: jobId } = await params;

  try {
    // Nullify nullable foreign keys before deleting
    await prisma.outreachMessage.updateMany({ where: { jobId }, data: { jobId: null } });
    await prisma.followUpTask.updateMany({ where: { jobId }, data: { jobId: null } });
    await prisma.emailThread.updateMany({ where: { jobId }, data: { jobId: null } });
    // JobScore and JobTagOnJob cascade-delete automatically
    await prisma.job.delete({ where: { id: jobId } });

    return NextResponse.json({ success: true });
  } catch (err) {
    const errObj = err as unknown as Record<string, unknown>;
    const isNotFound =
      err instanceof Error &&
      ("code" in errObj ? errObj.code === "P2025" : err.message.includes("Record to delete does not exist"));
    return NextResponse.json(
      { error: isNotFound ? "Job not found" : "Delete failed" },
      { status: isNotFound ? 404 : 500 },
    );
  }
}
