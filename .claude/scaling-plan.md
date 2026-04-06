# Atlas Job OS — Full Scalability Plan
_Written: 2026-04-06 | Resume after /compact_

---

## Current State (what we know from code audit)

- DB: PostgreSQL via Prisma — solid foundation ✓
- Auth: NextAuth v5, JWT strategy — stateless, good ✓
- Redis: in .env but **never used** — biggest quick win
- pendingJobsStore: `globalThis.__pendingJobsStore` — dies on restart, no multi-instance
- local_jobs.json: flat file in project_memory/ — not multi-user, not multi-instance
- localJobsCache: 24h TTL file cache — silently wipes data, already burned the user
- tokenBudgetManager: exists but no per-user enforcement
- No job queue — scraping/LLM run sync in request thread
- No rate limiting anywhere
- Browser server: single Playwright process, no pooling

---

## Priority 1 — CRITICAL (blocks any real multi-user use)

### 1a. Replace globalThis.__pendingJobsStore → Redis
- File: `src/lib/services/agent/conversation-orchestrator.ts`
- Key pattern: `pending:session:{sid}` with 2h TTL
- Use `ioredis` (already likely in deps or add it)
- Impact: fixes multi-instance, fixes restart data loss, fixes user isolation for pipeline stage

### 1b. Replace local_jobs.json → Redis or Postgres
- File: `src/lib/services/jobs/local-jobs-cache.ts`
- Option A: Redis hash `localcache:user:{userId}` with 24h TTL (fast, simple)
- Option B: Promote to full Prisma Job records immediately (no cache layer)
- Recommendation: Option B — localJobsCache is a dev crutch, not needed if DB writes are fast enough
- Impact: kills the silent 24h wipe, works across instances

### 1c. Add per-user rate limiting middleware
- File: `src/middleware.ts` (create or extend)
- Use Redis sliding window: `ratelimit:user:{userId}:scrape`, `ratelimit:user:{userId}:llm`
- Limits: 10 scrapes/hour, 100 LLM calls/hour per user
- Return 429 with Retry-After header
- Impact: prevents one user from burning everyone's budget

---

## Priority 2 — HIGH (needed before public launch)

### 2a. Job queue for background tasks
- Technology: BullMQ (uses Redis — already adding it)
- Queues needed:
  - `job-scrape` — browser extraction jobs
  - `job-import` — DB write batches
  - `gmail-sync` — email polling
- Files to change:
  - `src/lib/services/scraper/scraper-service.ts` → enqueue instead of inline run
  - `src/app/api/agents/chat/route.ts` → return job ID, poll for result
  - New: `src/lib/queue/` — queue definitions + workers
- Impact: scraping no longer blocks HTTP thread, retries on failure, observable

### 2b. Database connection pooling
- Add PgBouncer OR switch to Prisma Accelerate
- Current: Prisma opens direct connections — dies under load
- Config: `DATABASE_URL` → connection pooler URL
- Impact: handles 100s of concurrent users without "too many connections"

### 2c. Prisma query optimisation
- `saveJobToDB`: `company findFirst` has no index on `name` → add `@@index([name])` to Company model
- `dashboard/stats`: 4 separate count queries → collapse to single GROUP BY query
- Jobs list page: add cursor-based pagination (no OFFSET at scale)
- File: `prisma/schema.prisma`

### 2d. Per-user token budget enforcement
- `tokenBudgetManager` already exists — wire it to the chat route
- Add `tokenUsage` table to Prisma: `userId, date, inputTokens, outputTokens, cost`
- Block requests when monthly budget exceeded, show usage in settings
- Files: `src/lib/services/agent/token-budget-manager.ts`, `prisma/schema.prisma`

---

## Priority 3 — MEDIUM (growth phase)

### 3a. Browser server pooling
- Current: single Playwright process at browser-server
- Fix: pool of N browser contexts, queue requests
- Use `generic-pool` or BullMQ concurrency setting
- Config: `BROWSER_POOL_SIZE=4` in .env

### 3b. Horizontal scaling readiness
- Remove ALL remaining globalThis usage (search: `globalThis`)
- Move session affinity to Redis (already done by 1a)
- Add `INSTANCE_ID` env var for logging
- Ensure `next.config.js` has `output: 'standalone'` for Docker

### 3c. Observability
- Add structured logging: replace `console.log` → `pino` logger with `userId`, `sessionId`, `traceId`
- Add `/api/health` endpoint: DB ping + Redis ping + response time
- Add error tracking: Sentry (1 line in `next.config.js`)

### 3d. Job data archiving
- Add `archivedAt` field to Job model
- Cron: archive jobs older than 90 days with status REJECTED/ARCHIVED
- Keeps hot table small, query performance stable

---

## Priority 4 — FUTURE (post-launch)

- Multi-tenancy org support (teams sharing a pipeline)
- CDN for static assets (Cloudflare)
- Read replicas for analytics queries
- AI provider fallback chain (Gemini → OpenAI → Groq on failure)
- Usage-based billing hooks (Stripe metered billing per LLM token)

---

## Files to Create (net new)

| File | Purpose |
|------|---------|
| `src/lib/redis.ts` | Singleton ioredis client |
| `src/lib/queue/index.ts` | BullMQ queue definitions |
| `src/lib/queue/workers/job-scrape.worker.ts` | Scrape worker |
| `src/lib/queue/workers/gmail-sync.worker.ts` | Gmail worker |
| `src/middleware.ts` | Rate limiting (extend existing if present) |
| `src/app/api/health/route.ts` | Health check endpoint |

## Files to Modify (key changes)

| File | Change |
|------|--------|
| `conversation-orchestrator.ts` | pendingJobsStore → Redis |
| `local-jobs-cache.ts` | file → Redis or remove |
| `prisma/schema.prisma` | Company name index, tokenUsage table |
| `src/app/api/agents/chat/route.ts` | Add rate limit check, queue enqueue |
| `src/app/api/dashboard/stats/route.ts` | Collapse 4 queries → 1 |

---

## Implementation Order (after /compact)

1. `src/lib/redis.ts` — singleton client (5 min)
2. pendingJobsStore → Redis (30 min)
3. Remove localJobsCache / promote to DB (20 min)
4. Rate limiting middleware (30 min)
5. BullMQ queues (1-2 hrs)
6. DB connection pooling config (15 min)
7. Prisma schema optimisations (20 min)
8. Per-user token tracking (45 min)
9. Health endpoint (10 min)
10. Observability / pino logging (30 min)
