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
| Job Scraping | Playwright + Patchright (Python, human-like stealth scraper) |
| Browser Automation | Playwright (Chromium) |
| Tables | TanStack React Table v8 |
| Charts | Recharts |
| Email Integration | Gmail API (googleapis) |
| Export | ExcelJS (XLSX) |

---

## Requirements

### System
- Node.js 20+
- Python 3.10+
- PostgreSQL (or Docker for DB)
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

### 4. Start the database (Docker — recommended)

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

### 5. Set up the database schema

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

### 6. Start the dev server

```bash
npm run dev            # Next.js on port 3000
npm run browser-server # Browser automation service on port 3002 (required for job scraping)
```

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

## Features

### Job Discovery (Atlas Agent)
The Atlas AI agent uses a **stealth Playwright browser** with human-like behavior (Bezier mouse curves, randomized fingerprints, warm-up navigation) for high-fidelity structured job extraction from LinkedIn, Indeed, Reed, TotalJobs, Adzuna, CV-Library, Monster, and CWJobs.

**How it works:**
1. User asks Atlas to find jobs (e.g. "Find nursing jobs in London")
2. Atlas calls `browser_extract_jobs` → spawns Python worker → Crawl4AI scrapes 8 UK platforms in parallel
3. Structured job data (title, company, location, salary, date) extracted via CSS selectors
4. Real job URLs extracted from `data-entity-urn` attributes in raw HTML → `linkedin.com/jobs/view/{id}/`
5. Results capped to **Max Jobs Per Search** limit (admin-configurable, default 20)
6. Atlas previews jobs in rich cards inside the chat bubble with **"View listing ↗"** links
7. User clicks **Import All** or **Import** (per card) to save to the pipeline

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
- **Live streaming** — tokens emitted in real-time via Gemini SSE with proper `system_instruction` separation
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

### Multi-Tenant Isolation
Every user has completely isolated data:
- **Jobs pipeline** — each user sees only their own imported jobs
- **Atlas agent** — auto-created per user on first chat, seeded from admin's template
- **Chat history** — sessions and messages scoped to userId
- **User profile** — `user_profile.md`, `mind.md`, `preferences.json` stored in `agents/atlas/users/{userId}/` (not shared)
- **Settings** — stored in `RuntimeSettingsRecord` table keyed by userId

### Admin Controls
- **Push Atlas Config** — `/admin/users` page button that copies admin's Atlas soul/identity/mindConfig to all existing users' agents. (Admin must start a chat first to seed their own agent.)
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
│   │   └── integrations/   # Gmail, exports
│   ├── login/
│   └── register/
├── components/
│   ├── agents/             # Atlas chat UI
│   ├── jobs/               # Jobs table + review drawer
│   └── layout/             # Sidebar + top nav
├── lib/
│   ├── server/
│   │   └── auth-helpers.ts # requireAuth() + isNextResponse() shared helpers
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
| POST | `/api/integrations/gmail/sync` | Sync Gmail inbox |
| GET | `/api/exports/jobs` | Export jobs as XLSX |

---

## Notes

- **Auth:** Users are stored in PostgreSQL via Prisma (`User` table with `passwordHash` + `role` columns). PBKDF2 hashed passwords. Default admin: `admin@jobos.local` / `admin123`.
- **Crawl4AI scraping:** LinkedIn actively blocks bots. The worker uses persistent Chromium profile + `playwright-stealth` fingerprint spoofing. Results may vary; the agent gracefully handles scraper failures and supports self-healing CSS selector overrides.
- **AI provider:** Defaults to Gemini. Configure `GEMINI_API_KEY` or Vertex AI credentials in your `.env`. The provider abstraction in `src/lib/services/ai/provider.ts` supports swapping to OpenAI or others.
- **Streaming:** Atlas uses Gemini SSE (`streamGenerateContent`) with proper `system_instruction` separation for fast responses. Falls back to batch response if SSE fails. Simple conversational messages use a lightweight prompt path for ~3s response times.
- **Bundler:** Uses standard webpack (not Turbopack) — Turbopack has a known React Client Manifest corruption bug in Next.js 15.5.x.
- **Mobile responsive:** Full mobile support with hamburger sidebar, responsive tables, and adaptive layouts.
