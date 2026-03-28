import { NextResponse } from "next/server";
import { requireAuth, isNextResponse } from "@/lib/server/auth-helpers";
import { prisma } from "@/lib/db";

export async function POST() {
  const authResult = await requireAuth();
  if (isNextResponse(authResult)) return authResult;
  const { userId, role } = authResult;

  if (role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Load admin's atlas agent as template
  const template = await prisma.agent.findFirst({
    where: { key: "atlas", userId },
    include: { soul: true, identity: true, mindConfig: true },
  });

  if (!template) {
    return NextResponse.json(
      { error: "No atlas agent found for admin. Start a chat first to create one." },
      { status: 404 }
    );
  }

  // All non-admin users
  const users = await prisma.user.findMany({
    where: { role: "USER" },
    select: { id: true },
  });

  const results = await Promise.allSettled(
    users.map(async (user) => {
      const existing = await prisma.agent.findFirst({
        where: { key: "atlas", userId: user.id },
        select: { id: true },
      });
      if (!existing) return; // will be seeded on first chat

      if (template.soul) {
        const { id: _i, agentId: _a, createdAt: _c, updatedAt: _u, ...soulData } = template.soul;
        await prisma.agentSoul.upsert({
          where: { agentId: existing.id },
          update: soulData,
          create: { agentId: existing.id, ...soulData },
        });
      }

      if (template.identity) {
        const { id: _i, agentId: _a, createdAt: _c, updatedAt: _u, ...identityData } = template.identity;
        await prisma.agentIdentity.upsert({
          where: { agentId: existing.id },
          update: identityData,
          create: { agentId: existing.id, ...identityData },
        });
      }

      if (template.mindConfig) {
        const { id: _i, agentId: _a, createdAt: _c, updatedAt: _u, ...mindData } = template.mindConfig;
        await prisma.agentMindConfig.upsert({
          where: { agentId: existing.id },
          update: mindData,
          create: { agentId: existing.id, ...mindData },
        });
      }
    })
  );

  const failed = results.filter((r) => r.status === "rejected").length;
  return NextResponse.json({ success: true, pushed: users.length, failed });
}
