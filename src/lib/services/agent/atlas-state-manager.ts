import * as fs from "fs/promises";
import * as path from "path";
import { prisma } from "@/lib/db";
import { agentProfileSyncStore } from "@/lib/services/agent/agent-profile-sync";

const ATLAS_DIR = path.join(process.cwd(), "agents", "atlas");

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
  private cacheTTL = 5000; // 5 seconds cache for read-heavy bursts
  
  private async ensureDir() {
    try {
      await fs.mkdir(ATLAS_DIR, { recursive: true });
    } catch {}
  }

  private getPath(filename: string) {
    return path.join(ATLAS_DIR, filename);
  }

  async readText(filename: string, fallback = ""): Promise<string> {
    const cached = this.cache.get(filename);
    if (cached !== undefined) return cached;

    try {
      const content = await fs.readFile(this.getPath(filename), "utf-8");
      this.cache.set(filename, content);
      return content;
    } catch {
      return fallback;
    }
  }

  async writeText(filename: string, content: string): Promise<void> {
    this.cache.set(filename, content);
    await this.ensureDir();
    await fs.writeFile(this.getPath(filename), content, "utf-8");
  }

  async readJson<T>(filename: string, fallback: T): Promise<T> {
    const cached = this.cache.get(filename);
    if (cached !== undefined) {
      try { return JSON.parse(cached) as T; } catch { /* ignore and read from disk */ }
    }

    try {
      const data = await fs.readFile(this.getPath(filename), "utf-8");
      this.cache.set(filename, data);
      return JSON.parse(data) as T;
    } catch {
      return fallback;
    }
  }

  async writeJson<T>(filename: string, data: T): Promise<void> {
    const str = JSON.stringify(data, null, 2);
    this.cache.set(filename, str);
    await this.ensureDir();
    await fs.writeFile(this.getPath(filename), str, "utf-8");
  }

  async appendNdJson<T>(filename: string, data: T): Promise<void> {
    this.cache.delete(filename); // Invalidate cache on append
    await this.ensureDir();
    await fs.appendFile(this.getPath(filename), JSON.stringify(data) + "\n", "utf-8");
  }

  async appendText(filename: string, data: string): Promise<void> {
    this.cache.delete(filename); // Invalidate cache on append
    await this.ensureDir();
    await fs.appendFile(this.getPath(filename), data + "\n", "utf-8");
  }
}

export const atlasState = new AtlasStateManager();
