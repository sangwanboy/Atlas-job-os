# Atlas Job OS — AI Job Intelligence Dashboard

A production-minded, full-stack SaaS application for intelligent job discovery, scoring, outreach drafting, and stateful AI agent chat. Built with Next.js 15, React 19, TypeScript, Tailwind CSS, and Crawl4AI.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| UI | React 19 + Tailwind CSS v3 |
| Language | TypeScript 5 |
| Auth | NextAuth v5 (beta) — JWT + Credentials |
| ORM | Prisma 6 + PostgreSQL |
| AI Provider | Gemini via Vertex AI (service account) — `gemini-3-flash-preview` default |
| Job Scraping | Playwright + Patchright (Python, stealth) **or** Chrome Extension + LLM OCR |
| Browser Automation | Playwright (Chromium) + Chrome Extension (real logged-in Chrome) |
| Tables | TanStack React Table v8 |
| Charts | Recharts |
| Email Integration | Gmail API (googleapis) |
| Job Queue | BullMQ (Redis-backed background workers) |
| Cache / Session Store | Redis (ioredis) — pending jobs, rate limiting |
| Logging | Pino (structured JSON logs, pretty-printed in dev) |
| Export | ExcelJS (XLSX) |

---

## Requirements

### System
- Node.js 18.0.0+ (20 LTS recommended for production)
- Python 3.10+
- PostgreSQL 14+ (15+ recommended for production)
- Redis 6+ (or Docker — required for pending jobs store, rate limiting, and BullMQ)
- Chrome/Edge browser with Atlas extension (required for job scraping)
- Git

### Environment Variables (`.env` or `.env.local`)

```env
# App
NODE_ENV=development
NEXT_PUBLIC_APP_NAME=AI Job Intelligence Dashboard
NEXT_PUBLIC_APP_URL=http://localhost:3000
# NEXTAUTH_URL is optional — NextAuth v5 auto-detects from request host

# Auth (generate with: openssl rand -hex 32)
AUTH_SECRET=your_secret_here
AUTH_URL=http://localhost:3000

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/atlas_db

# AI Provider — Vertex AI (service account, recommended)
VERTEX_AI_PROJECT=your-gcp-project-id
VERTEX_AI_LOCATION=us-central1
GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json
DEFAULT_AI_MODEL=gemini-3.1-flash-lite-preview

# AI Provider — Direct Gemini API (alternative, no service account needed)
# GEMINI_API_KEY=your_gemini_api_key_here

# Gmail Integration (optional)
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
GMAIL_REDIRECT_URI=http://localhost:3000/api/integrations/gmail/callback

# Email notifications via Resend (optional — app works without it, emails are silently skipped)
RESEND_API_KEY=re_your_resend_api_key
EMAIL_FROM=Atlas <noreply@yourdomain.com>

# Browser service mode — "headed" shows Playwright window, "headless" runs silently
BROWSER_MODE=headed

# Redis — required for pending jobs store, rate limiting, and BullMQ workers
REDIS_URL=redis://localhost:6379

# Token budget — monthly USD cap per user before LLM requests are blocked
TOKEN_BUDGET_MONTHLY_USD=10.00

# Database connection pool (appended to DATABASE_URL automatically)
DATABASE_CONNECTION_LIMIT=10
DATABASE_POOL_TIMEOUT=10

# Browser concurrency pool — max simultaneous Playwright operations
BROWSER_POOL_SIZE=2

# Browser server URL (set if browser server runs on a different host)
BROWSER_SERVICE_URL=http://localhost:3001

# Sentry error tracking (optional — app works without it)
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_DSN=
SENTRY_ORG=
SENTRY_PROJECT=
SENTRY_AUTH_TOKEN=
```

---

## Setup

### 1. Install Node.js dependencies

```bash
npm install
```

### 2. Set up Python scraper environment

```bash
python -m venv .venv-scraper

# Windows
.venv-scraper\Scripts\activate

# Linux / macOS
source .venv-scraper/bin/activate

pip install crawl4ai pydantic playwright-stealth
playwright install chromium
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env with your values
```

### 4. Start Redis (Docker — recommended)

```bash
docker run -d \
  --name atlas-redis \
  -p 6379:6379 \
  --restart unless-stopped \
  redis:7-alpine
```

To stop / start later:
```bash
docker stop atlas-redis
docker start atlas-redis
```

### 5. Start the database (Docker — recommended)

Make sure **Docker Desktop** is running, then:

```bash
docker run -d \
  --name atlas-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=ai_job_dashboard \
  -p 5432:5432 \
  --restart unless-stopped \
  postgres:15
```

> This matches the default `DATABASE_URL` in `.env`:
> `postgresql://postgres:postgres@localhost:5432/ai_job_dashboard`

To stop / start later:
```bash
docker stop atlas-postgres
docker start atlas-postgres
```

### 6. Set up the database schema

```bash
# Generate Prisma client
npm run prisma:generate

# Push schema to DB (dev — no migration history)
npx prisma db push

# Or run migrations
npm run prisma:migrate

# Seed with initial data (optional)
npm run prisma:seed
```

### 7. Start the app

> **Start Docker containers before Next.js.** If `npm run dev` starts before `atlas-db` is up, Prisma initialises against a dead socket and all DB queries fail for the entire session. Always confirm Docker containers are running first.

Open **5 terminals** (PowerShell on Windows):

**Terminal 1 — PostgreSQL**
```powershell
docker start atlas-db
```

**Terminal 2 — Redis**
```powershell
docker start atlas-redis
```

**Terminal 3 — Next.js** (wait for "Ready on :3000")
```bash
npm run dev
```

**Terminal 4 — Browser server**
```bash
npm run browser-server
```

**Terminal 5 — BullMQ workers** (optional in dev)
```bash
npm run workers        # job-scrape + gmail-sync queues
```

> **Note:** `npm run browser-server` uses `node --env-file=.env --env-file=.env.local --import=tsx/esm` to ensure `.env.local` is loaded. Do not use `tsx` directly — it won't load `.env.local` and Zod env validation will crash on startup.

> **Both servers must run simultaneously.** The browser server (port 3001) powers Playwright tools and the job scraper. It also runs the Chrome Extension bridge on **port 3002**.

Health check once everything is running:
```
GET http://localhost:3000/api/health
→ {"status":"ok","db":"ok","redis":"ok"}
```

### 8. (Optional but recommended) Install the Chrome Extension

Load the extension for bot-free job searching using your real logged-in Chrome session:

1. Open Chrome → `chrome://extensions` (or `edge://extensions/` for Edge)
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select `D:\Projects\Atlas-job-os\chrome-extension\`
4. Start the browser server — the extension auto-connects to `ws://localhost:3002`
5. Verify: click **service worker** on the extension card → DevTools console shows `[Atlas] Connected to bridge at ws://localhost:3002`

> **After any changes to `background.js`**, you must reload the extension at `chrome://extensions` (or `edge://extensions/`) — click the circular refresh icon on the Atlas extension card. The service worker does not hot-reload.

When the extension is connected, Atlas searches all 6 platforms **simultaneously** (LinkedIn, Indeed, Reed, TotalJobs, Adzuna, CV-Library) using your real logged-in Chrome session — no bot detection, no auth walls. Playwright remains as fallback when the extension is not connected.

#### Browser Server Ports

| Port | Protocol | Purpose |
|------|----------|---------|
| 3001 | HTTP | Browser server REST API (Playwright tools, scraper) |
| 3002 | WebSocket | Chrome Extension bridge (real-browser job scraping) |

Both ports are started by a single `npm run browser-server` command.

---

## Authentication

### Login
Navigate to `/login`.

**Default admin account:**
- Email: `admin@jobos.local`
- Password: `admin123`

### Registration
Navigate to `/register` to create a new account.

### Admin Access
Admin users can manage all users at `/admin/users`:
- Create users (admin or regular)
- Promote / demote roles
- Reset passwords
- Delete accounts

---

## Landing Page & Beta Access

Atlas serves an animated public landing page at `/` — the first thing visitors see. The page features:

- **Hero section** — typewriter headline cycling through Atlas capabilities, animated gradient mesh background with floating particles, 3 glassmorphism UI mockup cards (searching, job score, pipeline kanban)
- **Live beta counter** — fetches from `/api/beta-slots`, shows "X of 50 spots remaining" with real-time animation. First 50 users get instant access; after that, new users are placed on a waitlist
- **Social proof** — infinite-scroll marquee of beta tester quotes
- **How it works** — 3-step scroll-reveal (Upload CV → Agent searches → Approve outreach)
- **Feature grid** — 6 animated cards covering all major capabilities
- **Demo preview** — browser-chrome-wrapped replica of the Atlas dashboard
- **FAQ accordion** — 7 common questions with animated expand/collapse
- **Footer CTA** — final conversion section with beta counter + registration link

**Beta mechanics:** Admin accounts are excluded from the 50-slot count. The CTA dynamically switches between "Claim Your Spot" and "Join Waitlist" based on remaining slots.

**Waitlist flow:** Users who register after all 50 slots are taken receive a `WAITLIST` status and a waitlist email. Admins can approve or reject waitlist users from `/admin/users` — approval sends an approval email and activates their account.

**Tech:** Framer Motion animations, CSS keyframe gradient mesh, Tailwind glassmorphism. All components in `src/components/landing/`.

---

## Features

### Job Discovery (Atlas Agent)
Atlas supports two job extraction modes depending on whether the Chrome extension is connected:

**Mode 1 — Chrome Extension (preferred)**
Uses the user's real logged-in Chrome browser via a WebSocket bridge. No bot detection, no auth walls.
- **Phase 1**: Navigate to job search results → DOM scrape job cards (title, company, location, URL)
- **Phase 2**: Visit each job detail page → DOM scrape full description → Vertex AI LLM cleanup → structured data with skills extraction
- Searches **6 UK platforms** in parallel: LinkedIn, Indeed, Reed, TotalJobs, Adzuna, CV-Library
- Each platform gets its own dedicated Chrome tab (reused across detail scrapes)
- Clicking **Stop** in chat closes the Atlas tab immediately
- Auto-expands "Show more" buttons before scraping to capture full descriptions

**Mode 2 — Playwright / Patchright (fallback)**
Used when extension is not connected. Stealth Chromium with Bezier mouse curves, randomized fingerprints, warm-up navigation. Searches the same 6 UK platforms via headless browser.

**Common flow:**
1. User asks Atlas to find jobs
2. Atlas checks extension status (`browser_extension_status`)
3. Extension path or Playwright path executes
4. Results capped to **Max Jobs Per Search** (admin-configurable, default 20)
5. Atlas previews jobs in rich cards with **"View listing ↗"** links
6. User clicks **Import All** or **Import** to save to pipeline

**Stealth browser:** Persistent Chromium profile (`src/agents/atlas/browser_profile/`) with Patchright + comprehensive fingerprint spoofing (canvas noise, WebGL vendor/renderer override, screen/connection spoofing, Bezier mouse movements, warm-up navigation via Google for realistic referrer chains).

**Self-healing selectors:** If a platform's DOM changes, Atlas receives a `dom_sample` and can call `update_scraper_selectors` to write new CSS overrides to `agents/atlas/scraper_selectors.json` — loaded at worker startup without a restart.

**Timeout protection:** Scraper has a 45-second hard timeout with SIGKILL to prevent hangs.

**AI Model:** Uses `gemini-3-flash-preview` by default with an automatic fallback chain on rate-limits: `gemini-3.1-flash-lite-preview` → `gemini-3.1-pro-preview` → `gemini-2.5-pro` → `gemini-2.5-flash`. The configured default is never silently changed.

### Job Pipeline
- View, filter, sort, and paginate all discovered jobs
- Status tracking: SAVED → APPLIED → INTERVIEW → OFFER / REJECTED
- Priority levels: LOW / MEDIUM / HIGH / URGENT
- AI fit score (0–100)
- Click "Review" to open a detail drawer with full job description, skills, and direct link to original listing

### Outreach
- Generate tailored cover letters and follow-up emails
- Gmail sync and thread management
- AI-generated reply drafts

### Analytics
- Job application funnel
- Activity trends
- Score distribution charts

### Agent Chat (Atlas)
- Stateful multi-turn AI chat powered by Gemini (`gemini-3-flash-preview` default)
- **Extension status banner** — the Agent Profile sidebar shows a live banner indicating whether the Chrome extension is connected or disconnected, with a direct link to setup instructions when not connected
- **Scraper progress timer** — an animated progress bar with elapsed-time counter is shown in the chat during job searches and remains visible while Atlas streams its response (does not disappear when the assistant starts typing)
- **Live streaming** — tokens emitted in real-time via Gemini SSE with proper `system_instruction` separation
- **Full tool registry** — all 20 tools are described in the system prompt (PIPELINE, GMAIL, MEMORY, BROWSER groups). Atlas reasons from descriptions alone — no hardcoded trigger phrases. New tools are auto-available once added to the registry.
- **Fast-path for simple messages** — greetings and conversational messages use a lightweight prompt (skips tool definitions, search guidelines, CV context) for ~3s response time instead of 30s+
- **Stop button** — cyan circular abort button cancels in-flight generation instantly
- Internal `<continuity_update>` blocks stripped from stream in real-time (never shown to user)
- Live tool execution shown inside the chat bubble (tool names animate as they run)
- Session history with persistent memory across conversations
- Continuity sync: Soul, Identity, Mind, Rules layers loaded every turn
- Loop prevention guard (max 10 tool rounds for users, 15 for admin)
- Context memory logged to `agents/atlas/context_memory.md` (agent-only log, not injected into LLM prompt)
- Automatic model fallback on rate-limits — app stays responsive even if quota is exhausted
- Parallelised orchestrator setup (auth + agent lookup, history + continuity in parallel)

### Background Workers (BullMQ)

Two BullMQ workers run in a separate process (`npm run workers`) backed by Redis:

| Queue | Purpose |
|-------|---------|
| `job-scrape` | Background job scraping (decoupled from HTTP thread, 2 concurrent, 3 retry attempts) |
| `gmail-sync` | Background Gmail polling (1 concurrent, 2 retry attempts) |

Workers are defined in `src/lib/queue/workers/` and started via `src/lib/queue/start-workers.ts`. SIGTERM/SIGINT handled for graceful shutdown.

### Rate Limiting & Token Budget

- **Rate limiting:** 100 LLM calls per user per hour enforced at `/api/agents/chat` via Redis sliding window. Returns `429 Too Many Requests` with `Retry-After` header.
- **Monthly token budget:** Configurable per-deployment via `TOKEN_BUDGET_MONTHLY_USD`. Token usage is recorded to the `TokenUsage` DB table after each Atlas response. Requests are blocked (429) when the monthly budget is exceeded.

### Health Check

`GET /api/health` returns:
```json
{ "status": "ok", "db": "ok", "redis": "ok", "ts": 1234567890 }
```
Returns `200` when all services are healthy, `503` (degraded) if DB or Redis is down. Use for load balancer health checks and uptime monitoring.

### Multi-Tenant Isolation
Every user has completely isolated data:
- **Jobs pipeline** — each user sees only their own imported jobs
- **Atlas agent** — auto-created per user on first chat, seeded from admin's template
- **Chat history** — sessions and messages scoped to userId
- **User profile** — `user_profile.md`, `mind.md`, `preferences.json` stored in `agents/atlas/users/{userId}/` (not shared)
- **Settings** — stored in `RuntimeSettingsRecord` table keyed by userId

### Email Notifications (Resend)

Atlas sends transactional emails via [Resend](https://resend.com) when `RESEND_API_KEY` is set. Emails are silently skipped (with a console warning) if the key is absent — the app works fully without it.

| Trigger | Email sent |
|---------|-----------|
| User registers within the 50-slot limit | Welcome email with sign-in link |
| User registers after slots are full | Waitlist confirmation email |
| Admin approves a waitlist user | Approval email with sign-in link |

HTML template uses Atlas brand colours (dark card, cyan BETA badge). Configured via `EMAIL_FROM` (sender address) and `NEXT_PUBLIC_APP_URL` (CTA link base).

### Admin Controls
- **Push Atlas Config** — `/admin/users` page button that copies admin's Atlas soul/identity/mindConfig to all existing users' agents. (Admin must start a chat first to seed their own agent.)
- **Waitlist management** — approve or reject waitlist users from `/admin/users`. Approving sends a Resend approval email and activates the account immediately.
- **Max Jobs Per Search** — global scraper pool cap, stored under `"global"` key, applies to all users (default: 20)
- **Output Per Prompt** — global preview box cap, how many top-scored jobs appear in chat (default: 10)
- **Monthly Token Budget**, **Per Response Token Cap**, **Soft Limit Percent** — runtime budget controls
- **AI Provider & Model** — global default model for all users
- **API Keys** — per-provider key management
- All runtime settings persisted to PostgreSQL `RuntimeSettingsRecord` table (multi-instance safe)

---

## Project Structure

```
src/
├── app/
│   ├── (app)/              # Authenticated app routes
│   │   ├── dashboard/
│   │   ├── jobs/
│   │   ├── agents/workspace/
│   │   ├── analytics/
│   │   ├── outreach/
│   │   ├── profile/
│   │   ├── settings/
│   │   └── admin/users/    # Admin-only user management
│   ├── api/
│   │   ├── agents/chat/    # Chat streaming endpoint (ndjson)
│   │   ├── jobs/           # Jobs CRUD
│   │   ├── admin/users/    # Admin user management API
│   │   ├── register/       # Registration endpoint
│   │   ├── feedback/           # Beta feedback submission
│   │   └── integrations/   # Gmail, exports
│   ├── login/
│   └── register/
├── components/
│   ├── landing/            # Public landing page (hero, nav, features, FAQ, etc.)
│   ├── agents/             # Atlas chat UI
│   ├── jobs/               # Jobs table + review drawer
│   └── layout/             # Sidebar + top nav (includes BETA v1.0 badge)
├── lib/
│   ├── redis.ts            # ioredis singleton + pending jobs helpers + rate limiting
│   ├── logger.ts           # Pino structured logger (pretty in dev, JSON in prod)
│   ├── server/
│   │   └── auth-helpers.ts # requireAuth() + isNextResponse() shared helpers
│   ├── queue/
│   │   ├── index.ts        # BullMQ queue definitions (job-scrape, gmail-sync)
│   │   ├── start-workers.ts # Worker entry point (npm run workers)
│   │   └── workers/
│   │       ├── job-scrape.worker.ts
│   │       └── gmail-sync.worker.ts
│   ├── services/
│   │   ├── agent/          # Orchestrator, prompt composer, memory sync
│   │   ├── scraper/        # ScraperService + worker.py (Crawl4AI)
│   │   ├── auth/           # User store (Prisma-backed, PostgreSQL)
│   │   └── ai/             # AI provider abstraction (Gemini)
│   └── utils/
│       └── password.ts     # PBKDF2 password hashing (Web Crypto API)
├── auth.ts                 # NextAuth server-side config (Credentials provider)
├── auth.config.ts          # Edge-safe auth config (middleware compatible)
└── middleware.ts           # Route protection
agents/
└── atlas/                  # Atlas shared identity files
    ├── soul.md             # Atlas's core mission (shared — all users)
    ├── identity.md         # Atlas's name/style (shared)
    ├── operating_rules.md  # Atlas's rules (shared)
    ├── search.md           # Search guidelines (shared)
    ├── context_memory.md   # System event log (shared)
    └── users/
        └── {userId}/       # Per-user memory (isolated)
            ├── user_profile.md   # User's personal profile
            ├── mind.md           # Atlas's state for this user
            └── preferences.json  # User's job preferences
prisma/
└── schema.prisma           # Full DB schema
.venv-scraper/              # Python virtual environment for Crawl4AI
```

---

## API Routes

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/agents/chat` | Streaming chat (ndjson) |
| GET/POST | `/api/jobs` | List / create jobs |
| PUT/DELETE | `/api/jobs/[id]` | Update / delete job |
| POST | `/api/register` | Create new user account |
| GET/POST | `/api/admin/users` | Admin user management |
| POST | `/api/admin/push-atlas-config` | Push admin's Atlas soul/identity to all users |
| GET | `/api/agents/sessions` | Chat session list |
| GET/PUT | `/api/settings/runtime` | Runtime settings (admin=global, user=own) |
| GET | `/api/dashboard/stats` | Per-user dashboard stats |
| GET | `/api/health` | Health check (DB + Redis ping) — 200 ok / 503 degraded |
| POST | `/api/integrations/gmail/sync` | Sync Gmail inbox |
| GET | `/api/exports/jobs` | Export jobs as XLSX |
| GET | `/api/beta-slots` | Public beta slot counter (slotsUsed, slotsRemaining, isWaitlist) |
| POST | `/api/feedback` | Submit beta feedback (saves to data/feedback.jsonl) |
| POST | `/api/admin/users/[id]/approve` | Approve a waitlist user (sends approval email) |
| POST | `/api/admin/users/[id]/reject` | Reject and delete a waitlist user |

---

## Beta Feedback & Error Tracking

Atlas ships with two feedback layers for beta testing:

### Automatic Error Capture (Sentry)
Install is included. Just add your DSN to `.env.local`:
```env
NEXT_PUBLIC_SENTRY_DSN=https://xxx@oXXX.ingest.sentry.io/XXX
SENTRY_DSN=https://xxx@oXXX.ingest.sentry.io/XXX
```
Create a free project at [sentry.io](https://sentry.io) to get your DSN. Every unhandled exception and API crash is captured automatically with stack trace + user context.

### Manual Feedback
Beta users can submit feedback via the Admin > Beta Feedback tab. Submissions are:
- Saved to `data/feedback.jsonl` (one JSON entry per line)
- Optionally pinged to a Slack/Discord channel via webhook:
```env
FEEDBACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx   # or Discord webhook URL
```

### Beta Version Badge
The app sidebar displays a **BETA · v1.0** badge in the lower-left corner (all states: expanded, collapsed, mobile). This is a visual indicator for beta testers.

---

## Notes

- **Auth:** Users are stored in PostgreSQL via Prisma (`User` table with `passwordHash` + `role` columns). PBKDF2 hashed passwords. Default admin: `admin@jobos.local` / `admin123`.
- **Crawl4AI scraping:** LinkedIn actively blocks bots. The worker uses persistent Chromium profile + `playwright-stealth` fingerprint spoofing. Results may vary; the agent gracefully handles scraper failures and supports self-healing CSS selector overrides.
- **AI provider:** Defaults to Gemini. Configure `GEMINI_API_KEY` or Vertex AI credentials in your `.env`. The provider abstraction in `src/lib/services/ai/provider.ts` supports swapping to OpenAI or others.
- **Streaming:** Atlas uses Gemini SSE (`streamGenerateContent`) with proper `system_instruction` separation for fast responses. Falls back to batch response if SSE fails. Simple conversational messages use a lightweight prompt path for ~3s response times.
- **Bundler:** Uses standard webpack (not Turbopack) — Turbopack has a known React Client Manifest corruption bug in Next.js 15.5.x.
- **Port conflict:** If `AUTH_URL` and Next.js are on different ports (e.g. stale node process forces Next.js to :3001), Auth.js will return HTML instead of JSON causing `ClientFetchError`. Always kill stale node processes before starting dev. On Windows use `cmd /c "taskkill /F /IM node.exe"` (plain `taskkill /F` fails in some shells). On Linux/macOS: `pkill node`. Then start Next.js first (`npm run dev`) and wait for "Ready on :3000" before starting the browser server.
- **Windows drive switching (PowerShell):** Use `Set-Location D:\Projects\Atlas-job-os` or `cd D:\Projects\Atlas-job-os` — both work in PowerShell without any flags. `cd /d D:\...` is cmd.exe syntax and will throw a parameter error in PowerShell. If you're using cmd.exe (not PowerShell), the `/d` flag is required.
- **Atlas not searching jobs:** If Atlas responds conversationally instead of searching, the fast-path classifier incorrectly marked the message as simple chat. Fixed Apr 3 2026: fast-path regex now includes `job`, `jobs`, `role`, `show`, `get me`, `look for`, `fetch`, `hire` etc. so job-related messages always enter full tool mode.
- **Atlas pipeline tool shows no output:** Fixed Apr 3 2026: `get_pipeline` now always shows the real tool result. Previously the LLM's pre-generated text (written before seeing the tool result) overwrote the actual pipeline data, causing silent tool calls with no visible output.
- **atlas-db container:** The PostgreSQL container is named `atlas-db` (not `atlas-postgres`). It has `--restart unless-stopped` set so it auto-starts with Docker Desktop. Never create a new container if `docker ps` shows nothing — always check `docker ps -a` first.
- **Mobile responsive:** Full mobile support with hamburger sidebar, responsive tables, and adaptive layouts.
- **Redis required:** Redis must be running for pending jobs persistence, rate limiting, and BullMQ workers. Start with `docker start atlas-redis`. If Redis is unavailable, the app degrades gracefully — rate limits fail open, pipeline count shows 0, pending jobs are lost on restart.
- **Workers are optional in dev:** `npm run workers` starts BullMQ background processors. In development you can skip this — scraping still works inline. Workers become important at scale to offload scraping from the HTTP thread.
- **Token budget:** Set `TOKEN_BUDGET_MONTHLY_USD` in `.env` to cap per-user AI spend. Usage is recorded in the `TokenUsage` Prisma table. Default is $10/month. Set to a high value or omit enforcement by setting it very high.
- **Standalone build:** `next.config.ts` uses `output: "standalone"` — the production build can be containerised with Docker without bundling `node_modules`.

---

## Production Deployment

### Recommended Environment Config

For 25–50 concurrent beta users, set these in your production `.env`:

```env
# Increase browser pool for concurrent users (default 2 is too low for production)
BROWSER_POOL_SIZE=4

# Increase DB connection pool (default 10 exhausts at 50 concurrent requests)
DATABASE_CONNECTION_LIMIT=25
DATABASE_POOL_TIMEOUT=30

# Error tracking (highly recommended for beta)
NEXT_PUBLIC_SENTRY_DSN=https://xxx@oXXX.ingest.sentry.io/XXX
SENTRY_DSN=https://xxx@oXXX.ingest.sentry.io/XXX

# Email notifications (required for waitlist/approval emails)
RESEND_API_KEY=re_your_key

# Browser server URL (if running on a separate host/container)
BROWSER_SERVICE_URL=http://localhost:3001
```

### Concurrent User Capacity Estimates

| Config | Estimated Capacity |
|--------|-------------------|
| Default (pool=2, db=10) | 5–10 concurrent users |
| Beta tuned (pool=4, db=25) | 25–50 concurrent users |
| Production (pool=8, db=50 + PgBouncer) | 100–200 concurrent users |

### System Requirements

| Component | Minimum | Production |
|-----------|---------|------------|
| Node.js | 18.0.0+ | 20 LTS |
| PostgreSQL | 14+ | 15+ with PgBouncer |
| Redis | 6.0+ | 7+ |
| RAM — Next.js | 512 MB | 2 GB |
| RAM — Browser Server | 2 GB | 8 GB |
| RAM — Workers | 512 MB | 1 GB |
| CPU | 2 cores | 4+ cores |
| Storage | 10 GB | 50 GB+ |

### Pre-Beta Checklist

- [ ] `BROWSER_POOL_SIZE=4` set in production `.env`
- [ ] `DATABASE_CONNECTION_LIMIT=25` set in production `.env`
- [ ] `NEXT_PUBLIC_SENTRY_DSN` + `SENTRY_DSN` configured
- [ ] `RESEND_API_KEY` configured for email notifications
- [ ] `npx prisma migrate deploy` run on production DB
- [ ] Admin user seeded (`npm run prisma:seed`)
- [ ] Chrome/Edge extension loaded and verified connected
- [ ] `GET /api/health` returns `{"status":"ok","db":"ok","redis":"ok"}`
