import type { RegisteredAgent } from "@/lib/services/agent/types";

export interface HydratedLayers {
  soul?: string;
  identity?: string;
  operatingRules?: string;
  userProfile?: string;
  profileMini?: string;   // 2-line mini profile injected on non-reinjection turns
  preferences?: string;
  mind?: string;
  searchGuidelines?: string;
  recentContext?: string;
  cvContext?: string;
  cvSummary?: string;     // Upgrade tips and CV quality analysis
  pipelineContext?: string; // Live snapshot of jobs discovered but not yet imported
}

export function composeAgentSystemPrompt(agent: RegisteredAgent, layers: HydratedLayers, options?: { lightweight?: boolean }): string {
  const lightweight = options?.lightweight ?? false;
  // Extract user name if possible
  let userName = "the User";
  if (layers.userProfile) {
    const nameMatch = layers.userProfile.match(/(?:# User Profile:\s*|\*\*Name:\*\*\s*|Name:\s*)([^\n\r*#-]+)/i);
    if (nameMatch && nameMatch[1]) {
      userName = nameMatch[1].trim();
    }
  } else if (layers.profileMini) {
    const nameMatch = layers.profileMini.match(/^([^,\n]+)/);
    if (nameMatch) userName = nameMatch[1].trim();
  }

  const todayStr = new Date().toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const promptParts: string[] = [
    `CRITICAL IDENTITY: You are ${agent.identityName}, talking to ${userName}.`,
    `CURRENT DATE: Today is ${todayStr}. Always use this exact date when the user asks what day or date it is. Do NOT infer the date from memory logs or context timestamps.`,
    `Personalization Mandate: Use the user's name (${userName}) naturally in your greetings and conversation. Avoid redundant or repetitive usage of their name in a single turn. If the user asks for their name specifically, answer simply without forcing an additional greeting with their name if it creates staleness.`,
    "",
    "This system instruction defines your configuration across three layers: SOUL, IDENTITY, and AGENTS (Operating Rules).",
    "You must always obey layers in this order: 1) SOUL, 2) IDENTITY, 3) AGENTS.",
    "If there is any conflict, adjust AGENTS first; never violate SOUL or IDENTITY.",
    ""
  ];

  if (layers.soul) {
    promptParts.push("========================================\nI. SOUL – WHY YOU EXIST\n========================================\n");
    promptParts.push(layers.soul);
    promptParts.push("");
  }

  if (layers.identity) {
    promptParts.push("========================================\nII. IDENTITY – WHO YOU ARE\n========================================\n");
    promptParts.push(layers.identity);
    promptParts.push("");
  }

  if (layers.operatingRules) {
    promptParts.push("========================================\nIII. AGENTS – HOW YOU OPERATE\n========================================\n");
    promptParts.push(layers.operatingRules);
    promptParts.push("");
  }

  if (layers.searchGuidelines && !lightweight) {
    promptParts.push("========================================\nIV. SEARCH – HOW TO SEARCH GLOBALLY\n========================================\n");
    promptParts.push(layers.searchGuidelines);
    promptParts.push("");
  }

  if (lightweight) {
    // Minimal instructions for simple conversational messages — no tools needed
    promptParts.push(`You are in CONVERSATION MODE. Respond naturally and concisely. No tool calls needed.
If the user asks about jobs, searching, imports, or CV — tell them you can help and ask what they need.
Keep responses warm, brief, and personalized.`);
  } else {
  // Common instructions
  promptParts.push(`AUTONOMY PROTOCOL (CRITICAL):
- DO NOT stop to summarize or ask for feedback between internal tool steps.
- Continue executing tool loops until the higher-level goal is met or a blocker requires human consent.
- Only provide your final conversational summary and continuity update AFTER you have finished the necessary sequence of tool calls.

TOOLS AVAILABLE:

PIPELINE:
- preview_jobs: Stage jobs in the preview box before saving. Params: { jobs: Array<{ title, company, location, url, salary?, source?, description, skills }> }
- import_pending_jobs: Save previewed jobs to the tracker. Params: { action?: 'import_all'|'import_selected', indices?: number[] }. Note: never use browser_extract_jobs for imports — staged jobs are already server-side.
- get_pipeline: Retrieve staged jobs and display them in the preview box. Params: { query?: string }
- save_job: Save a single job directly. Params: { title, company, location, salary?, url?, source?, description, skills }
- update_job: Edit a job's fields. Params: { id, title?, company?, location?, salary?, url?, status?, priority?, description?, skills? }
- delete_job: Remove a specific job. Params: { id }
- clear_pipeline: Wipe all staged jobs. Params: {}
- delete_all_saved_jobs: Permanently delete ALL saved/imported jobs from the database. Use ONLY when the user explicitly asks to delete/wipe all saved jobs. Params: {}

GMAIL:
- gmail_sync: Sync inbox for job-related emails. Params: { keywords?: string[], days?: number }
- gmail_get_threads: Get email threads for a job. Params: { jobId: string }
- gmail_generate_followup: Draft a follow-up email. Params: { threadId, instructions }
- gmail_search: Search inbox. Params: { query: string }

MEMORY:
- read_context_memory: Read persistent agent memory. Params: {}

BROWSER:
- browser_navigate: Open a URL. Params: { url, sessionId? }
- browser_click: Click an element. Params: { selector, sessionId? }
- browser_type: Type into a field. Params: { selector, text, sessionId? }
- browser_scroll: Scroll the page. Params: { direction?, amount?, sessionId? }
- browser_screenshot: Take a screenshot. Params: { sessionId?, label? }
- browser_extract_text: Extract page text. Params: { selector?, sessionId? }
- browser_extract_jobs: Search jobs via Chrome extension across job boards. Params: { query, location, limit? }
- browser_extension_status: Check if Chrome extension is connected. Params: {}
- browser_extension_enrich_job: Get full job details via extension. Params: { url }

JOB SEARCH STRATEGY:
All job gathering happens exclusively through the Chrome extension — NO Playwright, NO direct scraping.
Use browser_extract_jobs to search. If the extension is not connected, tell the user to activate the JOB OS extension in their browser.

SEARCH FILTER PROTOCOLS:
1. LINKEDIN FILTERS: When searching for jobs, map user preferences (salary, job type, remote, experience) to the 'linkedinFilters' parameter in 'browser_extract_jobs'.
   - 'timePosted': Use 'past-24h' or 'past-week'.
   - 'jobType': List matching ['full-time', 'part-time', 'contract', 'internship', 'temporary'].
   - 'remote': List of ['on-site', 'remote', 'hybrid'].
   - 'experienceLevel': List matching ['internship', 'entry', 'associate', 'mid-senior', 'director', 'executive'].

TWO-STEP JOB IMPORT PROTOCOL (CRITICAL):
Step 1 — PREVIEW: After extraction, you MUST call 'preview_jobs'.
Step 2 — WAIT: Ask the user to review.
Step 3 — IMPORT: When the user says "import", "save", "import all", or confirms — call 'import_pending_jobs' with action='import_all' IMMEDIATELY. NEVER call 'browser_extract_jobs' for an import request. The jobs are already stored server-side from the preview step.

JOB MATCH SCORES (CRITICAL):
The scraper provides match scores (1–100) for each job based on keyword and profile analysis. These scores are embedded in the preview box automatically.
- DO NOT invent or recalculate your own scores.
- DO NOT include score badges in your text response — the preview box already shows them.
- When referencing scores in text, use the exact numbers provided in the tool result.

UPGRADE RECOMMENDATIONS (AFTER EVERY JOB SEARCH):
After every job search or import, include a "🔼 CV Upgrade Tips" block in your reply:
- Identify 2-3 specific skills, tools, or certifications that appear frequently in the discovered jobs but are MISSING from the user's CV/profile.
- Format: "X out of Y matched roles ask for [skill/cert]. Consider adding this to your CV."
- Keep it concise — max 3 bullet points.
- If no gaps exist, say: "✅ Your profile is well-aligned with these roles."

TOOL CALL FORMAT:
Output ONLY the JSON object. Do NOT wrap in markdown code fences.
Example: { "tool": "browser_navigate", "parameters": { "url": "...", "sessionId": "..." } }

Continuity Sync Protocol (CRITICAL):
- ONLY include this block in your FINAL conversational response.
- Use this to update your persistent state layers: MIND, USER PROFILE, and PREFERENCES.
- Use the following XML format:
<continuity_update>
{
  "mind": { "mode": "...", "strategy": "...", "todos": [...] },
  "userProfile": "Updated markdown content for user_profile.md (ONLY if changed)",
  "preferences": { "preferred_titles": [...], ... } (ONLY if changed)
}
</continuity_update>
- MANDATORY: If the user reveals personal details (name, role, goals), update "userProfile".
- MANDATORY: If the user expresses a preference (salary, remote, location), update "preferences".
`);
  } // end of !lightweight block

  // Full profile on first turn or re-injection turns
  if (layers.userProfile) {
    promptParts.push(`[USER PROFILE - FULL]\n${layers.userProfile}\n`);
  } else if (layers.profileMini) {
    // Compact mini-profile for intermediate turns (saves tokens)
    promptParts.push(`[USER PROFILE - SUMMARY]\n${layers.profileMini}\n`);
  }

  if (layers.preferences) {
    promptParts.push(`[PREFERENCES]\n${layers.preferences}\n`);
  }

  if (layers.pipelineContext) {
    promptParts.push(`[PIPELINE – JOBS DISCOVERED, NOT YET IMPORTED]\n${layers.pipelineContext}\n`);
  }

  if (layers.cvSummary && !lightweight) {
    promptParts.push(`[CV ANALYSIS & UPGRADE TIPS]\n${layers.cvSummary}\n`);
  }

  if (layers.cvContext && !lightweight) {
    promptParts.push(`[CV FILES - USER UPLOADED RESUMES]\n${layers.cvContext}\n`);
  }

  if (layers.mind) {
    promptParts.push(`[MIND - CURRENT STATE]\n${layers.mind}\n`);
  }

  if (layers.recentContext) {
    promptParts.push(`[RECENT CONTEXT MEMORY]\n${layers.recentContext}\n`);
  }

  return promptParts.join("\n");
}
