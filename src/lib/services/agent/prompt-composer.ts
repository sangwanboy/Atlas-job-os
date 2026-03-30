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

  const promptParts: string[] = [
    `CRITICAL IDENTITY: You are ${agent.identityName}, talking to ${userName}.`,
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
- preview_jobs: PREVIEW jobs to show the user BEFORE importing.
- import_pending_jobs: IMPORT previously previewed jobs.
- get_pipeline: READ staged/discovered jobs not yet imported. Use when user asks about pipeline jobs.
- save_job: Directly persist a single job.
- browser_navigate: Navigate to a URL and get page content. Params: { url, sessionId? }
- browser_click: Click an element by CSS selector. Params: { selector, sessionId? }
- browser_type: Type text into a field. Params: { selector, text, sessionId? }
- browser_scroll: Scroll the page. Params: { direction?, amount?, sessionId? }
- browser_screenshot: Take a screenshot. Params: { sessionId?, label? }
- browser_extract_text: Extract text from a selector. Params: { selector?, sessionId? }
- browser_extract_jobs: High-level bulk job search via scraper. Params: { query, location, limit? }
- gmail_sync, gmail_get_threads, gmail_generate_followup.

BROWSER NAVIGATION STRATEGY:
You have FULL direct browser control. For job searches, you can either:
A) Use browser_extract_jobs for fast bulk extraction (best for LinkedIn structured search)
B) Use browser_navigate + browser_click + browser_type + browser_extract_text for step-by-step manual navigation (use this when sites require interaction, login, or custom navigation)
The browser window is visible — the user watches every step you take.

STEALTH & FILTER PROTOCOLS (MANDATORY):
1. CAPTCHA/CONSENT: If a page title contains "robot", "CAPTCHA", "Consent", or looks like a block, RE-NAVIGATE using 'browser_navigate' with { "useScrapling": true }.
2. LINKEDIN FILTERS: When searching for jobs, ALWAYS map user preferences (salary, job type, remote, experience) to the 'linkedinFilters' parameter in 'browser_extract_jobs'.
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
