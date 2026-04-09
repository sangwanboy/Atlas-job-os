/**
 * In-memory sliding window rate limiter.
 * Works at the edge and in Node.js — no Redis dependency.
 * For production at scale, swap to Redis-based (see redis.ts checkRateLimit).
 */

interface RateLimitEntry {
  timestamps: number[];
}

const stores = new Map<string, Map<string, RateLimitEntry>>();

function getStore(namespace: string): Map<string, RateLimitEntry> {
  let store = stores.get(namespace);
  if (!store) {
    store = new Map();
    stores.set(namespace, store);
  }
  return store;
}

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [, store] of stores) {
    for (const [key, entry] of store) {
      entry.timestamps = entry.timestamps.filter((t) => now - t < 3600_000);
      if (entry.timestamps.length === 0) store.delete(key);
    }
  }
}, 300_000).unref?.();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

/**
 * Check and consume one rate limit token.
 * @param namespace - e.g. "login", "register"
 * @param key - e.g. IP address or user ID
 * @param limit - max attempts within the window
 * @param windowMs - sliding window in milliseconds
 */
export function rateLimit(
  namespace: string,
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const store = getStore(namespace);
  const now = Date.now();
  const windowStart = now - windowMs;

  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  // Prune expired timestamps
  entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

  if (entry.timestamps.length >= limit) {
    const oldest = entry.timestamps[0];
    const retryAfterMs = oldest + windowMs - now;
    return { allowed: false, remaining: 0, retryAfterMs };
  }

  entry.timestamps.push(now);
  return {
    allowed: true,
    remaining: limit - entry.timestamps.length,
    retryAfterMs: 0,
  };
}

/** Helper to extract client IP from request headers */
export function getClientIP(request: Request): string {
  const headers = new Headers(request.headers);
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "unknown"
  );
}
