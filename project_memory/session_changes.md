# Atlas Job OS — Session Changes Log

> Written for future agents. Documents all changes made across development sessions.

---

## Session: April 1, 2026

### 1. Browser Server — Fixed `npm run browser-server` env loading
**File:** `package.json`
- Changed script from `tsx src/lib/services/browser/server.ts`
- To: `node --env-file=.env --env-file=.env.local --import=tsx/esm src/lib/services/browser/server.ts`
- **Why:** `tsx` doesn't auto-load `.env.local`, causing Zod env validation to crash on startup.

---

### 2. Atlas System Prompt — Full Tool Registry
**File:** `src/lib/services/agent/prompt-composer.ts`
- Replaced partial, hardcoded trigger-phrase tool list with a complete registry of all 20 tools.
- Grouped into: PIPELINE, GMAIL, MEMORY, BROWSER sections.
- Each entry has clean description + params only — no trigger phrases.
- **Why:** Atlas was hallucinating actions instead of calling tools, because many tools (e.g. `clear_pipeline`, `delete_job`, `gmail_search`, `read_context_memory`, `browser_extension_status`) were missing from the system prompt entirely.

---

### 3. `isSimpleChat` Regex — Expanded exclusions
**File:** `src/lib/services/agent/conversation-orchestrator.ts`
- Added to regex: `preview`, `pipeline`, `listing`, `show me`, `give me`, `clear`, `clr`, `delete`, `remove`, `reset`, `update`, `dismiss`
- **Why:** Short messages like "clr pipeline" or "show me in preview box" were classified as simple chat, disabling tools entirely and causing the agent to hallucinate.

---

### 4. `get_pipeline` — Now renders preview box
**File:** `src/lib/services/agent/conversation-orchestrator.ts`
- `get_pipeline` handler now emits `__PREVIEW_JOBS__...__END_PREVIEW__` marker.
- Maps `localJobsCache` jobs into the preview JSON format.
- **Why:** Asking "show me listings in preview box" called `get_pipeline` which returned plain text — preview box never rendered.

---

### 5. `clear_pipeline` + `delete_job` — Added missing handlers
**File:** `src/lib/services/agent/conversation-orchestrator.ts`
- Both tools were defined in `toolDescriptors` but had **zero handler code** in `executeToolCall`.
- `clear_pipeline`: now calls `localJobsCache.clear()` + `pendingJobsStore.set(sid, [])`.
- `delete_job`: removes job by ID from both `localJobsCache` and `pendingJobsStore`.
- **Why:** Ghost tools — Atlas called them, nothing happened.

---

### 6. Terminal tool loop break
**File:** `src/lib/services/agent/conversation-orchestrator.ts`
- After `clear_pipeline`, `delete_job`, or `import_pending_jobs` complete, tool loop breaks immediately.
- **Why:** After clearing, Atlas kept calling `get_pipeline` → got empty result → loop guard triggered → "Agent loop detected" error shown to user.

---

### 7. Zod error sanitizer — Fixed over-broad detection
**File:** `src/lib/services/agent/conversation-orchestrator.ts`
- Old: `rawMsg.startsWith("[") || rawMsg.includes('"code"')` — too broad, masked real errors.
- New: only sanitizes `[{"code":` or `[{"message":` (true Zod JSON arrays).
- Added `console.error` to log real errors to server.
- **Why:** Real errors (e.g. 401 from `/api/jobs`, salary null TypeError) were being shown as "Invalid parameters" hiding the root cause.

---

### 8. `preview_jobs` — Guard against empty array
**File:** `src/lib/services/agent/conversation-orchestrator.ts`
- Added check before Zod parse: if `jobs` array is empty/missing, returns `"No jobs to preview"` cleanly.
- **Why:** After clearing pipeline, Atlas tried `preview_jobs` with `[]`, Zod threw, raw error leaked into chat UI.

---

### 9. `/api/jobs` dedup check — Fixed 401 on internal calls
**File:** `src/app/api/jobs/route.ts`
- Added internal bypass: if `checkUrl` params present AND `x-internal-user-id` header set, skip `requireAuth()`.
- **File:** `src/lib/services/agent/conversation-orchestrator.ts`
- `getInternalJson` now accepts optional `internalUserId` param, passes as `x-internal-user-id` header.
- `preview_jobs` passes `userId` to `getInternalJson` for dedup check.
- **Why:** The dedup check inside `preview_jobs` made an unauthenticated server-to-server fetch → 401 → cascading failure in `browser_extract_jobs`.

---

### 10. Duplicate job deduplication — Fixed for extension path
**File:** `src/lib/services/agent/conversation-orchestrator.ts`
- **`preview_jobs`**: Changed dedup key from URL to `normalised(title)::normalised(company)`.
- **Extension path in `browser_extract_jobs`**: Added pre-dedup step before `localJobsCache.upsertMany` and `preview_jobs` call.
- **Why:** Job boards append different tracking IDs to the same job URL, making URL-based dedup useless. Was getting 119 duplicates out of 132 results.

---

### 11. `salary: null` — Fixed Zod schema
**File:** `src/lib/services/agent/conversation-orchestrator.ts`
- `previewJobSchema.salary`: changed from `z.string().optional()` to `z.string().nullable().optional().transform(v => v ?? undefined)`
- **Why:** Chrome extension returns `null` for salary when not listed. Zod rejected it, crashing all `browser_extract_jobs` calls.

---

### 12. Salary badge — Three-state display
**File:** `src/components/agents/agent-chat-starter.tsx`
- Grey: null / "Not disclosed" / "Not specified" / "N/A"
- Blue: "Competitive", "Negotiable", "Market rate", "Attractive"
- Green: actual salary figures
- **Why:** User wanted "Competitive" visually distinguished from "Not disclosed".

---

### 13. Auth fix — `AUTH_URL` added + port conflicts resolved
**File:** `.env.local`
- Added `AUTH_URL=http://localhost:3000`
- **Why:** Auth.js v5 needs `AUTH_URL` to construct session endpoint URLs. Without it + when Next.js binds to port 3001 (due to stale process on 3000), `ClientFetchError: Unexpected token '<'` appears.
- Pattern: always kill stale node processes before starting dev server.

---

## Architecture Notes for Future Agents

### Tool execution flow
```
User message → orchestrator.ts → isSimpleChat check → LLM rounds →
extractToolCalls() → executeToolCall() → tool handler → result back to LLM
```

### Key in-memory stores
- `localJobsCache` — file-backed (`project_memory/local_jobs.json`), 24h TTL, shared across sessions
- `pendingJobsStore` — in-memory Map keyed by `sessionId`, lost on server restart

### Preview box rendering
- Requires `__PREVIEW_JOBS__{json}__END_PREVIEW__` in assistant message content
- Tools that emit this: `preview_jobs`, `get_pipeline`
- Frontend strips the marker from displayed text, renders `<JobPreviewBox>`

### Extension bridge
- Chrome extension connects to `ws://localhost:3002` (started by browser server)
- Browser server runs on `http://localhost:3001`
- Next.js runs on `http://localhost:3000`
- Start order: `npm run dev` → `npm run browser-server`

### `isSimpleChat` — when tools are disabled
Short messages (<120 chars) not matching the keyword regex get `maxToolRounds=1` and lightweight system prompt.
**Current regex includes:** search, find, discover, import, save, extract, scrape, browse, navigate, screenshot, gmail, sync, email, cv, resume, upload, score, filter, draft, write, apply, follow-up, preview, pipeline, listing, show me, give me, clear, clr, delete, remove, reset, update, dismiss
