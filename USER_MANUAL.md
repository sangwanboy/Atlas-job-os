# Atlas Job OS — User Manual

## Starting the App (Self-hosted / Dev)

Run these commands in **4 separate terminals** every time you start the app. Start them in order.

**Terminal 1 — PostgreSQL database**
```powershell
docker start atlas-db
```

**Terminal 2 — Redis**
```powershell
docker start atlas-redis
```

**Terminal 3 — Next.js dev server** (wait for "Ready on :3000" before opening the browser)
```powershell
Set-Location D:\Projects\Atlas-job-os
npm run dev
```

**Terminal 4 — Browser server** (powers job scraping and Chrome extension bridge)
```powershell
Set-Location D:\Projects\Atlas-job-os
npm run browser-server
```

**Terminal 5 — Background workers** (optional in dev, required in production)
```powershell
Set-Location D:\Projects\Atlas-job-os
npm run workers
```

Then open: **http://localhost:3000**

You'll land on the **Atlas landing page** — a public marketing page with animated hero, feature overview, FAQ, and a live beta slot counter. Click **"Claim Your Spot"** to register, or **"Sign In"** if you already have an account.

**Health check:** `http://localhost:3000/api/health` should return `{"status":"ok","db":"ok","redis":"ok"}`.

> **Important:** Always start `atlas-db` and `atlas-redis` Docker containers **before** running `npm run dev`. If Next.js starts before the database is up, Prisma's connection pool initialises against a dead socket and all DB queries will fail with `Can't reach database server at localhost:5432` — even after Docker starts. Fix: `docker start atlas-db` then Ctrl+C and restart `npm run dev`.

> **Windows tip:** Always use `Set-Location D:\Projects\Atlas-job-os` (not `cd /d`) in PowerShell to switch drives.

---

## What is Atlas Job OS?

Atlas is an AI-powered job search operating system. Instead of manually browsing job boards, you talk to Atlas in plain English. Atlas searches multiple job sites simultaneously using your real logged-in browser (via the Chrome extension), scores each role against your CV profile, and manages your entire job pipeline — from discovery to application tracking to email follow-ups.

**Key capabilities:**
- Natural-language job search across 6 UK platforms simultaneously
- Automatic description + skills extraction from each listing page
- CV-based match scoring (relevance + fit)
- Full pipeline management: status, notes, priority, apply tracking
- Gmail integration for email thread linking and follow-up drafting
- AI memory system that learns your preferences across sessions

---

## Landing Page

When you visit Atlas for the first time at `http://localhost:3000`, you'll see the public landing page. This is where new users learn about Atlas and sign up.

**What's on the landing page:**
- **Hero section** — animated headline showing what Atlas does, a live beta counter, and floating glass cards previewing Atlas's search, scoring, and pipeline features
- **Social proof** — scrolling quotes from beta testers
- **How It Works** — 3 simple steps: Upload CV → Agent searches → Review & approve outreach
- **Features** — 6 feature cards covering all major Atlas capabilities
- **Demo Preview** — an animated replica of the Atlas dashboard
- **FAQ** — answers to common questions (click to expand)
- **Sign up CTA** — "Claim Your Spot" button (or "Join Waitlist" if all 50 beta slots are taken)

**Beta access:** The first 50 users who register get instant access. After that, new registrations are added to a waitlist. Admin accounts are not counted toward the 50-slot limit.

**Sidebar badge:** Once logged in, you'll see a **BETA · v1.0** badge in the bottom-left of the sidebar — a visual reminder that Atlas is in beta.

---

## Getting Started

### 1. Upload Your CV

Go to **My CV** in the left sidebar.

- Click **Upload CV** and select your PDF or Word document.
- Atlas extracts your profile automatically using AI.
- After processing you'll see a **Profile Preview** showing what Atlas knows about you — name, location, skills, experience.

**Tagging your CV:**

| Tag | When to use |
|-----|-------------|
| Professional | Your main career CV |
| Part-time | Casual / flexible work |
| Role-specific | Tailored for one type of role |
| General | All-purpose, entry-level |

You can upload multiple CVs with different tags. Atlas uses the active profile when scoring jobs.

---

### 2. Chat with Atlas

Go to **Agent Workspace** in the left sidebar.

Type naturally — Atlas understands intent:

> "Find me software engineer jobs in London"
> "Search for KFC crew member roles near Coventry"
> "Get financial analyst positions in London, posted this week"

**What Atlas does with a job search:**

1. Opens a dedicated Atlas tab in your Chrome/Edge browser (via the extension)
2. Searches all 6 platforms in parallel — LinkedIn, Indeed, Reed, TotalJobs, Adzuna, CV-Library
3. Scrapes job cards from search results (title, company, location, URL)
4. For each job: navigates to the listing page, waits for the content script to auto-extract full details
5. Returns structured results: title, company, location, salary, job type, full description, skills
6. Scores every result against your CV and search query
7. Presents them in the **Job Discovery Preview** box in the chat

Atlas streams its response in real-time. Simple messages respond in ~3 seconds. Job searches take 15–60s depending on the number of job pages visited. Click the **stop button** at any time to cancel — this also closes the Atlas tab immediately.

---

## Parallel Job Search (Chrome Extension)

Atlas searches **all 6 platforms simultaneously** using named background tabs in your real browser:

| Platform | Notes |
|----------|-------|
| LinkedIn | Requires being logged in to LinkedIn in your browser |
| Indeed | Includes country-code variants (e.g., uk.indeed.com) |
| Reed | UK-focused, strong for permanent roles |
| TotalJobs | UK-focused, broad coverage |
| Adzuna | Aggregator — pulls from many sources |
| CV-Library | UK specialist boards |

All 6 are searched in parallel, results are merged, scored, and deduplicated together. The extension keeps 3 detail-page scrapes running concurrently within each platform for speed.

### Cookie Banners Are Auto-Accepted

The extension automatically dismisses cookie consent overlays on all supported platforms using common GDPR banner selector patterns. You do not need to interact with them manually.

### Source Labels

Every job card shows which platform it came from. If all cards show the same source, reload the extension (see Chrome Extension Setup → Troubleshooting).

### If a Platform Returns No Results

- Ensure you are logged in to that platform in the same browser before starting the search
- Some platforms (e.g., LinkedIn) rate-limit searches — wait 30–60 seconds and retry
- The extension uses human-like typing delays and cookie-banner dismissal to avoid blocks

---

## The Job Discovery Preview Box

When Atlas finds jobs, a preview panel appears in the chat:

```
┌─────────────────────────────────────────────────┐
│ 10 STAGED ROLES          [Import All] [Dismiss] │
├─────────────────────────────────────────────────┤
│ Graduate Software Engineer                      │
│ Tata Technologies • Warwick, England            │
│ ⚡ 95% match  💰 £28k–£30k  Full-time  🕒 3w ago │
│ LinkedIn                    View listing ↗      │
│                              [Import]            │
└─────────────────────────────────────────────────┘
```

**Badges explained:**
- **⚡ % match** — relevance to your search query (green = strong, amber = partial, grey = weak)
- **💰** — colour-coded salary: **grey** = not disclosed, **blue** = competitive/negotiable, **green** = stated figures
- **Job type** — Full-time / Part-time / Contract / Temporary (violet badge)
- **🕒** — how long ago it was posted
- **Source** — which job board it came from

**Actions:**
- **Import** (per card) — saves that single job to your pipeline with full description and skills
- **Import All** — saves all staged jobs at once
- **Dismiss** — clears the preview without saving
- **View listing ↗** — opens the original job page in a new tab

> Jobs already in your pipeline are marked **✅ Imported** automatically — duplicates are detected by job title + company name, so tracking-parameter URL variations don't create false duplicates.

---

## Job Pipeline

Go to **Jobs** in the left sidebar.

This is your full tracking board. Every imported job is here with:

- Title, company, location, salary
- Full description and skills (extracted from the job page via content script)
- Apply URL, source platform
- Status: **Discovered → Applied → Interview → Offer → Rejected**
- Priority level: Low / Medium / High
- CV match score and relevance score
- Date added, date posted

**Filtering and searching:**
Use the search bar to filter by keyword, or click column headers to sort by date, score, or salary.

**Updating a job from chat:**
> "Mark the Tata Technologies role as Applied"
> "Set the Barclays job to High priority"
> "Add a note to the Amazon job: interview scheduled for Thursday"

**Re-fetching details:**
If a job is missing its description or skills, open the Job Review Drawer (click any row) and click **Re-fetch Details**. Atlas navigates to the listing page and extracts fresh content.

---

## CV Match Score

Every job card shows two scores:
- **⚡ X% relevance** — How closely the job title/location matches your search query
- **📄 X% CV fit** — How well the job matches your uploaded CV (role, skills, location, salary)

The CV fit badge is colour-coded:
- 🔵 Blue (70%+) — Strong match
- 🟣 Violet (40–69%) — Partial match
- ⬜ Grey (<40%) — Weak match

The CV fit badge is hidden until you upload and process your CV.

---

## Settings

Go to **Settings** in the left sidebar.

### What Regular Users See

- **Active AI Model** — shows the current global provider and model (set by admin)
- **Your token usage** — monthly usage bar showing how many tokens you've used
- **Gmail Integration** — connect/disconnect your Gmail account

### Admin-Only Settings

Admins see additional sections (regular users do not see these):

**LLM Providers & Models**
- Global Default Provider and Model (applies to all users)
- Per-provider API keys (masked on read)
- Model enablement and default model per provider
- Model Selection Window — enable/disable specific models per provider

**Token Usage & Runtime Controls**
- Monthly Token Budget and Soft Limit
- Per Response Token Cap
- Max Jobs Per Search (pool size, default 20)
- Output Per Prompt (how many jobs appear in preview box, default 10)
- Rate Limit (requests/hour per user)
- Monthly Budget (USD) per user
- Safety toggles: auto-summarize, strict loop protection, strict agent response, provider fallback, PII redaction
- Usage by provider breakdown

---

## Atlas Memory System

Atlas remembers things between sessions using a layered memory system:

| Layer | What it stores | Scope |
|-------|---------------|-------|
| **Soul** | Core mission and principles | Shared — same for all users |
| **Identity** | Name ("Atlas"), communication style | Shared — same for all users |
| **Operating Rules** | Job search rules and constraints | Shared — same for all users |
| **User Profile** | Your name, background, preferences | **Per-user** — completely private |
| **Mind** | Atlas's current understanding of you | **Per-user** — completely private |
| **Preferences** | Your job type/location/salary preferences | **Per-user** — completely private |
| **History** | Past conversations | **Per-user** — completely private |
| **CV Profile** | Your extracted skills and experience | **Per-user** — completely private |

**Every new user starts with a clean slate.** Atlas has no knowledge of other users.

The **Memory Health** panel (bottom of the Agent Profile sidebar) shows which layers are loaded and when they were last synced.

---

## Email Integration (Gmail)

### Connecting Gmail
Go to **Settings** → **Gmail Integration** → click **Connect Gmail**. This opens Google's OAuth consent screen where you grant read-only + draft access. Atlas never sends emails without your approval.

### Syncing
- Click **Sync Now** to manually pull new job-related email threads
- **Auto-attach Threads** — automatically links incoming emails to matching jobs in your pipeline
- **Draft-First Mode** — Atlas generates reply drafts for your review, never sends directly

### Using Gmail with Atlas
> "Sync my inbox"
> "Check for any replies about the Amazon application"
> "Write a follow-up email for the Tata Technologies interview thread"

### Disconnecting
Go to **Settings** → click **Disconnect**. This revokes the OAuth token and removes all stored credentials. Your emails remain untouched in Gmail.

---

## Admin Features

### User Management (`/admin/users`)
Admins can:
- View all registered users with their roles and registration dates
- Promote users to Admin or demote to User
- Reset any user's password
- Delete users

### Push Atlas Config
After customising your Atlas agent (go to **Agent Workspace** and send a message first), click **Push Atlas Config** on the Users page to propagate your Atlas soul, identity, and operating rules to all existing users.

**Workflow:**
1. Open **Agent Workspace** → send any message (creates your Atlas agent in the database)
2. Customise Atlas as needed through conversation
3. Go to **Admin → Users → Push Atlas Config**
4. All users' Atlas agents are updated with your configuration

### Beta Feedback (`/admin/feedback`)
View all beta feedback submitted via the 💬 Feedback button. Feedback is stored in `data/feedback.jsonl` and optionally forwarded to a Slack/Discord webhook via `FEEDBACK_WEBHOOK_URL` in `.env.local`.

---

## Chrome Extension Setup

The extension works in both **Chrome** and **Edge** (Chromium-based). It gives Atlas full control of your real logged-in browser sessions, bypassing LinkedIn and Indeed auth walls entirely.

**Installing in Chrome:**
1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the `chrome-extension` folder inside the project
4. Start the browser server: `npm run browser-server` (keep the terminal open)
5. The extension auto-connects — click **service worker** on the extension card to confirm: `[Atlas] Connected to bridge at ws://localhost:3002`

**Installing in Edge:**
1. Open Edge → `edge://extensions`
2. Enable **Developer mode** (bottom-left toggle)
3. Click **Load unpacked** → select the `chrome-extension` folder inside the project
4. Start the browser server: `npm run browser-server`
5. Click **service worker** on the extension card → confirm `[Atlas] Connected to bridge at ws://localhost:3002`

**How it works:**
- Atlas opens a dedicated background tab in your browser for job browsing
- The content script auto-fires when the tab lands on a job listing page, extracting full details without needing screenshot OCR
- All other tabs are untouched
- The tab closes automatically when the search completes
- Keep-alive mechanism (alarm every ~12s + storage ping every 10s) keeps the service worker alive in both Chrome and Edge

**If the extension shows ERR_CONNECTION_REFUSED:**
The browser server isn't running. Start `npm run browser-server` — the extension retries every 3 seconds.

**If the extension disconnects in Edge after inactivity:**
Open `edge://extensions/` → find **Atlas Job OS** → click the **reload** (circular arrow) icon. Reconnects within a few seconds.

**If LinkedIn shows a sign-in wall in the Atlas tab:**
Log into LinkedIn in a regular browser tab first. The Atlas tab shares your browser session.

**If source labels all show the wrong platform:**
The extension is running an older version of `background.js`. Open the extensions page → find Atlas → click the circular refresh icon to reload it. It auto-reconnects within seconds.

---

## Tips for Best Results

**Be specific in searches:**
> ✅ "Find part-time barista jobs in Birmingham, within 10 miles"
> ❌ "Find jobs"

**Use your CV tags:**
Upload a hospitality CV tagged **Part-time** and a tech CV tagged **Professional**. Atlas picks the right one per search context.

**Import then refine:**
> "Remove all the jobs that require 5+ years experience"
> "Prioritise the remote roles"
> "Show only jobs with stated salaries above £30k"

**Managing your pipeline from chat:**
> "Clear the pipeline" — removes all staged jobs from the current session
> "Delete the Tata Technologies job" — removes by name
> "Show me the pipeline in the preview box" — re-renders your current jobs as preview cards

**Check the match score:**
- ⚡ 80%+ — strong keyword match to your query
- ⚡ 40–79% — partial match, worth reviewing
- ⚡ <40% — looser fit, Atlas included it but verify relevance

---

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Send message | Enter |
| New line in message | Shift + Enter |
| New chat | Click **+ New Chat** |
| Stop generation | Click the **cyan stop button** (appears while Atlas is typing) |

---

## Sending Feedback (Beta)

See the **💬 Feedback** button in the bottom-right corner of every page.

1. **Choose a type** — Bug 🐛, Suggestion 💡, or Other 💬
2. **Describe the issue** — What happened? What did you expect?
3. **Hit Send** — Goes directly to the team

Your email and the current page URL are captured automatically.

---

## Troubleshooting

**"LinkedIn is temporarily blocking automated access"**
LinkedIn rate-limits searches periodically. Wait 30–60 seconds, or search a different platform:
> "Search Indeed for software engineer jobs in London"

**Jobs have no salary shown**
Many employers don't publish salaries. Grey badge = not disclosed. Blue = competitive/negotiable. Green = stated figures.

**Jobs imported with empty description/skills**
Open the Job Review Drawer → click **Re-fetch Details**. The extension navigates to the listing and re-extracts. Requires the browser server to be running.

**Atlas responds conversationally instead of searching**
Start a new chat. The fast-path classifier routes all job/role/search intent to tool mode — if it missed, a fresh session resets the context.

**Atlas calls `get_pipeline` but shows no output**
Start a new chat. The orchestrator now always displays the real pipeline result and never allows pre-generated LLM text to override a tool result.

**Atlas seems slow**
Simple messages respond in ~3s. Job searches take 15–60s due to browser automation and detail-page scraping. For faster simple responses, use Gemini Flash (ask your admin).

**Atlas shows `<continuity_update>` or JSON tags in chat**
Fixed — internal sync blocks are stripped from the stream before display. Refresh the page if you still see them.

**CV profile shows wrong information**
Delete the CV and re-upload a clean digital PDF (not a scanned image).

**Dashboard Pipeline shows 0 after a job search**
Redis may not be running. Start it with `docker start atlas-redis`. Imported jobs always show correctly regardless of Redis state.

**`[Redis] connection error:` in server logs**
Start Redis: `docker start atlas-redis`. The app continues without it but pending jobs (previewed, not imported) are lost on server restart and rate limiting is disabled.

**Port conflict — `ClientFetchError: Unexpected token '<'`**
A stale Node.js process is on port 3000. Kill it: `cmd /c "taskkill /F /IM node.exe"`. Then restart: `npm run dev` first (wait for "Ready on :3000"), then `npm run browser-server`.

**Windows — `npm error: Could not read package.json`**
You're in the wrong directory. In PowerShell: `Set-Location D:\Projects\Atlas-job-os` (not `cd /d`).

**Rate limit error: "Rate limit exceeded"**
You've exceeded your hourly request limit. Wait for the `Retry-After` period, or ask your admin to raise the limit.

---

## Architecture Overview (for developers)

```
User chat → Next.js API (/api/agents/chat)
            │
            ├─ Rate limit check (Redis sliding window, per user)
            ├─ Monthly token budget check (DB-backed TokenUsage table)
            │
            ↓
          ConversationOrchestrator
          [auth + getAgent in parallel]
          [history + continuity layers in parallel]
            ↓
          Gemini 2.0 Flash (Vertex AI) ← CV profile + memory layers
          [SSE streaming with system_instruction separation]
          [Fast-path: lightweight prompt for simple messages]
          [<continuity_update> blocks stripped from stream]
            ↓
          Tool: browser_extract_jobs
            ↓
          ExtensionBridge → Chrome Extension (ws://localhost:3002)
          [6 platforms in parallel via named background tabs]
          [Phase 1: scrapeJobCards — DOM card extraction]
          [Phase 2: scrapeJobListing — navigate to listing + content script auto-scrape]
          [3 concurrent detail scrapes per platform batch]
            ↓
          Content script (content.js) fires on job listing page:
          — detects URL pattern (LinkedIn/Indeed/Reed/TotalJobs/Adzuna/CV-Library/Glassdoor)
          — extracts title, company, location, salary, jobType, datePosted, description (5k cap)
          — extractSkillsFromText() — regex patterns for 25 tech/soft skills
          — sends job_detail_scraped message to background
          — background stores in lastScrapedDetail Map (tabId → data)
          — scrapeJobListing command polls map, falls back to executeScript if content script missed
            ↓
          preview_jobs tool
            ↓
          Redis (pending:session:{sid}, 2h TTL) ← pending jobs stored here
            ↓
          Preview box in chat → user clicks Import / Import All
            ↓
          import_pending_jobs tool → Prisma → PostgreSQL

Background (npm run workers):
  BullMQ Worker: job-scrape   ← heavy scrape tasks off HTTP thread
  BullMQ Worker: gmail-sync   ← background Gmail polling
  Both backed by Redis queues
```

**Key files:**
- `src/lib/redis.ts` — ioredis singleton, pending jobs helpers, rate limiting
- `src/lib/logger.ts` — Pino structured logger
- `src/lib/queue/` — BullMQ queue definitions and workers
- `src/lib/services/agent/conversation-orchestrator.ts` — tool router + AI orchestration
- `src/lib/services/browser/extension-bridge.ts` — WebSocket bridge to Chrome extension
- `src/lib/services/browser/service/browser-service.ts` — extractJobsViaExtension, parallel detail scraping
- `src/lib/services/ai/provider.ts` — Vertex AI / LLM provider abstraction
- `src/lib/services/agent/token-budget-manager.ts` — DB-backed token tracking
- `chrome-extension/background.js` — service worker, command handler, scrapeJobListing
- `chrome-extension/content.js` — per-page auto-scraper, extractSkillsFromText
- `src/components/agents/agent-chat-starter.tsx` — chat UI with preview box
- `src/components/jobs/job-review-drawer.tsx` — job detail drawer with Re-fetch Details
