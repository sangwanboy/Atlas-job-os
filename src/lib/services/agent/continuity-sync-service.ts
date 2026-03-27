import { atlasState, ATLAS_FILES } from "./atlas-state-manager";
import { prisma } from "@/lib/db";
import { HydratedLayers } from "./prompt-composer";
import * as fs from "node:fs/promises";
import * as path from "node:path";

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

// ─── Layer Cache ─────────────────────────────────────────────────────────────

type LayerCache = { layers: HydratedLayers; expiresAt: number };
const _layerCache = new Map<string, LayerCache>();
const LAYER_CACHE_TTL_MS = 30_000; // 30 seconds

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
   * @param msgCount - Number of messages in the current session (used for smart profile injection)
   */
  async hydrateTurnContext(agentId: string, sessionId: string, taskType?: string, msgCount = 0): Promise<HydratedLayers> {
    const now = new Date();
    const cacheKey = `${agentId}:${sessionId}:${msgCount}`;

    // Return cached layers if still fresh (skip on first turn or re-injection turns)
    const isFirstTurn = msgCount === 0;
    const isReinjectionTurn = msgCount > 0 && msgCount % 7 === 0;
    const cached = _layerCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now() && !isFirstTurn && !isReinjectionTurn) {
      return cached.layers;
    }

    // Parallel: read sync state + all file layers simultaneously
    const [
      syncState,
      mind,
      fullContext,
      soul,
      identity,
      operatingRules,
      searchGuidelines,
      fullProfile,
      prefs,
      cvSummary,
      cvEntries,
    ] = await Promise.all([
      atlasState.readJson<SyncState>(ATLAS_FILES.syncState, { lastHydratedAt: now.toISOString(), persistenceMode: "db-active", healthMarkers: [] }),
      atlasState.readText(ATLAS_FILES.mind, "Mind: READY"),
      atlasState.readText(ATLAS_FILES.contextMemory, ""),
      atlasState.readText(ATLAS_FILES.soul, ""),
      atlasState.readText(ATLAS_FILES.identity, ""),
      atlasState.readText(ATLAS_FILES.operatingRules, ""),
      atlasState.readText(ATLAS_FILES.search, ""),
      atlasState.readText(ATLAS_FILES.userProfile, ""),
      atlasState.readJson(ATLAS_FILES.preferences, {}),
      atlasState.readText(ATLAS_FILES.cvSummary, ""),
      fs.readdir(path.join(process.cwd(), "uploads", "cv"), { withFileTypes: true }).catch(() => [] as import("node:fs").Dirent[]),
    ]);

    const lastSync = new Date(syncState.lastHydratedAt);
    const diffMinutes = (now.getTime() - lastSync.getTime()) / (1000 * 60);
    const isNewSession = sessionId === "new" || sessionId === "default";
    const isLongInactivity = diffMinutes > 45;
    const shouldInjectFullProfile = isFirstTurn || isReinjectionTurn || isLongInactivity;

    const layers: HydratedLayers = {};

    layers.mind = mind;
    layers.recentContext = fullContext.slice(-1500);
    layers.soul = soul;
    layers.identity = identity;
    layers.operatingRules = operatingRules;
    layers.searchGuidelines = searchGuidelines;

    // Smart profile injection
    if (shouldInjectFullProfile) {
      layers.userProfile = fullProfile;
      layers.profileMini = undefined;
    } else if (fullProfile.length > 50) {
      const nameMatch = fullProfile.match(/(?:# User Profile:\s*|Name:\s*)([^\n]+)/i);
      const roleMatch = fullProfile.match(/(?:Current Role|Target Role|## Overview)[\s\S]*?([^\n]{10,80})/i);
      const name = nameMatch?.[1]?.trim() ?? "User";
      const role = roleMatch?.[1]?.trim() ?? "Job seeker";
      layers.profileMini = `${name} — ${role}\n[Full profile injected every 7 messages to save tokens. Turn ${msgCount}/${Math.ceil(msgCount / 7) * 7}]`;
      layers.userProfile = undefined;
    }

    layers.preferences = JSON.stringify(prefs, null, 2);

    if (cvSummary.length > 20) {
      layers.cvSummary = cvSummary;
    }

    // CV context
    const cvFiles = (cvEntries as import("node:fs").Dirent[])
      .filter((e) => e.isFile())
      .map((e) => `- ${e.name} (type: ${path.extname(e.name).toLowerCase()})`);
    layers.cvContext = cvFiles.length > 0
      ? `The user has uploaded the following CV files:\n${cvFiles.join("\n")}\n\nThese CV files are accessible at uploads/cv/ on the server. Use this knowledge to tailor job matches and cover letters to the user's background.`
      : "No CV files have been uploaded yet.";

    // Fire-and-forget: log + update sync state (don't block the return)
    void Promise.all([
      (isNewSession || isLongInactivity) ? this.logContextMemory(`Re-anchoring search context for session: ${sessionId}`) : Promise.resolve(),
      (shouldInjectFullProfile && !isFirstTurn) ? this.logContextMemory(`Full profile re-injected at message ${msgCount}`) : Promise.resolve(),
      atlasState.writeJson(ATLAS_FILES.syncState, { ...syncState, lastHydratedAt: now.toISOString() }),
    ]);

    // Cache the result
    _layerCache.set(cacheKey, { layers, expiresAt: Date.now() + LAYER_CACHE_TTL_MS });

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
          const rules = dbAgent.instructions.map((i: { instruction: string }) => `- ${i.instruction}`).join("\n");
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
