type LoopState = {
  recentActions: string[];
  repeatedCount: number;
};

const globalLoopState = globalThis as unknown as {
  loopStoreMap?: Map<string, LoopState>;
};

const loopStore = globalLoopState.loopStoreMap ?? new Map<string, LoopState>();
globalLoopState.loopStoreMap = loopStore;

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
  }

  /**
   * Checks if the agent's current action (text response or tool calls) is repeating.
   * This is called INSIDE the execution loop of the orchestrator.
   */
  checkAgentAction(agentId: string, sessionId: string, actionSignature: string, round: number): { blocked: boolean; reason?: string } {
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
