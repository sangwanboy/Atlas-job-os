import Redis from 'ioredis';

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    });
    redis.on('error', (err: Error) => {
      // Log but don't crash — app degrades gracefully without Redis
      console.error('[Redis] connection error:', err.message);
    });
  }
  return redis;
}

/**
 * Create a fresh Redis connection for BullMQ workers/queues.
 * BullMQ requires maxRetriesPerRequest: null (it uses blocking commands).
 * Each caller gets its own instance — do not share with getRedis().
 */
export function createBullMQConnection(): Redis {
  const conn = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
    enableOfflineQueue: true,
  });
  conn.on('error', (err: Error) => {
    console.error('[Redis/BullMQ] connection error:', err.message);
  });
  return conn;
}

/** Pending jobs store helpers — replaces globalThis.__pendingJobsStore */
const PENDING_TTL_SECONDS = 60 * 60 * 2; // 2 hours
const pendingKey = (sid: string) => `pending:session:${sid}`;

export interface PendingJobRedis {
  id?: string;
  title: string;
  company: string;
  location?: string;
  salary?: string;
  workMode?: string;
  jobType?: string;
  url?: string;
  sourceUrl?: string;
  source?: string;
  score?: number;
  description?: string;
  skills?: string | string[];
  postedDate?: string;
  isAlreadyImported?: boolean;
  matchScore?: number;
  dataRichness?: string;
}

export async function getPendingJobs(sid: string): Promise<PendingJobRedis[]> {
  try {
    const raw = await getRedis().get(pendingKey(sid));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function setPendingJobs(sid: string, jobs: PendingJobRedis[]): Promise<void> {
  try {
    await getRedis().setex(pendingKey(sid), PENDING_TTL_SECONDS, JSON.stringify(jobs));
  } catch (err) {
    console.error('[Redis] setPendingJobs failed:', (err as Error).message);
  }
}

export async function clearPendingJobs(sid: string): Promise<void> {
  try {
    await getRedis().del(pendingKey(sid));
  } catch (err) {
    console.error('[Redis] clearPendingJobs failed:', (err as Error).message);
  }
}

/** Pending CV helpers — session-scoped, same pattern as pending jobs */
export interface PendingCvRedis {
  filename: string;
  filePath: string;
  template: string;
  sections: string[];
  userId: string; // stored explicitly to prevent cross-user access
}

const pendingCvKey = (sid: string) => `pending_cv:${sid}`;
const PENDING_CV_TTL = 7200; // 2 hours

export async function getPendingCv(sid: string): Promise<PendingCvRedis | null> {
  try {
    const raw = await getRedis().get(pendingCvKey(sid));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function setPendingCv(sid: string, cv: PendingCvRedis): Promise<void> {
  try {
    await getRedis().setex(pendingCvKey(sid), PENDING_CV_TTL, JSON.stringify(cv));
  } catch (err) {
    console.error('[Redis] setPendingCv failed:', (err as Error).message);
  }
}

export async function clearPendingCv(sid: string): Promise<void> {
  try {
    await getRedis().del(pendingCvKey(sid));
  } catch (err) {
    console.error('[Redis] clearPendingCv failed:', (err as Error).message);
  }
}

/** Rate limiting helpers — sliding window counter */
const RL_WINDOW_SECONDS = 60 * 60; // 1 hour
const rlKey = (type: string, userId: string) => `ratelimit:${type}:user:${userId}`;

export async function checkRateLimit(
  type: 'llm' | 'scrape',
  userId: string,
  limit: number
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const key = rlKey(type, userId);
  const r = getRedis();
  const now = Date.now();
  const windowStart = now - RL_WINDOW_SECONDS * 1000;

  try {
    const pipeline = r.pipeline();
    pipeline.zremrangebyscore(key, '-inf', windowStart);
    pipeline.zadd(key, now, `${now}-${Math.random()}`);
    pipeline.zcard(key);
    pipeline.expire(key, RL_WINDOW_SECONDS);
    const results = await pipeline.exec();
    const count = (results?.[2]?.[1] as number) ?? 0;
    const resetAt = now + RL_WINDOW_SECONDS * 1000;
    return { allowed: count <= limit, remaining: Math.max(0, limit - count), resetAt };
  } catch {
    // Fail open — don't block users if Redis is down
    return { allowed: true, remaining: limit, resetAt: now + RL_WINDOW_SECONDS * 1000 };
  }
}
