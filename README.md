# AI Job Intelligence & Outreach Dashboard

Production-minded SaaS starter for job intelligence, scoring, outreach drafts, and stateful agent chat.

## Included in This Foundation

- Next.js App Router + TypeScript + Tailwind shell
- Sidebar/top nav + dashboard/jobs/agent workspace pages
- Prisma schema for job intelligence and agent orchestration
- **Crawl4AI Structured Engine** (Python-based) for high-fidelity job extraction
- Deterministic scoring engine and AI provider abstractions
- Identity-aware continuity sync (Mind, Soul, Identity, Rules, Profile)

## Quickstart

1. Install Node.js 20+ and Python 3.10+.
2. Install Node dependencies: `npm install`
3. Prepare the Scraper environment:
   - `python -m venv .venv-scraper`
   - Windows: `.venv-scraper\Scripts\activate`
   - Linux/Mac: `source .venv-scraper/bin/activate`
   - `pip install crawl4ai pydantic`
   - `playwright install chromium`
4. Copy environment values: `cp .env.example .env`
5. Initialize DB: `npm run prisma:setup` (generate/migrate/seed)
6. Start services:
   - `npm run dev` (Port 3000)

## High-Fidelity Job Discovery

The Atlas agent uses **Crawl4AI** with `JsonCssExtractionStrategy` for precise job metadata retrieval:
1. **Structured Extraction**: Captures Title, Company, Location, Date, and Snippets directly into JSON.
2. **Anti-Bot Resilience**: Configured with custom User-Agents and overlay removal to bypass LinkedIn/Google login walls.
3. **Real-Data-Only**: The pipeline is strictly decoupled from mock data; all jobs in `/jobs` are authentic discoveries.

## Continuity & Identity

Atlas is designed for persistent long-term memory.
- **Identity Sync**: All core agent files (`identity.md`, `soul.md`, `user_profile.md`) are synchronized on every single chat turn.
- **Local Resilience**: In addition to DB storage, all states are mirrored to `agents/atlas/` and `project_memory/` for zero-latency re-hydration.

## Admin Access

The application includes a built-in authentication bypass for local development. Provide the following key on the `/login` page:
- **Admin Key:** `admin`

Using this key will log you in as `admin@aijobos.local`, grant the `ADMIN` role, and unlock unrestricted usage limits for the autonomous browser agent tools.

## Initial Routes

- `/dashboard` overview widgets and trend chart
- `/jobs` jobs intelligence table
- `/agents/workspace` onboarding-first chat starter
- `/api/agents/chat` conversation orchestration API
- `/api/exports/jobs` XLSX export starter

## Notes

- Current AI provider implementation uses mock responses behind provider abstraction.
- Auth is intentionally boundary-ready and will be wired in next phase.
- Queue architecture is Redis/BullMQ-ready but synchronous for this foundation step.
