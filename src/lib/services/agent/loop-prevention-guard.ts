import { getRedis } from "@/lib/redis";

type LoopState = {
  recentActions: string[];
  repeatedCount: number;
};

const LOOP_TTL = 3600; // 1 hour

// In-process fallback for callers that need a synchronous result within a request.
// Redis is the durable store; this Map is a within-process write-through cache.
const globalLoopState = globalThis as unknown as {
  loopStoreMap?: Map<string, LoopState>;
};
const loopStore = globalLoopState.loopStoreMap ?? new Map<string, LoopState>();
globalLoopState.loopStoreMap = loopStore;

function redisKey(sessionKey: string): string {
  return `loop:session:${sessionKey}`;
}

function persistToRedis(sessionKey: string, state: LoopState): void {
  void (async () => {
    try {
      await getRedis().setex(redisKey(sessionKey), LOOP_TTL, JSON.stringify(state));
    } catch {
      // fail-open
    }
  })();
}

function deleteFromRedis(sessionKey: string): void {
  void (async () => {
    try {
      await getRedis().del(redisKey(sessionKey));
    } catch {
      // fail-open
    }
  })();
}

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

export class LoopPreventionGuard {
  /**
   * Resets the loop state for a given session.
   * Call this at the start of every new user prompt to ensure fresh detection.
   */
  reset(agentId: string, sessionId?: string) {
    const key = `${agentId}:${sessionId ?? "default"}`;
    loopStore.delete(key);
    deleteFromRedis(key);
  }

  /**
   * Checks if the agent's current action (text response or tool calls) is repeating.
   * This is called INSIDE the execution loop of the orchestrator.
   */
  checkAgentAction(
    agentId: string,
    sessionId: string,
    actionSignature: string,
    round: number,
  ): { blocked: boolean; reason?: string } {
    const key = `${agentId}:${sessionId}`;
    const state = loopStore.get(key) ?? { recentActions: [], repeatedCount: 0 };

    // Normalize signature
    const signature = normalize(actionSignature);

    // We only care about loops within the SAME TURN (multi-round loops).
    // If it's the first round, it's never a loop yet.
    if (round === 0) {
      state.recentActions = [signature];
      state.repeatedCount = 0;
      loopStore.set(key, state);
      persistToRedis(key, state);
      return { blocked: false };
    }

    const lastAction = state.recentActions[state.recentActions.length - 1];
    const isConsecutiveRepeat = lastAction === signature;

    if (isConsecutiveRepeat) {
      state.repeatedCount += 1;
    } else if (state.recentActions.includes(signature)) {
      // Catch A-B-A loops
      state.repeatedCount += 0.5;
    } else {
      state.repeatedCount = 0;
    }

    state.recentActions.push(signature);
    if (state.recentActions.length > 10) state.recentActions.shift();

    loopStore.set(key, state);
    persistToRedis(key, state);

    // Agent-side loop threshold:
    // 3 identical consecutive actions OR 5 near-identical actions in a single multi-round turn.
    if (state.repeatedCount >= 3) {
      return {
        blocked: true,
        reason: "Agent loop detected: Repetitive response or tool cycle. Stopping turn to prevent token waste.",
      };
    }

    return { blocked: false };
  }
}

export const loopPreventionGuard = new LoopPreventionGuard();
