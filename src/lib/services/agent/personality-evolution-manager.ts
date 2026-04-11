import { getRedis } from "@/lib/redis";

type PersonalityState = {
  conciseness: number;
  strategyDepth: number;
  warmth: number;
};

const PERSONALITY_TTL = 604800; // 7 days

const DEFAULT_STATE: PersonalityState = {
  conciseness: 0.65,
  strategyDepth: 0.66,
  warmth: 0.5,
};

function redisKey(agentId: string): string {
  return `personality:agent:${agentId}`;
}

async function readState(agentId: string): Promise<PersonalityState> {
  try {
    const raw = await getRedis().get(redisKey(agentId));
    if (!raw) return { ...DEFAULT_STATE };
    return JSON.parse(raw) as PersonalityState;
  } catch {
    return { ...DEFAULT_STATE };
  }
}

async function writeState(agentId: string, state: PersonalityState): Promise<void> {
  try {
    await getRedis().setex(redisKey(agentId), PERSONALITY_TTL, JSON.stringify(state));
  } catch {
    // fail-open
  }
}

async function deleteState(agentId: string): Promise<void> {
  try {
    await getRedis().del(redisKey(agentId));
  } catch {
    // fail-open
  }
}

export class PersonalityEvolutionManager {
  // Kept synchronous for callers that don't await; returns defaults as fail-open.
  // Use getStateAsync for callers that can await.
  getState(agentId: string): PersonalityState {
    return { ...DEFAULT_STATE };
  }

  async getStateAsync(agentId: string): Promise<PersonalityState> {
    return readState(agentId);
  }

  applyEvidence(agentId: string, evidence: { concisePreferred?: boolean; strategicPreferred?: boolean }): PersonalityState {
    // Fire-and-forget: read current state, apply evidence, write back
    void (async () => {
      const current = await readState(agentId);
      const next = { ...current };

      if (evidence.concisePreferred) {
        next.conciseness = Math.min(0.9, current.conciseness + 0.02);
      }
      if (evidence.strategicPreferred) {
        next.strategyDepth = Math.min(0.9, current.strategyDepth + 0.02);
      }

      await writeState(agentId, next);
    })().catch(() => {});

    // Return defaults synchronously; async write will persist the real update
    return { ...DEFAULT_STATE };
  }

  reset(agentId: string) {
    void deleteState(agentId).catch(() => {});
  }
}

export const personalityEvolutionManager = new PersonalityEvolutionManager();
