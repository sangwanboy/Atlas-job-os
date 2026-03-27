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
| AI Provider | Gemini (google-generative-ai) via abstracted provider |
| Job Scraping | Crawl4AI (Python, `JsonCssExtractionStrategy`) |
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
NEXTAUTH_URL=http://localhost:3000

# Auth (generate with: openssl rand -hex 32)
AUTH_SECRET=your_secret_here

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/atlas_db

# AI Provider
GEMINI_API_KEY=your_gemini_api_key_here

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

pip install crawl4ai pydantic
playwright install chromium
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env with your values
```

### 4. Set up the database

```bash
# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate

# Seed with initial data (optional)
npm run prisma:seed
```

### 5. Start the dev server

```bash
npm run dev        # Next.js on port 3000
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
The Atlas AI agent uses **Crawl4AI** with CSS extraction + raw-HTML regex for high-fidelity structured job extraction from LinkedIn and Indeed.

**How it works:**
1. User asks Atlas to find jobs (e.g. "Find nursing jobs in London")
2. Atlas calls `browser_extract_jobs` → spawns Python worker → Crawl4AI scrapes LinkedIn
3. Structured job data (title, company, location, salary, date) extracted via CSS selectors
4. Real job URLs extracted from `data-entity-urn` attributes in raw HTML → `linkedin.com/jobs/view/{id}/`
5. Results capped to **Max Jobs Per Search** limit (admin-configurable, default 20)
6. Atlas previews jobs in rich cards inside the chat bubble with **"View listing ↗"** links
7. User clicks **Import All** or **Import** (per card) to save to the pipeline

**Timeout protection:** Scraper has a 45-second hard timeout with SIGKILL to prevent hangs.

**AI Model:** Uses `gemini-3.1-pro-preview` by default with an automatic fallback chain on rate-limits: `gemini-3.1-flash-lite-preview` → `gemini-3-flash-preview` → `gemini-2.5-pro` → `gemini-2.5-flash`. The configured default is never silently changed.

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
- Stateful multi-turn AI chat powered by Gemini (`gemini-3.1-pro-preview` default)
- Live tool execution shown inside the chat bubble (tool names animate as they run)
- Session history with persistent memory across conversations
- Continuity sync: Soul, Identity, Mind, Rules layers loaded every turn
- Loop prevention guard
- Context memory logged to `agents/atlas/context_memory.md`
- Automatic model fallback on rate-limits — app stays responsive even if quota is exhausted

### Admin Settings (`/settings`)
- **Max Jobs Per Search** — cap how many job cards Atlas shows per search (default: 20, range: 1–200)
- **Monthly Token Budget** — total token cap across all providers
- **Per Response Token Cap** — max tokens per single AI response
- **Soft Limit Percent** — warning threshold before budget runs out
- **AI Provider & Model** — switch between Gemini, OpenAI, Anthropic etc.
- **API Keys** — per-provider key management (stored in `.env.local`, never committed)
- All settings persisted to `.runtime-settings.local.json`

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
│   ├── services/
│   │   ├── agent/          # Orchestrator, prompt composer, memory sync
│   │   ├── scraper/        # ScraperService + worker.py (Crawl4AI)
│   │   ├── auth/           # Local user store (in-memory for dev)
│   │   └── ai/             # AI provider abstraction (Gemini)
│   └── utils/
│       └── password.ts     # PBKDF2 password hashing (Web Crypto API)
├── auth.ts                 # NextAuth server-side config (Credentials provider)
├── auth.config.ts          # Edge-safe auth config (middleware compatible)
└── middleware.ts           # Route protection
agents/
└── atlas/                  # Atlas agent memory files
    ├── mind.md
    ├── soul.md
    ├── identity.md
    ├── user_profile.md
    ├── operating_rules.md
    ├── preferences.json
    └── context_memory.md
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
| GET | `/api/agents/sessions` | Chat session list |
| POST | `/api/integrations/gmail/sync` | Sync Gmail inbox |
| GET | `/api/exports/jobs` | Export jobs as XLSX |

---

## Notes

- **Auth without DB:** In development, users are stored in-memory via `src/lib/services/auth/local-user-store.ts`. For production, wire Prisma adapter.
- **Crawl4AI scraping:** LinkedIn actively blocks bots. The worker uses stealth user-agents and overlay removal. Results may vary; the agent gracefully handles scraper failures.
- **AI provider:** Defaults to Gemini. Configure `GEMINI_API_KEY` in your `.env`. The provider abstraction in `src/lib/services/ai/provider.ts` supports swapping to OpenAI or others.
- **Mobile responsive:** Full mobile support with hamburger sidebar, responsive tables, and adaptive layouts.
