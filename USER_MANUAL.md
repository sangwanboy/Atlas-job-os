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
1. Opens LinkedIn (then Indeed as fallback) in a stealth browser
2. Scrolls and scans job cards like a human would
3. Scores each card against your search query
4. Visits the top matching job pages individually
5. Extracts full details: description, salary, job type, date posted, applicant count, apply link
6. Presents them in the **Job Discovery Preview** box

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
- **💰** — salary range or "Not disclosed"
- **Job type** — Full-time / Part-time / Contract / Temporary (violet badge)
- **🕒** — how long ago it was posted
- **Source** — which job board it came from

**Actions:**
- **Import** (per card) — saves that single job to your pipeline
- **Import All** — saves all staged jobs at once
- **Dismiss** — clears the preview without saving
- **View listing ↗** — opens the original job page in a new tab

> Jobs already in your pipeline are marked **✅ Imported** automatically — no duplicates.

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
- **Max Jobs Per Search** — cap on how many jobs appear in the preview (default 20)
- **Deterministic Mode** — lower temperature for more consistent responses
- **Memory Budget** — how much context Atlas retains between turns

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

| Layer | What it stores |
|-------|---------------|
| **Soul** | Core mission and principles |
| **Identity** | Name, communication style |
| **History** | Past conversations and decisions |
| **CV Profile** | Your extracted skills and experience |

The **Memory Health** panel (bottom of the Agent Profile sidebar) shows which layers are loaded and when they were last synced.

---

## Email Integration (Gmail)

Tell Atlas:

> "Sync my inbox"
> "Check for any replies about the Amazon application"

Atlas scans your Gmail for job-related threads and links them to pipeline entries.

Generate follow-up emails:

> "Write a follow-up email for the Tata Technologies interview thread"

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

---

## Troubleshooting

**"LinkedIn is temporarily blocking automated access"**
LinkedIn rate-limits scrapers periodically. Wait 2–3 minutes and try again, or try Indeed directly:
> "Search Indeed for software engineer jobs in London"

**Jobs have no salary shown**
Many employers don't publish salaries. Atlas shows "Not disclosed" rather than inventing a figure.

**Atlas seems slow**
Response time is 8–15 seconds for job searches (browser automation takes time). For chat-only messages it should be under 5 seconds. The model in use (shown in Agent Profile) affects speed — Gemini Flash is the fastest option.

**CV profile shows wrong information**
Delete the CV and re-upload. If the PDF is a scanned image, Atlas uses Vertex AI vision — ensure your Google credentials are configured in Settings.

---

## Architecture Overview (for developers)

```
User chat → Next.js API → ConversationOrchestrator
                              ↓
                    Gemini (Vertex AI) ← CV profile + memory layers
                              ↓
                    Tool: browser_extract_jobs
                              ↓
                    ScraperService → worker.py (Playwright)
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
