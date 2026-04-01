import { atlasState, ATLAS_FILES } from "./atlas-state-manager";
import { prisma } from "@/lib/db";
import { HydratedLayers } from "./prompt-composer";
import { localJobsCache } from "@/lib/services/jobs/local-jobs-cache";
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

// ─── Task Triggers ───────────────────────────────────────────────────────────

export type TaskTrigger =
  | "job_search"
  | "cv_review"
  | "cv_upload"
  | "profile_update"
  | "memory_sync"
  | "settings_change"
  | "session_start"
  | "general";

type LayerKey = keyof HydratedLayers;

const TRIGGER_LAYER_MAP: Record<TaskTrigger, LayerKey[]> = {
  job_search:      ["searchGuidelines", "preferences", "userProfile", "pipelineContext"],
  cv_review:       ["cvSummary", "cvContext", "userProfile"],
  cv_upload:       ["cvSummary", "cvContext", "userProfile"],
  profile_update:  ["userProfile", "preferences", "mind"],
  memory_sync:     ["mind"],
  settings_change: ["preferences"],
  session_start:   [], // empty = all layers forced on first turn
  general:         ["pipelineContext"], // always keep pipeline fresh
};

// ─── Per-Layer Cache ─────────────────────────────────────────────────────────

type LayerCacheEntry = { value: string; expiresAt: number };
const _layerCache = new Map<string, LayerCacheEntry>();
const LAYER_CACHE_TTL_MS = 30_000; // 30 seconds

// ─── Selective Hydration Service ────────────────────────────────────────────

export class ContinuitySyncService {
  private memDir = "agents/atlas";

  /**
   * interval 7: Context Memory Logger
   */
  async logContextMemory(entry: string, userId?: string): Promise<void> {
    const timestamp = `[${new Date().toISOString()}]`;
    const line = `${timestamp} ${entry}`;
    if (userId) {
      await atlasState.writeUserText(userId, ATLAS_FILES.contextMemory,
        (await atlasState.readUserText(userId, ATLAS_FILES.contextMemory, "")) + line + "\n"
      );
    } else {
      await atlasState.appendText(ATLAS_FILES.contextMemory, line);
    }
  }

  /**
   * Build CV context string from uploaded files for a user.
   */
  private async buildCvContext(userId: string): Promise<string> {
    try {
      const cvDir = path.join(process.cwd(), "uploads", "cv", userId);
      const entries = await fs.readdir(cvDir, { withFileTypes: true }).catch(() => [] as import("node:fs").Dirent[]);
      const metaPath = path.join(cvDir, "_metadata.json");
      let metadata: Record<string, { tag?: string; label?: string }> = {};
      try {
        const raw = await fs.readFile(metaPath, "utf-8");
        metadata = JSON.parse(raw) as typeof metadata;
      } catch { /* no metadata yet */ }

      const cvFiles = (entries as import("node:fs").Dirent[])
        .filter((e) => e.isFile() && e.name !== "_metadata.json")
        .map((e) => {
          const ext = path.extname(e.name).toLowerCase();
          const meta = metadata[e.name] ?? {};
          const tag = meta.tag ?? "general";
          const label = meta.label ? ` "${meta.label}"` : "";
          return `- ${e.name}${label} [${tag}] (${ext})`;
        });

      return cvFiles.length > 0
        ? `The user has uploaded the following CV files:\n${cvFiles.join("\n")}\n\nTags: professional=main career CV, part-time=freelance/contract, role-specific=targeted for a specific role, general=default.\nUse the appropriate CV based on the job being discussed. Files are at uploads/cv/ on the server.`
        : "No CV files have been uploaded yet.";
    } catch {
      return "No CV files have been uploaded yet.";
    }
  }

  /**
   * Build a compact pipeline summary for Atlas context.
   */
  private buildPipelineContext(): string {
    try {
      const jobs = localJobsCache.list();
      if (jobs.length === 0) return "Pipeline is empty — no jobs discovered yet.";
      const lines = jobs.slice(0, 30).map((j, i) =>
        `${i + 1}. [${j.title}] at ${j.company} — ${j.location} — Score: ${j.score ?? "?"} — ${j.status ?? "PENDING"}`
      );
      const extra = jobs.length > 30 ? `\n...and ${jobs.length - 30} more.` : "";
      return `${jobs.length} job(s) in pipeline (discovered, not yet imported):\n${lines.join("\n")}${extra}`;
    } catch {
      return "";
    }
  }

  /**
   * interval 1: Trigger-based selective hydration.
   * Each layer is cached independently (30s TTL).
   * A trigger bypasses the cache only for its relevant layers.
   */
  async hydrateTurnContext(
    agentId: string,
    sessionId: string,
    taskTrigger: TaskTrigger = "general",
    msgCount = 0,
    userId?: string,
  ): Promise<HydratedLayers> {
    const now = new Date();
    const isFirstTurn = msgCount === 0;
    const triggeredLayers = new Set<LayerKey>(TRIGGER_LAYER_MAP[taskTrigger]);

    console.log(`[Atlas Sync] Trigger: ${taskTrigger} → refreshing layers: [${triggeredLayers.size ? [...triggeredLayers].join(", ") : "cache"}]`);

    const userKey = userId ?? "shared";

    // Per-layer cache loader: bypasses cache on first turn or if this layer is in the trigger set
    const loadLayer = async (key: LayerKey, loader: () => Promise<string>): Promise<string> => {
      const cacheKey = `${agentId}:${userKey}:${key}`;
      const cached = _layerCache.get(cacheKey);
      const forceRefresh = isFirstTurn || triggeredLayers.has(key);
      if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
        return cached.value;
      }
      const value = await loader().catch(() => "");
      _layerCache.set(cacheKey, { value, expiresAt: Date.now() + LAYER_CACHE_TTL_MS });
      return value;
    };

    // Load all layers in parallel with per-layer caching
    const [soul, identity, operatingRules, searchGuidelines, mind, fullProfile, preferences, cvSummary, cvContext, pipelineContext] =
      await Promise.all([
        loadLayer("soul",             () => atlasState.readText(ATLAS_FILES.soul, "")),
        loadLayer("identity",         () => atlasState.readText(ATLAS_FILES.identity, "")),
        loadLayer("operatingRules",   () => atlasState.readText(ATLAS_FILES.operatingRules, "")),
        loadLayer("searchGuidelines", () => atlasState.readText(ATLAS_FILES.search, "")),
        loadLayer("mind",             () => userId ? atlasState.readUserText(userId, ATLAS_FILES.mind, "Mind: READY") : Promise.resolve("Mind: READY")),
        loadLayer("userProfile",      () => userId ? atlasState.readUserText(userId, ATLAS_FILES.userProfile, "") : Promise.resolve("")),
        loadLayer("preferences",      () => userId ? atlasState.readUserJson(userId, ATLAS_FILES.preferences, {}).then((p) => JSON.stringify(p, null, 2)) : Promise.resolve("{}")),
        loadLayer("cvSummary",        () => userId ? atlasState.readUserText(userId, ATLAS_FILES.cvSummary, "") : Promise.resolve("")),
        loadLayer("cvContext",        () => userId ? this.buildCvContext(userId) : Promise.resolve("No CV files have been uploaded yet.")),
        loadLayer("pipelineContext",  () => Promise.resolve(this.buildPipelineContext())),
      ]);

    const layers: HydratedLayers = {};

    layers.soul             = soul;
    layers.identity         = identity;
    layers.operatingRules   = operatingRules;
    layers.searchGuidelines = searchGuidelines;
    layers.mind             = mind;
    layers.preferences      = preferences;
    if (cvSummary.length > 20) layers.cvSummary = cvSummary;
    layers.cvContext        = cvContext;
    if (pipelineContext) layers.pipelineContext = pipelineContext;

    // Profile injection: full when first turn or userProfile was triggered, else mini
    const shouldInjectFullProfile = isFirstTurn || triggeredLayers.has("userProfile");
    if (shouldInjectFullProfile) {
      layers.userProfile = fullProfile;
      layers.profileMini = undefined;
    } else if (fullProfile.length > 50) {
      const nameMatch = fullProfile.match(/(?:# User Profile:\s*|Name:\s*)([^\n]+)/i);
      const roleMatch = fullProfile.match(/(?:Current Role|Target Role|## Overview)[\s\S]*?([^\n]{10,80})/i);
      const name = nameMatch?.[1]?.trim() ?? "User";
      const role = roleMatch?.[1]?.trim() ?? "Job seeker";
      layers.profileMini = `${name} — ${role}\n[Full profile syncs on job_search / profile_update triggers. Turn ${msgCount}]`;
      layers.userProfile = undefined;
    }

    // Fire-and-forget: update sync state
    const syncState = await atlasState.readJson<SyncState>(ATLAS_FILES.syncState, {
      lastHydratedAt: now.toISOString(),
      persistenceMode: "db-active",
      healthMarkers: [],
    });
    void atlasState.writeJson(ATLAS_FILES.syncState, { ...syncState, lastHydratedAt: now.toISOString() });

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

  async syncLayersWithLlm(agentId: string, sessionId: string, update: { mind?: any; userProfile?: string; preferences?: any }, userId?: string): Promise<void> {
    if (update.mind) {
      const content = JSON.stringify(update.mind, null, 2);
      if (userId) {
        await atlasState.writeUserText(userId, ATLAS_FILES.mind, content);
      } else {
        await atlasState.writeText(ATLAS_FILES.mind, content);
      }
      await this.logContextMemory(`Updated mind.md via LLM continuity update.`);
    }
    if (update.userProfile) {
      if (userId) {
        await atlasState.writeUserText(userId, ATLAS_FILES.userProfile, update.userProfile);
      } else {
        await atlasState.writeText(ATLAS_FILES.userProfile, update.userProfile);
      }
      await this.logContextMemory(`Updated user_profile.md via LLM continuity update.`);
    }
    if (update.preferences) {
      if (userId) {
        await atlasState.writeUserJson(userId, ATLAS_FILES.preferences, update.preferences);
      } else {
        await atlasState.writeJson(ATLAS_FILES.preferences, update.preferences);
      }
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
