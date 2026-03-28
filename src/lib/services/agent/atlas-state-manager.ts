import * as fs from "fs/promises";
import * as path from "path";
import { prisma } from "@/lib/db";
import { agentProfileSyncStore } from "@/lib/services/agent/agent-profile-sync";

const ATLAS_DIR = path.join(process.cwd(), "agents", "atlas");

// Files that are personal to each user — stored in agents/atlas/users/{userId}/
export const USER_SCOPED_FILES = new Set(["user_profile.md", "mind.md", "preferences.json"]);

function getUserDir(userId: string): string {
  return path.join(ATLAS_DIR, "users", userId);
}

export const ATLAS_FILES = {
  soul: "soul.md",
  identity: "identity.md",
  operatingRules: "operating_rules.md",
  userProfile: "user_profile.md",
  preferences: "preferences.json",
  mind: "mind.md",
  activeTask: "active_task.json",
  tasks: "tasks.json",
  syncState: "sync_state.json",
  browserSessionState: "browser_session_state.json",
  gmailState: "gmail_state.json",
  pipelineState: "pipeline_state.json",
  contextMemory: "context_memory.md",
  search: "search.md",
  longTermMemory: "long_term_memory.md",
  evidenceLog: "evidence_log.json",
  outreachMemory: "outreach_memory.md",
  runtimeEvents: "runtime_events.ndjson",
  agentSnapshot: "agent_snapshot.md",
  cvSummary: "cv_summary.md",
};

export class AtlasStateManager {
  private cache = new Map<string, string>();

  private async ensureDir(dir: string) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch {}
  }

  private getPath(filename: string): string {
    return path.join(ATLAS_DIR, filename);
  }

  private getUserPath(userId: string, filename: string): string {
    return path.join(getUserDir(userId), filename);
  }

  private cacheKey(filename: string, userId?: string): string {
    return userId ? `${userId}:${filename}` : filename;
  }

  // ─── Shared (Atlas identity) files ──────────────────────────────────────────

  async readText(filename: string, fallback = ""): Promise<string> {
    const key = this.cacheKey(filename);
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;
    try {
      const content = await fs.readFile(this.getPath(filename), "utf-8");
      this.cache.set(key, content);
      return content;
    } catch {
      return fallback;
    }
  }

  async writeText(filename: string, content: string): Promise<void> {
    this.cache.set(this.cacheKey(filename), content);
    await this.ensureDir(ATLAS_DIR);
    await fs.writeFile(this.getPath(filename), content, "utf-8");
  }

  async readJson<T>(filename: string, fallback: T): Promise<T> {
    const key = this.cacheKey(filename);
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      try { return JSON.parse(cached) as T; } catch { /* fall through */ }
    }
    try {
      const data = await fs.readFile(this.getPath(filename), "utf-8");
      this.cache.set(key, data);
      return JSON.parse(data) as T;
    } catch {
      return fallback;
    }
  }

  async writeJson<T>(filename: string, data: T): Promise<void> {
    const str = JSON.stringify(data, null, 2);
    this.cache.set(this.cacheKey(filename), str);
    await this.ensureDir(ATLAS_DIR);
    await fs.writeFile(this.getPath(filename), str, "utf-8");
  }

  async appendNdJson<T>(filename: string, data: T): Promise<void> {
    this.cache.delete(this.cacheKey(filename));
    await this.ensureDir(ATLAS_DIR);
    await fs.appendFile(this.getPath(filename), JSON.stringify(data) + "\n", "utf-8");
  }

  async appendText(filename: string, data: string): Promise<void> {
    this.cache.delete(this.cacheKey(filename));
    await this.ensureDir(ATLAS_DIR);
    await fs.appendFile(this.getPath(filename), data + "\n", "utf-8");
  }

  // ─── Per-user files (user_profile.md, mind.md, preferences.json) ────────────

  async readUserText(userId: string, filename: string, fallback = ""): Promise<string> {
    const key = this.cacheKey(filename, userId);
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;
    try {
      const content = await fs.readFile(this.getUserPath(userId, filename), "utf-8");
      this.cache.set(key, content);
      return content;
    } catch {
      return fallback;
    }
  }

  async writeUserText(userId: string, filename: string, content: string): Promise<void> {
    this.cache.set(this.cacheKey(filename, userId), content);
    await this.ensureDir(getUserDir(userId));
    await fs.writeFile(this.getUserPath(userId, filename), content, "utf-8");
  }

  async readUserJson<T>(userId: string, filename: string, fallback: T): Promise<T> {
    const key = this.cacheKey(filename, userId);
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      try { return JSON.parse(cached) as T; } catch { /* fall through */ }
    }
    try {
      const data = await fs.readFile(this.getUserPath(userId, filename), "utf-8");
      this.cache.set(key, data);
      return JSON.parse(data) as T;
    } catch {
      return fallback;
    }
  }

  async writeUserJson<T>(userId: string, filename: string, data: T): Promise<void> {
    const str = JSON.stringify(data, null, 2);
    this.cache.set(this.cacheKey(filename, userId), str);
    await this.ensureDir(getUserDir(userId));
    await fs.writeFile(this.getUserPath(userId, filename), str, "utf-8");
  }
}

export const atlasState = new AtlasStateManager();
