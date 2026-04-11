import { prisma } from "@/lib/db";
import { activeAgent } from "@/lib/mock/data";
import { getRedis } from "@/lib/redis";

export type SyncedAgentProfile = {
  agentId: string;
  name: string;
  roleTitle: string;
  specialization: string;
  soulMission: string;
  longTermObjective: string;
  principles: string[];
  decisionPhilosophy: string;
  communicationStyle: string;
  personalityStyle: string;
  mindModel: string;
  mindConstraints: string[];
  memoryAnchors: string;
};

const PROFILE_TTL = 3600; // 1 hour

function redisKey(agentId: string): string {
  return `profile:synced:${agentId}`;
}

async function readProfileFromRedis(agentId: string): Promise<SyncedAgentProfile | null> {
  try {
    const raw = await getRedis().get(redisKey(agentId));
    if (!raw) return null;
    return JSON.parse(raw) as SyncedAgentProfile;
  } catch {
    return null;
  }
}

async function writeProfileToRedis(profile: SyncedAgentProfile): Promise<void> {
  try {
    await getRedis().setex(redisKey(profile.agentId), PROFILE_TTL, JSON.stringify(profile));
  } catch {
    // fail-open
  }
}

async function hydrateLatestSnapshotsFromDb(): Promise<void> {
  try {
    const snapshots = await prisma.agentProfileSnapshot.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    for (const snapshot of snapshots) {
      // Only seed if not already in Redis
      const existing = await readProfileFromRedis(snapshot.agentId);
      if (existing) continue;

      await writeProfileToRedis({
        agentId: snapshot.agentId,
        name: "Atlas",
        roleTitle: snapshot.role,
        specialization: "Job search intelligence and outreach support",
        soulMission: snapshot.soul,
        longTermObjective: snapshot.soul,
        principles: activeAgent.soul.principles,
        decisionPhilosophy: "Prioritize evidence-backed opportunities and avoid noisy actions.",
        communicationStyle: snapshot.style,
        personalityStyle: snapshot.style,
        mindModel: snapshot.model,
        mindConstraints: snapshot.constraints,
        memoryAnchors: snapshot.memoryAnchor,
      });
    }
  } catch {
    // Fallback to in-memory defaults when Postgres is unavailable.
  }
}

async function persistSnapshot(profile: SyncedAgentProfile): Promise<void> {
  try {
    await prisma.agentProfileSnapshot.create({
      data: {
        agentId: profile.agentId,
        role: profile.roleTitle,
        soul: profile.soulMission,
        style: profile.communicationStyle,
        model: profile.mindModel,
        memoryAnchor: profile.memoryAnchors,
        constraints: profile.mindConstraints,
      },
    });
  } catch {
    // Fallback to Redis-only when DB write fails.
  }
}

void hydrateLatestSnapshotsFromDb();

function atlasDefaultProfile(): SyncedAgentProfile {
  return {
    agentId: activeAgent.id,
    name: "Atlas",
    roleTitle: activeAgent.identity.roleTitle,
    specialization: "Job search intelligence and outreach support",
    soulMission: activeAgent.soul.mission,
    longTermObjective: "Land high-fit interviews with focused, low-noise actions.",
    principles: activeAgent.soul.principles,
    decisionPhilosophy: "Prioritize evidence-backed opportunities and avoid noisy actions.",
    communicationStyle: activeAgent.identity.communicationStyle,
    personalityStyle: activeAgent.identity.communicationStyle,
    mindModel: activeAgent.mind.model,
    mindConstraints: ["Do not fabricate facts", "Always stay within user-approved actions"],
    memoryAnchors: "Prefer high-fit roles and concise updates.",
  };
}

export class AgentProfileSyncStore {
  // Kept synchronous for callers that don't await; returns default as fail-open.
  // Use getProfileAsync for callers that can await.
  getProfile(agentId: string): SyncedAgentProfile {
    // Trigger async hydration in background; sync callers get default
    void hydrateLatestSnapshotsFromDb().catch(() => {});
    return atlasDefaultProfile();
  }

  async getProfileAsync(agentId: string): Promise<SyncedAgentProfile> {
    void hydrateLatestSnapshotsFromDb().catch(() => {});
    const existing = await readProfileFromRedis(agentId);
    if (existing) return existing;
    const seeded = atlasDefaultProfile();
    void writeProfileToRedis(seeded).catch(() => {});
    return seeded;
  }

  upsertProfile(profile: SyncedAgentProfile): SyncedAgentProfile {
    void writeProfileToRedis(profile).catch(() => {});
    void persistSnapshot(profile).catch(() => {});
    return profile;
  }
}

export const agentProfileSyncStore = new AgentProfileSyncStore();
