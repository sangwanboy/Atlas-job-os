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
| CV Parsing | Gemini multimodal API (PDF/images) + mammoth (DOCX) |
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

# AI Provider (used for chat AND CV parsing)
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
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed   # optional
```

### 5. Start the servers

```bash
npm run dev                                                                  # Next.js → port 3000
npx tsx src/lib/services/browser/server.ts > browser_server_out.txt 2>&1    # Browser service → port 3001
```

---

## Authentication

Navigate to `/login`.

**Default admin account:** `admin@jobos.local` / `admin123`

Admin users can manage all users at `/admin/users` (create, promote, reset password, delete).

---

## Features

### My CV (`/cv`)
Upload your CV in any format — Atlas reads it, builds a structured profile, and uses it to personalise every part of the job search.

**Supported formats:** PDF, DOC, DOCX, JPG, PNG, WebP, GIF (max 10 MB)

**What happens on upload:**
1. File saved to `uploads/cv/` (gitignored)
2. Background processing fires immediately:
   - PDF / images → Gemini multimodal API extracts text via OCR
   - DOCX → mammoth extracts raw text
   - Gemini generates a structured JSON profile: name, skills, experience, salary expectations, career goals, CV quality score, upgrade tips
3. `agents/atlas/user_profile.md` updated with structured profile
4. `agents/atlas/cv_summary.md` updated with upgrade tips and CV quality score
5. UI shows "✅ Profile Active" status banner with expandable profile preview
6. Manual re-process via the refresh (↺) button on any file

**How Atlas uses the profile:**
- **Job Scoring (mandatory):** Every job preview scored 1–100 vs the CV — technical skill match (40 pts) + experience level (25 pts) + location/remote preference (20 pts) + salary alignment (15 pts). Priority auto-set: HIGH ≥75, MEDIUM ≥50, LOW <50.
- **Upgrade Tips (mandatory):** After every search, Atlas outputs a "🔼 CV Upgrade Tips" block — skills that appear in discovered jobs but are missing from your CV (max 3 bullet points).
- **Smart Injection:** Full profile at turn 0 and every 7th message; compact 2-line mini-profile in between to save tokens.

---

### Job Discovery (Atlas Agent)
Uses **Crawl4AI** with CSS extraction + raw-HTML regex for high-fidelity structured job extraction from LinkedIn (primary) and Indeed (fallback).

**How it works:**
1. User asks Atlas to find jobs — Atlas calls `browser_extract_jobs`
2. Python worker scrapes LinkedIn/Indeed via Crawl4AI
3. Structured data (title, company, location, salary, date, URL) extracted
4. Results capped to **Max Jobs Per Search** (admin-configurable, default 20)
5. Atlas previews jobs in rich cards with CV match scores and "View listing ↗" links
6. User clicks **Import All** to save to the pipeline

**AI Model:** `gemini-3.1-pro-preview` default. Fallback chain on rate-limits: `gemini-3.1-flash-lite-preview` → `gemini-3-flash-preview` → `gemini-2.5-pro` → `gemini-2.5-flash`.

---

### Job Pipeline
- Status tracking: SAVED → APPLIED → INTERVIEW → OFFER / REJECTED
- Priority levels: LOW / MEDIUM / HIGH / URGENT (auto-set by CV match score)
- AI fit score (0–100), filter, sort, paginate
- Review drawer: full description, skills, direct listing link

### Outreach
- Generate tailored cover letters and follow-up emails
- Gmail sync and thread management
- AI-generated reply drafts

### Analytics
- Job application funnel, activity trends, score distribution charts

### Agent Chat (Atlas)
- Stateful multi-turn chat powered by Gemini
- Live tool execution indicators inside chat bubble
- Persistent memory: Soul, Identity, Mind, Rules, CV Profile layers loaded every turn
- Smart profile injection: full at turn 0 + every 7 messages
- Loop prevention, context memory logged to `agents/atlas/context_memory.md`
- Automatic model fallback on rate-limits

### Admin Settings (`/settings`)
- Max Jobs Per Search, Monthly Token Budget, Per Response Token Cap, Soft Limit %
- AI Provider & Model selector, per-provider API key management
- All settings persisted to `.runtime-settings.local.json`

---

## Project Structure

```
src/
├── app/
│   ├── (app)/
│   │   ├── dashboard/
│   │   ├── jobs/
│   │   ├── agents/workspace/
│   │   ├── analytics/
│   │   ├── outreach/
│   │   ├── cv/                   # CV upload + profile management page
│   │   ├── settings/
│   │   └── admin/users/
│   ├── api/
│   │   ├── agents/chat/          # Streaming chat (ndjson)
│   │   ├── cv/                   # CV upload (GET/POST/DELETE)
│   │   ├── cv/process/           # CV processing trigger + status (POST/GET)
│   │   ├── jobs/                 # Jobs CRUD
│   │   ├── admin/users/
│   │   ├── register/
│   │   └── integrations/         # Gmail, exports
├── components/
│   ├── agents/                   # Atlas chat UI
│   ├── jobs/                     # Jobs table + review drawer
│   └── layout/                   # Sidebar + top nav
├── lib/services/
│   ├── agent/                    # Orchestrator, prompt composer, memory sync
│   ├── cv/
│   │   ├── cv-extractor.ts       # Gemini multimodal + mammoth
│   │   └── cv-profile-generator.ts  # Structured profile via Gemini
│   ├── scraper/                  # ScraperService + worker.py (Crawl4AI)
│   ├── auth/                     # Local user store
│   └── ai/                       # AI provider abstraction
agents/
└── atlas/
    ├── soul.md / identity.md / mind.md / operating_rules.md
    ├── user_profile.md            # Auto-updated from CV uploads
    ├── cv_summary.md              # CV quality score + upgrade tips
    ├── preferences.json
    └── context_memory.md
uploads/
└── cv/                            # Uploaded CV files (gitignored)
.venv-scraper/                     # Python env for Crawl4AI
```

---

## API Routes

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/agents/chat` | Streaming chat (ndjson) |
| GET/POST | `/api/jobs` | List / create jobs |
| PUT/DELETE | `/api/jobs/[id]` | Update / delete job |
| GET/POST/DELETE | `/api/cv` | List / upload / delete CV files |
| POST | `/api/cv/process` | Re-process CV → rebuild user profile |
| GET | `/api/cv/process` | Profile status + preview |
| POST | `/api/register` | Create new user |
| GET/POST | `/api/admin/users` | Admin user management |
| GET | `/api/agents/sessions` | Chat session list |
| POST | `/api/integrations/gmail/sync` | Sync Gmail inbox |
| GET | `/api/exports/jobs` | Export jobs as XLSX |

---

## Notes

- **Auth:** Users are stored in-memory in dev (`local-user-store.ts`). Wire Prisma adapter for production.
- **Crawl4AI:** LinkedIn actively blocks bots. The worker uses stealth user-agents. Results may vary.
- **CV files:** Stored at `uploads/cv/`, excluded from Git. Replace with S3 for production.
- **Mobile responsive:** Hamburger sidebar, responsive tables, adaptive layouts throughout.

---

## Troubleshooting

### Atlas returns 500 on every chat request
Check your `.env.local` contains all required fields:
```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<same value as AUTH_SECRET>
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/atlas_db
```
The Zod env schema validates these as required strings at module load time. Missing any one of them will crash every API route.

### `ReferenceError: runtimeSettingsStore is not defined`
This was a known bug — `runtimeSettingsStore` was used inside `conversation-orchestrator.ts` without being imported. Fixed in the current codebase. If you see it again, add:
```ts
import { runtimeSettingsStore } from "@/lib/services/settings/runtime-settings-store";
```
to the top of `src/lib/services/agent/conversation-orchestrator.ts`.
