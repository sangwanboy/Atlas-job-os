import * as fs from "node:fs";
import * as path from "node:path";
import type { ApplicationStatus, Priority, WorkMode } from "@/lib/domain/enums";

export type LocalJobRecord = {
  id: string;
  title: string;
  company: string;
  location: string;
  workMode: WorkMode;
  salaryRange: string;
  score: number;
  status: ApplicationStatus;
  priority: Priority;
  source: string;
  postedAt: string;
  sourceUrl?: string;
  discoveredAt?: string;
};

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const MEMORY_DIR = path.join(process.cwd(), "project_memory");
const JOBS_FILE = path.join(MEMORY_DIR, "local_jobs.json");

function ensureDirectory() {
  if (!fs.existsSync(MEMORY_DIR)) {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
  }
}

function readJobs(): LocalJobRecord[] {
  try {
    ensureDirectory();
    if (!fs.existsSync(JOBS_FILE)) return [];
    const content = fs.readFileSync(JOBS_FILE, "utf-8");
    return JSON.parse(content) as LocalJobRecord[];
  } catch (error) {
    console.error("[localJobsCache] Failed to read jobs:", error);
    return [];
  }
}

function writeJobs(jobs: LocalJobRecord[]) {
  try {
    ensureDirectory();
    fs.writeFileSync(JOBS_FILE, JSON.stringify(jobs, null, 2), "utf-8");
  } catch (error) {
    console.error("[localJobsCache] Failed to write jobs:", error);
  }
}

export const localJobsCache = {
  list(): LocalJobRecord[] {
    const all = readJobs();
    const now = Date.now();
    const fresh = all.filter(j => {
      if (!j.discoveredAt) return true; // legacy entries kept
      return now - new Date(j.discoveredAt).getTime() < TTL_MS;
    });
    if (fresh.length !== all.length) writeJobs(fresh); // auto-purge stale
    return fresh;
  },
  upsert(job: LocalJobRecord): void {
    const cache = readJobs();
    const index = cache.findIndex((item) => item.id === job.id);
    if (index >= 0) {
      cache[index] = job;
    } else {
      cache.unshift(job);
    }
    writeJobs(cache);
  },
  upsertMany(jobs: LocalJobRecord[]): void {
    const cache = readJobs();
    const now = new Date().toISOString();
    for (const job of jobs) {
      const index = cache.findIndex((item) => item.id === job.id);
      if (index >= 0) {
        cache[index] = { ...job, discoveredAt: cache[index].discoveredAt ?? now };
      } else {
        cache.unshift({ ...job, discoveredAt: now });
      }
    }
    writeJobs(cache);
  },
  updateStatus(jobId: string, status: ApplicationStatus): LocalJobRecord | null {
    const cache = readJobs();
    const index = cache.findIndex((item) => item.id === jobId);
    if (index < 0) {
      return null;
    }
    cache[index] = { ...cache[index], status };
    writeJobs(cache);
    return cache[index];
  },
  clear(): void {
    writeJobs([]);
  },
};
