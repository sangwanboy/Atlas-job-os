# Atlas Job OS — User Manual

## What is Atlas Job OS?

Atlas is an AI-powered job search operating system. Instead of manually browsing job boards, you talk to Atlas in plain English. Atlas searches multiple job sites, scores each role against your CV profile, and manages your entire job pipeline — from discovery to application tracking to email follow-ups.

---

## Getting Started

### 1. Upload Your CV

Go to **My CV** in the left sidebar.

- Click **Upload CV** and select your PDF or Word document.
- Atlas extracts your profile automatically using AI (Vertex AI vision for scanned PDFs, pdf-parse for digital PDFs).
- After processing you'll see a **Profile Preview** showing what Atlas knows about you — name, location, skills, experience.

**Tagging your CV:**
Each uploaded CV can be tagged to control which jobs Atlas targets it against:

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

Atlas uses whichever extraction mode is available:

**With Chrome Extension (recommended):**
1. Opens a dedicated Atlas tab in your Chrome browser
2. Navigates to the job search results page (LinkedIn / Indeed)
3. Scrapes job cards from the DOM (title, location, URL)
4. Visits each job page → takes a full-page screenshot → sends to Vertex AI for OCR extraction
5. Returns structured results: title, company, location, salary, job type, full description
6. Presents them in the **Job Discovery Preview** box

**Without extension (Playwright fallback):**
1. Searches 8 UK job boards in parallel (LinkedIn, Indeed, Reed, TotalJobs, Adzuna, CV-Library, Monster, CWJobs)
2. Uses a stealth Chromium browser with fingerprint spoofing
3. Scores each card against your search query and extracts full details

Atlas streams its response in real-time. Simple messages respond in ~3 seconds. Job searches take 15–60s depending on the number of job pages visited. Click the **cyan stop button** at any time to cancel — this also closes the Atlas tab immediately.

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
- **⚡ % match** — how well the job title/company matches your search query (green = strong, amber = partial, grey = weak)
- **💰** — salary badge is colour-coded: **grey** = not disclosed/N/A, **blue** = competitive/negotiable/market rate, **green** = actual figures stated
- **Job type** — Full-time / Part-time / Contract / Temporary (violet badge)
- **🕒** — how long ago it was posted
- **Source** — which job board it came from

**Actions:**
- **Import** (per card) — saves that single job to your pipeline
- **Import All** — saves all staged jobs at once
- **Dismiss** — clears the preview without saving
- **View listing ↗** — opens the original job page in a new tab

> Jobs already in your pipeline are marked **✅ Imported** automatically — duplicates are detected by job title + company name, so tracking-parameter URL variations don't create false duplicates.

---

## Job Pipeline

Go to **Jobs** in the left sidebar.

This is your full tracking board. Every imported job is here with:

- Title, company, location, salary
- Full description and skills (extracted from the job page)
- Apply URL
- Status tracking: **Discovered → Applied → Interview → Offer → Rejected**
- Priority level: Low / Medium / High
- Date added

**Filtering and searching:**
Use the search bar at the top to filter by keyword, or click column headers to sort.

**Updating a job:**
Tell Atlas directly:

> "Mark the Tata Technologies role as Applied"
> "Set the Barclays job to High priority"

---

## Settings

Go to **Settings** in the left sidebar.

### LLM Provider
Choose which AI powers Atlas:

| Provider | Best for |
|----------|----------|
| Google Gemini (Vertex AI) | Default — fastest, best job analysis |
| OpenAI GPT-4.1 | Strong reasoning |
| Anthropic Claude | Nuanced writing |
| Groq | Speed |
| Mistral / DeepSeek / others | Cost-efficient |

Switch model mid-conversation — Atlas adapts immediately.

### Agent Behaviour
- **Max Turns** — how many tool calls Atlas can chain per response
- **Deterministic Mode** — lower temperature for more consistent responses
- **Memory Budget** — how much context Atlas retains between turns

### Admin-Controlled Global Settings
These are set by the admin and apply to **all users**:
- **Max Jobs Per Search** — total jobs Atlas scrapes per search across all platforms (pool size, default 20)
- **Output Per Prompt** — how many top-scored jobs appear in the chat preview box (default 10)

---

## Admin Features

### User Management (`/admin/users`)
Admins can:
- View all registered users with their roles
- Promote users to Admin or demote to User
- Reset any user's password
- Delete users
- Create new accounts directly

### Push Atlas Config
After customising your Atlas agent (go to **Agent Workspace** and send a message first), click **Push Atlas Config** on the Users page to propagate your Atlas soul, identity, and mind configuration to all existing users. New users are automatically seeded when they open Agent Workspace for the first time.

**Workflow:**
1. Open **Agent Workspace** → send any message (creates your Atlas agent in the database)
2. Customise Atlas as needed through conversation
3. Go to **Admin Users → Push Atlas Config**
4. All users' Atlas agents are updated with your configuration

---

## CV Management (Advanced)

In **My CV**:

- **Multiple CVs** — upload different versions for different job types
- **Profile Preview** — scroll to read what Atlas extracted (2000 char preview, full profile used internally)
- **Tag management** — click the tag pills (Professional / Part-time / Role-specific / General) to reassign at any time
- **Delete** — removes the file and its metadata

Atlas injects your active CV profile into every job search turn, so it always knows your background when scoring roles.

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

The **Memory Health** panel (bottom of the Agent Profile sidebar) shows which layers are loaded and when they were last synced.

**Every new user starts with a clean slate.** Atlas has no knowledge of other users — it learns your name, preferences, and work history exclusively through your own conversations.

---

## Email Integration (Gmail)

### Connecting Gmail
Go to **Settings** → **Gmail Integration** → click **Connect Gmail**. This opens Google's OAuth consent screen where you grant read-only + draft access. Atlas never sends emails without your approval.

### Syncing
- Click **Sync Now** to manually pull new job-related email threads
- **Auto-attach Threads** — automatically links incoming emails to matching jobs in your pipeline
- **Draft-First Mode** — Atlas generates reply drafts for your review, never sends directly

### Using Gmail with Atlas
Tell Atlas:

> "Sync my inbox"
> "Check for any replies about the Amazon application"

Atlas scans your Gmail for job-related threads and links them to pipeline entries.

Generate follow-up emails:

> "Write a follow-up email for the Tata Technologies interview thread"

### Disconnecting
Go to **Settings** → click **Disconnect**. This revokes the OAuth token and removes all stored credentials. Your emails remain untouched in Gmail.

---

## Tips for Best Results

**Be specific in searches:**
> ✅ "Find part-time barista jobs in Birmingham, within 10 miles"
> ❌ "Find jobs"

**Use your CV tags:**
Upload a hospitality-focused CV tagged **Part-time** and a tech CV tagged **Professional**. Atlas will use the right one per search context.

**Import then refine:**
Import a broad set first, then tell Atlas:
> "Remove all the jobs that require 5+ years experience"
> "Prioritise the remote roles"

**Managing your pipeline from chat:**
You can control the pipeline directly through Atlas without opening the Jobs page:
> "Clear the pipeline" — removes all staged jobs from the current session
> "Delete the Tata Technologies job" — removes a specific job by name
> "Show me the pipeline in the preview box" — renders your current staged jobs as preview cards

**Check the match score:**
- ⚡ 80%+ — strong keyword match to your query
- ⚡ 40–79% — partial match, worth reviewing
- ⚡ <40% — Atlas included it but it's a looser fit

---

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Send message | Enter |
| New line in message | Shift + Enter |
| New chat | Click **+ New Chat** |
| Stop generation | Click the **cyan circular button** (appears while Atlas is typing) |

---

## Chrome Extension Setup

The Chrome extension gives Atlas full control over your real logged-in Chrome browser. This bypasses LinkedIn and Indeed auth walls entirely.

**Installing:**
1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the `chrome-extension` folder inside the project
4. Start the browser server: run `start-browser-server.cmd` (keep the window open)
5. The extension auto-connects — click **service worker** on the extension card to confirm: `[Atlas] Connected to bridge at ws://localhost:3002`

**How it works:**
- Atlas opens a dedicated tab in your Chrome window for job browsing
- All other tabs are untouched
- The tab closes automatically when you stop Atlas or the search completes
- The extension stays alive via a keep-alive alarm (fires every ~25 seconds)

**If the extension shows ERR_CONNECTION_REFUSED:**
The browser server isn't running. Start `start-browser-server.cmd` — the extension retries every 3 seconds.

**If LinkedIn shows a sign-in wall in the Atlas tab:**
Log into LinkedIn in a regular Chrome tab first. The Atlas tab shares your Chrome session.

---

## Troubleshooting

**"LinkedIn is temporarily blocking automated access"**
If the extension is not connected, LinkedIn rate-limits scrapers periodically. Install the Chrome extension for bot-free access using your real session. Or try Indeed directly:
> "Search Indeed for software engineer jobs in London"

**Jobs have no salary shown**
Many employers don't publish salaries. Atlas shows a grey "Not disclosed" badge. If the listing says "Competitive" or "Negotiable", Atlas shows a blue badge. A green badge means an actual figure was stated.

**Port conflict — `ClientFetchError: Unexpected token '<'`**
A stale Node.js process is occupying port 3000, forcing Next.js onto port 3001, while `AUTH_URL` still points to :3000 — Auth.js gets HTML back instead of JSON. Fix: kill all node processes before starting dev.
- Windows: `taskkill /F /IM node.exe`
- Linux/macOS: `pkill node`
Then restart with `npm run dev`.

**Atlas seems slow**
Simple conversational messages (greetings, questions) respond in ~3 seconds using a lightweight fast-path. Job searches take 8–15 seconds due to browser automation. If Atlas feels slow on simple messages, check the model in use (shown in Agent Profile) — Gemini Flash is the fastest option.

**Atlas shows `<continuity_update>` or JSON in the chat**
This was a known bug (fixed). Update to the latest version — internal sync blocks are now stripped from the stream before display.

**CV profile shows wrong information**
Delete the CV and re-upload. If the PDF is a scanned image, Atlas uses Vertex AI vision — ensure your Google credentials are configured in Settings.

---

## Architecture Overview (for developers)

```
User chat → Next.js API (immediate status flush)
                              ↓
                    ConversationOrchestrator
                    [auth + getAgent in parallel]
                    [history + continuity in parallel]
                              ↓
                    Gemini (Vertex AI) ← CV profile + memory layers
                    [SSE streaming with system_instruction separation]
                    [Fast-path: lightweight prompt for simple messages]
                    [<continuity_update> blocks filtered in real-time]
                              ↓
                    Tool: browser_extract_jobs
                              ↓
                    ScraperService → worker.py (Playwright stealth)
                    [8 platforms in parallel]
                    [Persistent Chromium profile + fingerprint spoofing]
                    [scraper_selectors.json overrides loaded at startup]
                              ↓
                    Listing page scan (Bezier mouse, DOM cards)
                              ↓
                    Detail page scrape (direct, no delays)
                              ↓
                    preview_jobs tool → Preview box in chat
```

**Key files:**
- `src/lib/services/agent/conversation-orchestrator.ts` — tool router
- `src/lib/services/scraper/worker.py` — Playwright browser worker
- `src/lib/services/ai/provider.ts` — Vertex AI / LLM providers
- `src/lib/services/cv/` — CV extraction and profile generation
- `src/components/agents/agent-chat-starter.tsx` — chat UI
