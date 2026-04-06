/**
 * Browser concurrency pool.
 *
 * Limits the number of simultaneous Playwright operations so a burst of
 * concurrent users doesn't launch unlimited browser contexts.
 *
 * Controlled by BROWSER_POOL_SIZE env var (default 2).
 * Requests beyond the limit are queued and served in order.
 */

const POOL_SIZE = Math.max(1, parseInt(process.env.BROWSER_POOL_SIZE ?? "2", 10));

let active = 0;
const queue: Array<() => void> = [];

function release() {
  active--;
  if (queue.length > 0) {
    const next = queue.shift()!;
    active++;
    next();
  }
}

/**
 * Acquire a slot from the pool. Returns a release function.
 * Call release() when the browser operation is complete.
 */
export function acquireBrowserSlot(): Promise<() => void> {
  return new Promise((resolve) => {
    if (active < POOL_SIZE) {
      active++;
      resolve(release);
    } else {
      queue.push(() => resolve(release));
    }
  });
}

export function getBrowserPoolStats() {
  return { active, queued: queue.length, poolSize: POOL_SIZE };
}
