import { getRedis } from "@/lib/redis";

type MemoryEntry = {
  agentId: string;
  summary: string;
  importance: number;
  createdAt: string;
};

const MEMORY_TTL = 86400; // 24 hours

function redisKey(agentId: string): string {
  return `memory:agent:${agentId}`;
}

async function readEntries(agentId: string): Promise<MemoryEntry[]> {
  try {
    const raw = await getRedis().get(redisKey(agentId));
    if (!raw) return [];
    return JSON.parse(raw) as MemoryEntry[];
  } catch {
    return [];
  }
}

async function writeEntries(agentId: string, entries: MemoryEntry[]): Promise<void> {
  try {
    await getRedis().setex(redisKey(agentId), MEMORY_TTL, JSON.stringify(entries));
  } catch {
    // fail-open
  }
}

export class MemoryService {
  // Kept synchronous for callers that don't await; returns "" as fail-open default.
  // Use getRelevantSummaryAsync for callers that can await.
  getRelevantSummary(agentId: string): string {
    return "";
  }

  async getRelevantSummaryAsync(agentId: string): Promise<string> {
    const entries = await readEntries(agentId);
    const top = [...entries]
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 3)
      .map((entry) => entry.summary);
    return top.join(" | ");
  }

  writeMemory(agentId: string, summary: string, importance = 0.6): void {
    void (async () => {
      const current = await readEntries(agentId);
      current.push({
        agentId,
        summary,
        importance,
        createdAt: new Date().toISOString(),
      });
      await writeEntries(agentId, current);
    })().catch(() => {});
  }

  // Kept synchronous for callers that don't await; returns 0 as fail-open default.
  // Use getMemoryCountAsync for callers that can await.
  getMemoryCount(agentId: string): number {
    return 0;
  }

  async getMemoryCountAsync(agentId: string): Promise<number> {
    const entries = await readEntries(agentId);
    return entries.length;
  }
}

export const memoryService = new MemoryService();
