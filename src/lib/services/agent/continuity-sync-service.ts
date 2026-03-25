import { atlasState, ATLAS_FILES } from "./atlas-state-manager";
import { prisma } from "@/lib/db";
import { HydratedLayers } from "./prompt-composer";

// ─── Layers & Types ─────────────────────────────────────────────────────────

export type SyncState = {
  lastHydratedAt: string;
  persistenceMode: "db-active" | "json-fallback";
  healthMarkers: string[];
};

export type ActiveTaskState = {
  taskId: string;
  description: string;
  status: "pending" | "in_progress" | "blocked" | "completed";
  steps: string[];
  currentStepIndex: number;
};

// ─── Selective Hydration Service ────────────────────────────────────────────

export class ContinuitySyncService {
  private memDir = "agents/atlas";

  /**
   * interval 7: Context Memory Logger
   */
  async logContextMemory(entry: string): Promise<void> {
    const timestamp = `[${new Date().toISOString()}]`;
    await atlasState.appendText(ATLAS_FILES.contextMemory, `${timestamp} ${entry}`);
  }

  /**
   * interval 1: Selective Hydration based on hydration triggers
   */
  async hydrateTurnContext(agentId: string, sessionId: string, taskType?: string): Promise<HydratedLayers> {
    const now = new Date();
    const syncState = await atlasState.readJson<SyncState>(ATLAS_FILES.syncState, { 
      lastHydratedAt: now.toISOString(), 
      persistenceMode: "db-active", 
      healthMarkers: [] 
    });

    const lastSync = new Date(syncState.lastHydratedAt);
    const diffMinutes = (now.getTime() - lastSync.getTime()) / (1000 * 60);
    const isNewSession = sessionId === "new" || sessionId === "default";
    const isLongInactivity = diffMinutes > 45;
    const isPruneOccurred = syncState.healthMarkers.includes("prune_occurred");

    const layers: HydratedLayers = {};

    // Mandatory Layers (Always included for every turn to ensure continuity)
    layers.mind = await atlasState.readText(ATLAS_FILES.mind, "Mind: READY");
    const fullContext = await atlasState.readText(ATLAS_FILES.contextMemory, "");
    layers.recentContext = fullContext.slice(-1500); 

    layers.soul = await atlasState.readText(ATLAS_FILES.soul, "");
    layers.identity = await atlasState.readText(ATLAS_FILES.identity, "");
    layers.operatingRules = await atlasState.readText(ATLAS_FILES.operatingRules, "");
    layers.searchGuidelines = await atlasState.readText(ATLAS_FILES.search, "");
    layers.userProfile = await atlasState.readText(ATLAS_FILES.userProfile, "");
    
    const prefs = await atlasState.readJson(ATLAS_FILES.preferences, {});
    layers.preferences = JSON.stringify(prefs, null, 2);

    // Context Recovery Log
    if (isNewSession || isLongInactivity) {
      await this.logContextMemory(`Re-anchoring search context for session: ${sessionId}`);
    }

    // Update last sync time
    syncState.lastHydratedAt = now.toISOString();
    await atlasState.writeJson(ATLAS_FILES.syncState, syncState);

    return layers;
  }

  /**
   * interval 2: After Meaningful Tool Phase
   */
  async syncPostToolPhase(component: "browser" | "pipeline" | "gmail", data?: any): Promise<void> {
    const now = new Date().toISOString();
    
    if (component === "browser" && data) {
      await atlasState.writeJson(ATLAS_FILES.browserSessionState, { lastUpdated: now, ...data });
    } else if (component === "pipeline" && data) {
      await atlasState.writeJson(ATLAS_FILES.pipelineState, { lastUpdated: now, ...data });
    } else if (component === "gmail" && data) {
      await atlasState.writeJson(ATLAS_FILES.gmailState, { lastUpdated: now, ...data });
    }

    const syncState = await atlasState.readJson<SyncState>(ATLAS_FILES.syncState, { 
      lastHydratedAt: now, 
      persistenceMode: "db-active", 
      healthMarkers: [] 
    });
    syncState.lastHydratedAt = now;
    await atlasState.writeJson(ATLAS_FILES.syncState, syncState);

    await this.logContextMemory(`Completed tool phase for subsystem: ${component}`);
  }

  /**
   * interval 3 & 4 & 5: Full Hydration (Force-Sync or Admin update)
   */
  async fullHydration(agentId: string, trigger: "inactivity" | "prune" | "force"): Promise<void> {
    await this.logContextMemory(`Running full hydration. Trigger: ${trigger}`);
    
    try {
      const dbAgent = await prisma.agent.findUnique({
        where: { id: agentId },
        include: { soul: true, identity: true, instructions: true, user: { include: { preferences: true } } }
      });

      if (dbAgent) {
        if (dbAgent.soul) {
          const soulContent = `MISSION: ${dbAgent.soul.mission}\nVALUES: ${dbAgent.soul.valuesRules.join(", ")}`;
          await atlasState.writeText(ATLAS_FILES.soul, soulContent);
        }
        if (dbAgent.identity) {
          const identityContent = `NAME: ${dbAgent.identity.name}\nROLE: ${dbAgent.identity.roleTitle}\nPERSONA: ${dbAgent.identity.communicationStyle}`;
          await atlasState.writeText(ATLAS_FILES.identity, identityContent);
        }
        if (dbAgent.instructions && dbAgent.instructions.length > 0) {
          const rules = dbAgent.instructions.map(i => `- ${i.instruction}`).join("\n");
          await atlasState.writeText(ATLAS_FILES.operatingRules, rules);
        }
        if (dbAgent.user?.preferences) {
          await atlasState.writeJson(ATLAS_FILES.preferences, dbAgent.user.preferences);
        }
      }
    } catch (dbError) {
      this.logContextMemory(`Database unavailable during full hydration. Falling back to local files.`);
    }

    await atlasState.writeJson(ATLAS_FILES.syncState, {
      lastHydratedAt: new Date().toISOString(),
      persistenceMode: "db-active",
      healthMarkers: ["hydrated"]
    });
  }

  async syncLayersWithLlm(agentId: string, sessionId: string, update: { mind?: any; userProfile?: string; preferences?: any }): Promise<void> {
    if (update.mind) {
      await atlasState.writeText(ATLAS_FILES.mind, JSON.stringify(update.mind, null, 2));
      await this.logContextMemory(`Updated mind.md via LLM continuity update.`);
    }
    if (update.userProfile) {
      await atlasState.writeText(ATLAS_FILES.userProfile, update.userProfile);
      await this.logContextMemory(`Updated user_profile.md via LLM continuity update.`);
    }
    if (update.preferences) {
      await atlasState.writeJson(ATLAS_FILES.preferences, update.preferences);
      await this.logContextMemory(`Updated preferences.json via LLM continuity update.`);
    }
  }

  // Legacy compat getters
  getContinuityState(agentId: string, sessionId: string) { return { history: { recentTurns: [] } }; }
  addHistoryTurn(agentId: string, sessionId: string, role: string, content: string) {}
  recordActivity(agentId: string, sessionId: string) {}
  async checkIdleRehydration(agentId: string, sessionId: string) {
    await this.fullHydration(agentId, "inactivity");
    return { rehydrated: true };
  }
  getFormattedHistory(agentId: string, sessionId: string) { return ""; }
  async syncPreStep() {}
  async syncPostStep() {}
  recordToolResult() {}
}

export const continuitySyncService = new ContinuitySyncService();
