import { NextResponse } from "next/server";
import { continuitySyncService } from "@/lib/services/agent/continuity-sync-service";
import { runtimeSettingsStore } from "@/lib/services/settings/runtime-settings-store";
import { atlasState, ATLAS_FILES } from "@/lib/services/agent/atlas-state-manager";

async function resolveAgentId(rawAgentId: string): Promise<string> {
  const normalized = rawAgentId.trim().toLowerCase();
  
  // 1. Check known keys
  if (normalized === "atlas" || normalized === "job_scout") {
    try {
      const { prisma } = await import("@/lib/db");
      const agent = await prisma.agent.findFirst({
        where: { key: "job_scout" },
        select: { id: true }
      });
      if (agent) return agent.id;
    } catch { /* fallback */ }
    return "job_scout";
  }
  
  return rawAgentId;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get("agentId");
  const sessionId = searchParams.get("sessionId") || "default";

  if (!agentId) {
    return NextResponse.json({ error: "agentId query param required" }, { status: 400 });
  }

  const resolvedAgentId = await resolveAgentId(agentId);

  // Read state from atlas file manager for the UI representation
  const syncState = await atlasState.readJson(ATLAS_FILES.syncState, { lastHydratedAt: new Date().toISOString() });
  const mindDoc = await atlasState.readText(ATLAS_FILES.mind, "");
  const soulDoc = await atlasState.readText(ATLAS_FILES.soul, "");
  const identityDoc = await atlasState.readText(ATLAS_FILES.identity, "");
  const userProfileDoc = await atlasState.readText(ATLAS_FILES.userProfile, "");
  const userNameMatch = userProfileDoc.match(/(?:# User Profile:\s*|^Name:\s*)([^\n]+)/im)
    ?? userProfileDoc.match(/^([A-Za-z][^\s;,\n]{1,30})/);
  const userName = userNameMatch?.[1]?.trim() ?? null;
  
  const runtimeSelection = runtimeSettingsStore.get("local-dev-user");

  return NextResponse.json({
    agentId,
    resolvedAgentId,
    sessionId,
    userName,
    summary: { lastSyncedAt: syncState.lastHydratedAt },
    usage: {
      totalTokens: runtimeSelection.usage.totalTokens,
      lastUpdated: runtimeSelection.updatedAt,
    },
    layers: {
      soul: {
        mission: soulDoc.slice(0, 100),
      },
      identity: {
        name: identityDoc.slice(0, 50),
      },
      agent: {
        mode: mindDoc.slice(0, 100),
      },
      memory: {
        summaries: [],
        todos: [],
      },
      history: {
        recentTurnCount: 0,
      },
    },
  });
}

export async function POST(request: Request) {
  try {
    const json = (await request.json()) as Record<string, unknown>;
    const agentId = typeof json.agentId === "string" ? json.agentId : null;

    if (!agentId) {
      return NextResponse.json({ error: "agentId required in body" }, { status: 400 });
    }

    const resolvedAgentId = await resolveAgentId(agentId);

    // Manually trigger a full hydration sync
    await continuitySyncService.fullHydration(resolvedAgentId, "force");

    return NextResponse.json({ synced: true, agentId, resolvedAgentId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
