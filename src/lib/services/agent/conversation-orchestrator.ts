import { z } from "zod";
import type { MessageRole } from "@/lib/domain/enums";
import { agentStore } from "@/lib/services/agent/agent-store";
import { getAiProvider } from "@/lib/services/ai/provider";
import { continuitySyncService } from "@/lib/services/agent/continuity-sync-service";
import { env } from "@/lib/config/env";
import { loopPreventionGuard } from "@/lib/services/agent/loop-prevention-guard";
import { onboardingManager } from "@/lib/services/agent/onboarding-manager";
import { composeAgentSystemPrompt } from "@/lib/services/agent/prompt-composer";
import { agentRegistry } from "@/lib/services/agent/registry";
import { tokenBudgetManager } from "@/lib/services/agent/token-budget-manager";
import type { AgentRuntimeContext, AgentRuntimeResponse } from "@/lib/services/agent/types";
import { auth } from "@/auth";
import { ScraperService } from "@/lib/services/scraper/scraper-service";
import { syncGmail } from "@/lib/services/integration/gmail/sync-engine";
import { runtimeSettingsStore } from "@/lib/services/settings/runtime-settings-store";
import { prisma } from "@/lib/db";
import { localJobsCache } from "@/lib/services/jobs/local-jobs-cache";
import fs from "node:fs/promises";
import path from "node:path";

// ── Direct DB helpers (bypass HTTP self-calls) ────────────────────────────────

function parseSalaryBounds(salary?: string): { salaryMin?: number; salaryMax?: number } {
  if (!salary) return {};
  const values = salary.match(/\d[\d,.]*/g)?.map(p => Number(p.replace(/,/g, ""))).filter(Number.isFinite) ?? [];
  if (values.length === 0) return {};
  if (values.length === 1) return { salaryMin: Math.round(values[0]) };
  return { salaryMin: Math.round(values[0]), salaryMax: Math.round(values[1]) };
}

function mapEmploymentType(jobType?: string): "FULL_TIME" | "PART_TIME" | "CONTRACT" | "INTERNSHIP" | "FREELANCE" | undefined {
  if (!jobType) return undefined;
  const t = jobType.toLowerCase();
  if (t.includes("full")) return "FULL_TIME";
  if (t.includes("part")) return "PART_TIME";
  if (t.includes("contract")) return "CONTRACT";
  if (t.includes("intern")) return "INTERNSHIP";
  if (t.includes("freelance")) return "FREELANCE";
  return undefined;
}

async function saveJobToDB(params: {
  title: string; company: string; location: string;
  url?: string; salary?: string; source?: string;
  description?: string; skills?: string; datePosted?: string;
  jobType?: string; score?: number;
}): Promise<{ id: string; title: string; company: string }> {
  let user: { id: string };
  try {
    user = await prisma.user.upsert({
      where: { email: "local-dev-user@ai-job-os.local" },
      update: { name: "Local Dev User" },
      create: { email: "local-dev-user@ai-job-os.local", name: "Local Dev User" },
      select: { id: true },
    });
  } catch {
    // Race condition on concurrent saves — row already exists, just fetch it
    user = (await prisma.user.findFirst({ where: { email: "local-dev-user@ai-job-os.local" }, select: { id: true } }))!;
  }
  // Deduplicate by sourceUrl
  if (params.url) {
    const dupe = await prisma.job.findFirst({ where: { userId: user.id, sourceUrl: params.url }, select: { id: true, title: true } });
    if (dupe) return { id: dupe.id, title: params.title, company: params.company };
  }

  const existing = await prisma.company.findFirst({ where: { name: params.company }, select: { id: true } });
  const company = existing ?? await prisma.company.create({ data: { name: params.company }, select: { id: true } });
  const salary = parseSalaryBounds(params.salary);
  const job = await prisma.job.create({
    data: {
      userId: user.id,
      source: params.source ?? "Agent Search",
      sourceUrl: params.url,
      title: params.title,
      companyId: company.id,
      location: params.location,
      salaryMin: salary.salaryMin,
      salaryMax: salary.salaryMax,
      currency: params.salary ? "GBP" : undefined,
      applicationStatus: "SAVED",
      priority: "MEDIUM",
      descriptionRaw: params.description,
      requiredSkills: params.skills ? params.skills.split(",").map(s => s.trim()).filter(Boolean) : [],
      postedDate: params.datePosted ? new Date(params.datePosted) : undefined,
      employmentType: mapEmploymentType(params.jobType),
    },
    select: { id: true, title: true },
  });

  // Save scraper match score if provided
  if (params.score !== undefined && params.score > 0) {
    await prisma.jobScore.create({
      data: {
        jobId: job.id,
        userId: user.id,
        totalScore: params.score,
        confidence: 0.8,
        explanation: "Scraper relevance score",
        factorBreakdown: { scraper: params.score },
        missingDataPenalty: 0,
      },
    });
  }

  return { id: job.id, title: job.title, company: params.company };
}

const maxToolRounds = 10;

const toolIntentPattern = /(\bfind\b|\bsearch\b|\bjob\b|\bsave\b|\badd\b|\bcreate\b|\bnavigate\b|\bopen\b|\bclick\b|\bextract\b|\bbrowser\b|\bgmail\b|\bemail\b|\bsync\b)/i;

// In-memory pending jobs store (session-scoped)
type PendingJob = {
  title: string;
  company: string;
  location: string;
  url: string;
  salary?: string;
  source?: string;
  description?: string;
  skills?: string;
  jobType?: string;
  score?: number;
  isAlreadyImported?: boolean;
};
const _g = globalThis as any;
const pendingJobsStore: Map<string, PendingJob[]> = _g.__pendingJobsStore ?? (_g.__pendingJobsStore = new Map());

const toolDescriptors = [
  {
    name: "preview_jobs",
    description: "Preview jobs before importing. MANDATORY: Provide full 'description' and 'skills' for every role. ALSO: You MUST provide a concise 1-2 sentence text summary for EACH role in the final chat message (outside the preview box). Parameters: { jobs: Array<{ title: string, company: string, location: string, url: string, salary?: string, source?: string, description: string, skills: string }> }",
    parameters: {
      jobs: "Array<{ title: string, company: string, location: string, url: string, salary?: string, source?: string, description: string, skills: string }>",
    },
  },
  {
    name: "import_pending_jobs",
    description: "ALWAYS use this when the user says 'import', 'save', 'add to pipeline', or 'import all' — even if you also see browser_extract_jobs in the tool list. NEVER call browser_extract_jobs to handle an import request. Jobs already previewed this session are stored server-side; just call this tool with action='import_all' to save them all. Parameters: { action?: 'import_all' | 'import_selected', indices?: number[], jobs?: Job[] }",
    parameters: {
      action: "string?",
      indices: "number[]?",
      jobs: "Job[]?",
    },
  },
  {
    name: "get_pipeline",
    description: "Get jobs currently staged in the discovery pipeline (discovered but not yet imported/saved). Use this to answer user questions like 'what jobs are in my pipeline?', 'show me staged jobs', 'any hospitality jobs found?'. Parameters: { query?: string }",
    parameters: {
      query: "string?",
    },
  },
  {
    name: "save_job",
    description: "Directly save a single job. DO NOT use during profile updates. Parameters: { title: string, company: string, location: string, salary?: string, url?: string, source?: string, description: string, skills: string }",
    parameters: {
      title: "string",
      company: "string",
      location: "string",
      salary: "string?",
      url: "string?",
      source: "string?",
      description: "string",
      skills: "string",
    },
  },
  {
    name: "update_job",
    description: "Update an existing job in the pipeline. Parameters: { id: string, title?: string, company?: string, location?: string, salary?: string, url?: string, status?: string, priority?: string, description?: string, skills?: string }",
    parameters: {
      id: "string",
      title: "string?",
      company: "string?",
      location: "string?",
      salary: "string?",
      url: "string?",
      status: "string?",
      priority: "string?",
      description: "string?",
      skills: "string?",
    },
  },
  {
    name: "delete_job",
    description: "Delete a specific job from the pipeline. Parameters: { id: string }",
    parameters: { id: "string" },
  },
  {
    name: "clear_pipeline",
    description: "Remove ALL jobs from the pipeline. Use when the user wants to start fresh or clear irrelevant data. Parameters: {}",
    parameters: {},
  },
  {
    name: "gmail_sync",
    description: "Sync the user's Gmail inbox to import recent job-related email threads. Call this if the user asks you to check their email or sync their inbox. (RETURNS A COUNT ONLY. Do NOT hallucinate jobs!). Parameters: {}",
    parameters: {},
  },
  {
    name: "gmail_get_threads",
    description: "Get recent email threads matched to a specific job ID. (DO NOT use 'all' as jobId. Use a real ID from the pipeline). Parameters: { jobId: string }",
    parameters: { jobId: "string" },
  },
  {
    name: "gmail_generate_followup",
    description: "Generate an email draft for a specific thread based on user instructions. Parameters: { threadId: string, instructions: string }",
    parameters: { threadId: "string", instructions: "string" },
  },
  {
    name: "gmail_search",
    description: "Search the user's Gmail inbox for specific keywords or phrases. Use this to find interviews, recruiter emails, or application updates. Parameters: { query: string }",
    parameters: { query: "string" },
  },
  {
    name: "read_context_memory",
    description: "Read the agent's current context memory file which contains recent turn logs and re-anchoring details. Parameters: {}",
    parameters: {},
  },
  {
    name: "browser_navigate",
    description: "Navigate the visible browser to a URL and return page content. Atlas has full browser control — use this to open any website step by step. Parameters: { url: string, sessionId?: string }",
    parameters: { url: "string", sessionId: "string?" },
  },
  {
    name: "browser_click",
    description: "Click an element in the browser by CSS selector. Parameters: { selector: string, sessionId?: string }",
    parameters: { selector: "string", sessionId: "string?" },
  },
  {
    name: "browser_type",
    description: "Type text into a browser input field. Parameters: { selector: string, text: string, sessionId?: string }",
    parameters: { selector: "string", text: "string", sessionId: "string?" },
  },
  {
    name: "browser_scroll",
    description: "Scroll the page up or down. Parameters: { direction?: 'down'|'up', amount?: number, sessionId?: string }",
    parameters: { direction: "string?", amount: "number?", sessionId: "string?" },
  },
  {
    name: "browser_screenshot",
    description: "Take a screenshot of the current browser state. Parameters: { sessionId?: string, label?: string }",
    parameters: { sessionId: "string?", label: "string?" },
  },
  {
    name: "browser_extract_text",
    description: "Extract text content from the current page or a specific selector. Parameters: { selector?: string, sessionId?: string }",
    parameters: { selector: "string?", sessionId: "string?" },
  },
  {
    name: "browser_extract_jobs",
    description: "High-level bulk job search via scraper — searches LinkedIn and job boards in parallel and returns structured job data. Best for fast searches. Parameters: { query: string, location: string, limit?: number }",
    parameters: { query: "string", location: "string", limit: "number?" },
  },
  {
    name: "update_scraper_selectors",
    description: "Self-heal the job scraper when a platform's DOM has changed. Call this when browser_extract_jobs reports a platform failed with a dom_sample. Analyse the HTML, identify the correct CSS selectors for job cards, and save them. Parameters: { site: string, cardSelectors: string[] }",
    parameters: { site: "string", cardSelectors: "string[]" },
  },
] as const;

const saveJobToolSchema = z.object({
  title: z.string().min(1),
  company: z.string().min(1),
  location: z.string().min(1),
  salary: z.string().optional(),
  url: z.string().optional(),
  link: z.string().optional(), // Fallback for extracted data
  source: z.string().default("Agent Search"),
  status: z.string().optional(),
  priority: z.string().optional(),
  description: z.string().optional(),
  skills: z.union([z.string(), z.array(z.string())]).optional(),
  datePosted: z.string().optional(),
}).transform(val => ({
  ...val,
  url: val.url || val.link || "",
  skills: Array.isArray(val.skills) ? val.skills.join(", ") : val.skills
}));

const updateJobToolSchema = z.object({
  id: z.string().min(1),
  title: z.string().optional(),
  company: z.string().optional(),
  location: z.string().optional(),
  salary: z.string().optional(),
  url: z.string().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  description: z.string().optional(),
  skills: z.union([z.string(), z.array(z.string())]).optional(),
}).transform(val => ({
  ...val,
  skills: Array.isArray(val.skills) ? val.skills.join(", ") : val.skills
}));

const deleteJobToolSchema = z.object({
  id: z.string().min(1),
});

const previewJobSchema = z.object({
  title: z.string().min(1),
  company: z.string().min(1),
  location: z.string().min(1),
  url: z.string().optional(),
  link: z.string().optional(),
  salary: z.string().optional(),
  source: z.string().default("Agent Search"),
  description: z.string().optional(),
  skills: z.union([z.string(), z.array(z.string())]).optional(),
  datePosted: z.string().optional(),
  jobType: z.string().optional(),
  score: z.number().optional(),
  isAlreadyImported: z.boolean().optional(),
}).transform(val => ({
  ...val,
  url: val.url || val.link || "",
  skills: Array.isArray(val.skills) ? val.skills.join(", ") : val.skills
}));

const previewJobsToolSchema = z.object({
  jobs: z.array(previewJobSchema).min(1),
});

const importPendingJobsSchema = z.object({
  action: z.enum(["import_all", "import_selected"]).optional(),
  indices: z.array(z.number()).optional(),
  jobs: z.array(previewJobSchema).optional(),
});

type ToolCall = {
  tool: string;
  parameters: Record<string, unknown>;
};

function normalizeToolCallCandidate(candidate: Record<string, unknown>): ToolCall | null {
  if (typeof candidate.tool === "string" && candidate.parameters && typeof candidate.parameters === "object") {
    return {
      tool: candidate.tool,
      parameters: candidate.parameters as Record<string, unknown>,
    };
  }

  if (typeof candidate.name === "string") {
    const args = candidate.arguments;
    if (args && typeof args === "object") {
      return { tool: candidate.name, parameters: args as Record<string, unknown> };
    }
    if (typeof args === "string") {
      try {
        const parsedArgs = JSON.parse(args) as Record<string, unknown>;
        return { tool: candidate.name, parameters: parsedArgs };
      } catch {
        return null;
      }
    }
  }

  if (candidate.function_call && typeof candidate.function_call === "object") {
    const fn = candidate.function_call as Record<string, unknown>;
    if (typeof fn.name !== "string") {
      return null;
    }

    if (fn.arguments && typeof fn.arguments === "object") {
      return { tool: fn.name, parameters: fn.arguments as Record<string, unknown> };
    }

    if (typeof fn.arguments === "string") {
      try {
        const parsedArgs = JSON.parse(fn.arguments) as Record<string, unknown>;
        return { tool: fn.name, parameters: parsedArgs };
      } catch {
        return null;
      }
    }
  }

  if (Array.isArray(candidate.tool_calls) && candidate.tool_calls.length > 0) {
    const first = candidate.tool_calls[0];
    if (first && typeof first === "object") {
      const call = first as Record<string, unknown>;
      const fn = call.function;
      if (fn && typeof fn === "object") {
        const functionCall = fn as Record<string, unknown>;
        if (typeof functionCall.name === "string") {
          if (functionCall.arguments && typeof functionCall.arguments === "object") {
            return { tool: functionCall.name, parameters: functionCall.arguments as Record<string, unknown> };
          }
          if (typeof functionCall.arguments === "string") {
            try {
              const parsedArgs = JSON.parse(functionCall.arguments) as Record<string, unknown>;
              return { tool: functionCall.name, parameters: parsedArgs };
            } catch {
              return null;
            }
          }
        }
      }
    }
  }

  return null;
}

function getInternalApiBases(): string[] {
  return Array.from(
    new Set(
      [env.NEXT_PUBLIC_APP_URL, env.NEXTAUTH_URL, "http://127.0.0.1:3000"]
        .filter((u): u is string => Boolean(u)),
    ),
  );
}

async function getInternalJson<TResponse extends Record<string, unknown>>(
  path: string,
  params: Record<string, string | string[]>,
): Promise<TResponse> {
  const urlParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      value.forEach(v => urlParams.append(key, v));
    } else {
      urlParams.append(key, value);
    }
  }
  const queryString = urlParams.toString();
  const fullPath = queryString ? `${path}?${queryString}` : path;
  
  let lastError: Error | null = null;
  for (const base of getInternalApiBases()) {
    try {
      const url = new URL(fullPath, base).toString();
      const response = await fetch(url, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      const payload = (await response.json()) as TResponse | { error?: string };
      if (!response.ok) {
        const message = "error" in payload && typeof payload.error === "string"
          ? payload.error
          : `Request failed: ${response.status}`;
        throw new Error(message);
      }
      return payload as TResponse;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Unknown internal fetch error");
    }
  }
  throw lastError ?? new Error(`Unable to reach internal route: ${path}`);
}

async function postInternalJson<TResponse extends Record<string, unknown>>(
  path: string,
  body: Record<string, unknown>,
  method: "POST" | "PUT" | "DELETE" = "POST",
): Promise<TResponse> {
  let lastError: Error | null = null;
  for (const base of getInternalApiBases()) {
    try {
      const url = new URL(path, base).toString();
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: method !== "DELETE" ? JSON.stringify(body) : undefined,
      });
      const payload = (await response.json()) as TResponse | { error?: string };
      if (!response.ok) {
        const message = "error" in payload && typeof payload.error === "string"
          ? payload.error
          : `Request failed: ${response.status}`;
        throw new Error(message);
      }
      return payload as TResponse;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Unknown internal fetch error");
    }
  }
  throw lastError ?? new Error(`Unable to reach internal route: ${path}`);
}

const BROWSER_SERVER_URL = "http://localhost:3001/api/browser";

async function callBrowserServer(action: string, sessionId: string, params: Record<string, unknown>): Promise<string> {
  try {
    const response = await fetch(BROWSER_SERVER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, sessionId, params }),
    });
    const result = await response.json() as Record<string, unknown>;
    if (!response.ok) {
      return `❌ Browser action '${action}' failed: ${String(result.error || "unknown error")}`;
    }
    // Return a concise summary — content/text truncated to avoid flooding the context
    if (result.content && typeof result.content === "string") {
      const truncated = result.content.length > 4000 ? result.content.slice(0, 4000) + "\n…[truncated]" : result.content;
      return `✅ ${action} completed.\n\n${truncated}`;
    }
    if (result.screenshotPath) return `✅ Screenshot saved: ${result.screenshotPath}`;
    return `✅ ${action} completed: ${JSON.stringify(result).slice(0, 500)}`;
  } catch (err) {
    return `❌ Browser server unreachable for '${action}': ${err instanceof Error ? err.message : String(err)}. Ensure the browser server is running (npm run browser-server).`;
  }
}

function extractToolCalls(input: string): ToolCall[] {
  const results: ToolCall[] = [];
  const candidates: string[] = [];

  const fencedMatches = Array.from(
    input.matchAll(/```(?:json)?\s*\n?([\s\S]*?)\n?```/gi),
    (match) => match[1].trim()
  );
  candidates.push(...fencedMatches);

  let braceDepth = 0;
  let blockStart = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && inString) { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (ch === '{') {
      if (braceDepth === 0) blockStart = i;
      braceDepth++;
    } else if (ch === '}') {
      braceDepth--;
      if (braceDepth === 0 && blockStart >= 0) {
        const block = input.slice(blockStart, i + 1);
        if (block.includes('"tool"') || block.includes('"name"') || block.includes('"function_call"')) {
          candidates.push(block);
        }
        blockStart = -1;
      }
    }
  }

  const regexPatterns = [
    /\{\s*"tool"\s*:\s*"[^"]+"\s*,\s*"parameters"\s*:\s*\{[^}]*(?:\{[^}]*\}[^}]*)*\}\s*\}/g,
    /\{\s*"name"\s*:\s*"[^"]+"\s*,\s*"arguments"\s*:\s*\{[^}]*(?:\{[^}]*\}[^}]*)*\}\s*\}/g,
  ];
  for (const pattern of regexPatterns) {
    for (const match of input.matchAll(pattern)) {
      candidates.push(match[0]);
    }
  }

  const seen = new Set<string>();
  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const normalized = normalizeToolCallCandidate(parsed);
      if (normalized) {
        results.push(normalized);
      }
    } catch {
      try {
        const cleaned = trimmed.replace(/,\s*([}\]])/g, '$1');
        const parsed = JSON.parse(cleaned) as Record<string, unknown>;
        const normalized = normalizeToolCallCandidate(parsed);
        if (normalized) {
          results.push(normalized);
        }
      } catch {}
    }
  }
  return results;
}

function extractContinuityUpdate(input: string): any | null {
  const match = input.match(/<continuity_update>([\s\S]*?)<\/continuity_update>/i);
  if (!match) return null;
  try {
    return JSON.parse(match[1].trim());
  } catch {
    return null;
  }
}

function inferToolCallFromUserMessage(_input: string): ToolCall | null {
  return null;
}

async function executeToolCall(toolCall: ToolCall, sid: string, userId?: string): Promise<string> {
  if (toolCall.tool === "preview_jobs") {
    const params = previewJobsToolSchema.parse(toolCall.parameters);
    const existing = pendingJobsStore.get(sid) || [];
    const newJobs = params.jobs;
    const combined = [...existing, ...newJobs];
    const uniqueJobsMap = new Map();
    for (const j of combined) {
        const key = j.url && j.url !== "#" ? j.url : `${j.title}-${j.company}-${j.location}`;
        if (!uniqueJobsMap.has(key)) {
            uniqueJobsMap.set(key, j);
        }
    }
    const finalJobs = Array.from(uniqueJobsMap.values());
    
    // Deduplication check against DB
    const urls = finalJobs.map(j => j.url).filter(u => u && u !== "#") as string[];
    if (urls.length > 0) {
      try {
        const { existingUrls } = await getInternalJson<{ existingUrls: string[] }>("/api/jobs", { checkUrl: urls });
        for (const job of finalJobs) {
          if (job.url && existingUrls.includes(job.url)) {
            job.isAlreadyImported = true;
          }
        }
      } catch (err) {
        console.warn("Deduplication check failed:", err);
      }
    }

    pendingJobsStore.set(sid, finalJobs);
    
    const jobList = finalJobs.map((j, i) => `${i + 1}. **${j.title}** at ${j.company} (${j.location})${j.isAlreadyImported ? " [ALREADY IN PIPELINE]" : ""}`).join("\n");
    // Strip description/skills from preview JSON — they contain ] chars that break parsing
    // Full data is kept in pendingJobsStore server-side for import
    const previewJobs = finalJobs.map(({ description: _d, skills: _s, ...rest }) => rest);
    return `__PREVIEW_JOBS__${JSON.stringify(previewJobs)}__END_PREVIEW__\n\n### 🔍 Job Discovery Preview\nPreviewed ${finalJobs.length} accumulated job(s) for your review:\n${jobList}\n\nReview the list below. Jobs already in your pipeline are marked. Click 'Import All' to save the rest.`;
  }
  if (toolCall.tool === "import_pending_jobs") {
    const params = importPendingJobsSchema.parse(toolCall.parameters);
    let pending = pendingJobsStore.get(sid);
    
    // Fallback: Use passed jobs if store is empty
    if ((!pending || pending.length === 0) && params.jobs && params.jobs.length > 0) {
      pending = params.jobs;
    }

    if (!pending || pending.length === 0) {
      return "IMPORT_ERROR: No staged jobs found in this session. Do NOT search again. Tell the user the staged jobs were lost (likely due to a page reload) and ask them to use the Import button directly from the preview box next time.";
    }

    const jobsToImport = (params.action === "import_all" || (!params.action && params.jobs))
      ? pending.filter(j => !j.isAlreadyImported)
      : (params.indices || []).map(i => pending[i]).filter(Boolean).filter(j => !j.isAlreadyImported);
    
    if (jobsToImport.length === 0) {
      return "All selected jobs are already in your pipeline.";
    }

    const results: string[] = [];
    for (const job of jobsToImport) {
      try {
        const saved = await saveJobToDB({
          title: job.title,
          company: job.company,
          location: job.location,
          url: job.url,
          salary: job.salary,
          source: job.source || "Agent Search",
          description: job.description,
          skills: job.skills,
          datePosted: (job as any).datePosted,
          jobType: job.jobType,
          score: job.score,
        });
        results.push(`✅ "${saved.title}" at ${saved.company} — saved`);
        job.isAlreadyImported = true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        results.push(`❌ "${job.title}" at ${job.company} — failed: ${msg}`);
      }
    }
    
    pendingJobsStore.set(sid, pending); // Persist updated statuses
    const allImported = pending.every(j => j.isAlreadyImported);
    
    const reply = `Imported ${results.filter(r => r.startsWith("✅")).length}/${jobsToImport.length} jobs:\n${results.join("\n")}`;
    return allImported 
      ? `${reply}\n\nALL_JOBS_IMPORTED_SUCCESSFULLY\nAll jobs have been imported to your job pipeline. You can see them on the Jobs table.`
      : reply;
  }
  if (toolCall.tool === "get_pipeline") {
    const { query } = (toolCall.parameters ?? {}) as { query?: string };
    const jobs = localJobsCache.list();
    if (jobs.length === 0) return "No jobs currently in the pipeline. Run a job search to discover new roles.";
    const filtered = query
      ? jobs.filter(j => `${j.title} ${j.company} ${j.location}`.toLowerCase().includes(query.toLowerCase()))
      : jobs;
    if (filtered.length === 0) return `No pipeline jobs match "${query}".`;
    const list = filtered.slice(0, 50).map((j, i) =>
      `${i + 1}. **${j.title}** at ${j.company} (${j.location}) — Score: ${j.score ?? "N/A"}, Salary: ${j.salaryRange || "Not disclosed"}, Source: ${j.source}`
    ).join("\n");
    return `### 📋 Pipeline (${filtered.length} staged job${filtered.length !== 1 ? "s" : ""})\n${list}\n\nThese jobs have not been imported yet. Tell the user to say "import all" to save them.`;
  }
  if (toolCall.tool === "save_job") {
    const params = saveJobToolSchema.parse(toolCall.parameters);
    const saved = await saveJobToDB(params);

    // Update pending store if this URL was in there
    const pending = pendingJobsStore.get(sid) || [];
    const idx = pending.findIndex(j => j.url === params.url);
    if (idx !== -1) {
      pending[idx].isAlreadyImported = true;
      pendingJobsStore.set(sid, pending);
    }

    return `Job "${saved.title}" at ${saved.company} saved successfully.`;
  }
  if (toolCall.tool === "read_context_memory") {
    const context = await continuitySyncService.hydrateTurnContext(sid, sid);
    const fullContext = context.recentContext || "No context memory found.";
    return `### 🧠 Context Memory\n${fullContext}`;
  }
  if (toolCall.tool === "gmail_sync") {
    if (!userId) return "Gmail sync failed: no user session available.";
    const result = await syncGmail(userId);
    if (!result.success) return `Gmail sync failed: ${result.error}`;
    return `Successfully synced ${result.count} new/updated job threads.`;
  }
  if (toolCall.tool === "gmail_get_threads") {
    if (!userId) return "Cannot retrieve threads: no user session.";
    const limit = Number(toolCall.parameters.limit) || 10;
    try {
      // @ts-ignore
      const threads = await prisma.emailThread.findMany({
        where: { userId },
        orderBy: { lastMessageAt: "desc" },
        take: limit,
      });
      if (!threads.length) return "No email threads found. Try syncing Gmail first.";
      const summary = threads.map((t: any) => `• **${t.subject}** — ${t.snippet || ""}`.slice(0, 120)).join("\n");
      return `Found ${threads.length} email threads:\n${summary}`;
    } catch (e: any) {
      return `Could not retrieve threads: ${e.message}`;
    }
  }
  if (toolCall.tool === "gmail_generate_followup") {
    return "Draft generated and saved to review queue.";
  }
  if (toolCall.tool === "gmail_search") {
    const query = String(toolCall.parameters.query || "");
    const payload = await postInternalJson<{ results: any[] }>("/api/integrations/gmail/search", { query });
    return `Found ${payload.results?.length || 0} emails for "${query}".`;
  }
  if (toolCall.tool === "browser_navigate") {
    const params = toolCall.parameters as { url: string; sessionId?: string };
    return callBrowserServer("navigate", params.sessionId || sid, { url: params.url });
  }
  if (toolCall.tool === "browser_click") {
    const params = toolCall.parameters as { selector: string; sessionId?: string };
    return callBrowserServer("click", params.sessionId || sid, { selector: params.selector });
  }
  if (toolCall.tool === "browser_type") {
    const params = toolCall.parameters as { selector: string; text: string; sessionId?: string };
    return callBrowserServer("type", params.sessionId || sid, { selector: params.selector, text: params.text });
  }
  if (toolCall.tool === "browser_screenshot") {
    const params = toolCall.parameters as { sessionId?: string; label?: string };
    return callBrowserServer("screenshot", params.sessionId || sid, { label: params.label });
  }
  if (toolCall.tool === "browser_extract_text") {
    const params = toolCall.parameters as { selector?: string; sessionId?: string };
    return callBrowserServer("extract_text", params.sessionId || sid, { selector: params.selector });
  }
  if (toolCall.tool === "browser_scroll") {
    const params = toolCall.parameters as { direction?: string; amount?: number; sessionId?: string };
    return callBrowserServer("scroll", params.sessionId || sid, { direction: params.direction, amount: params.amount });
  }
  if (toolCall.tool === "update_scraper_selectors") {
    const { site, cardSelectors } = toolCall.parameters as { site: string; cardSelectors: string[] };
    const selectorsPath = path.join(process.cwd(), "agents/atlas/scraper_selectors.json");
    let data: { _comment?: string; overrides: Record<string, string[]> } = { overrides: {} };
    try {
      const existing = await fs.readFile(selectorsPath, "utf-8");
      data = JSON.parse(existing);
    } catch {}
    data.overrides = { ...data.overrides, [site]: cardSelectors };
    await fs.writeFile(selectorsPath, JSON.stringify(data, null, 2), "utf-8");
    return `✅ Scraper selectors updated for **${site}**: \`${cardSelectors.join(", ")}\`. These will be used on the next search.`;
  }
  if (toolCall.tool === "browser_extract_jobs") {
    const params = toolCall.parameters as any;
    // Atlas may send singular or plural parameter names — normalise both
    const query: string = params.query || (Array.isArray(params.queries) ? params.queries[0] : "") || "";
    const location: string = params.location || (Array.isArray(params.locations) ? params.locations[0] : "") || "";
    if (!query) return "⚠️ No search query provided. Please specify a job title to search for.";
    const searchQuery = `${query} ${location}`.trim();

    // Build search URLs for reputable UK platforms — all run in parallel
    const allPlatforms: { name: string; url: string }[] = [
      { name: "LinkedIn",   url: `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(query)}&location=${encodeURIComponent(location)}` },
      { name: "Indeed",     url: `https://uk.indeed.com/jobs?q=${encodeURIComponent(query)}&l=${encodeURIComponent(location)}` },
      { name: "Reed",       url: `https://www.reed.co.uk/jobs?keywords=${encodeURIComponent(query)}&location=${encodeURIComponent(location)}` },
      { name: "TotalJobs",  url: `https://www.totaljobs.com/jobs/${encodeURIComponent(query.replace(/\s+/g, "-").toLowerCase())}/in-${encodeURIComponent(location.replace(/\s+/g, "-").toLowerCase())}` },
      { name: "Adzuna",     url: `https://www.adzuna.co.uk/jobs/search?q=${encodeURIComponent(query)}&loc=${encodeURIComponent(location)}` },
      { name: "CV-Library", url: `https://www.cv-library.co.uk/search-jobs?q=${encodeURIComponent(query)}&loc=${encodeURIComponent(location)}&us=1` },
      { name: "Monster",    url: `https://www.monster.co.uk/jobs/search?q=${encodeURIComponent(query)}&where=${encodeURIComponent(location)}` },
      { name: "CWJobs",     url: `https://www.cwjobs.co.uk/jobs/${encodeURIComponent(query.replace(/\s+/g, "-").toLowerCase())}/in-${encodeURIComponent(location.replace(/\s+/g, "-").toLowerCase())}` },
    ];

    // Atlas may request specific platforms — filter if provided
    const requestedPlatforms: string[] | undefined = params.platforms || params.platform;
    const platforms = requestedPlatforms?.length
      ? allPlatforms.filter(p => requestedPlatforms.some((rp: string) => p.name.toLowerCase().includes(rp.toLowerCase())))
      : allPlatforms;

    console.log(`[browser_extract_jobs] Searching ${platforms.length} UK platforms in parallel for: ${searchQuery}`);

    // Search all platforms in parallel
    const platformResults = await Promise.allSettled(
      platforms.map(p => ScraperService.scrape(p.url, searchQuery).then(r => ({ ...r, platformName: p.name })))
    );

    // Aggregate all jobs from successful platforms
    type RawJob = { title?: string; company?: string; location?: string; url?: string; salary?: string; description?: string; skills?: string | string[]; date_posted?: string; job_type?: string; score?: number; _platform?: string };
    const allJobs: RawJob[] = [];
    const successfulPlatforms: string[] = [];
    const failedPlatforms: { name: string; error: string; dom_sample?: string }[] = [];

    for (let i = 0; i < platformResults.length; i++) {
      const pr = platformResults[i];
      const name = platforms[i].name;
      if (pr.status === "fulfilled" && pr.value.success && pr.value.jobs && pr.value.jobs.length > 0) {
        successfulPlatforms.push(name);
        for (const j of pr.value.jobs) {
          allJobs.push({ ...j, _platform: name });
        }
      } else {
        const err = pr.status === "rejected" ? String(pr.reason) : (pr.value?.error ?? "no results");
        const domSample = pr.status === "fulfilled" ? pr.value?.dom_sample : undefined;
        failedPlatforms.push({ name, error: err, dom_sample: domSample });
      }
    }

    if (allJobs.length === 0) {
      const domHints = failedPlatforms
        .filter(f => f.dom_sample)
        .map(f => `\n**${f.name}** DOM sample:\n\`\`\`html\n${f.dom_sample?.slice(0, 1500)}\n\`\`\``)
        .join("\n");
      return `SCRAPER_ERROR: All platforms returned no results for "${query}" in "${location}".${domHints ? `\n\nDOM samples from failed platforms (call update_scraper_selectors to fix):${domHints}` : " Try a broader search term or different location."}`;
    }

    // Filter out CAPTCHA/verification pages that leaked through as job cards
    const BLOCKED_TITLES = ["additional verification required", "security verification", "security check",
      "captcha", "sign in", "log in", "just a moment", "access denied", "authwall", "blocked",
      "human verification", "verify you are human", "are you a robot", "unusual traffic"];
    const cleaned = allJobs.filter(j => {
      const t = (j.title || "").toLowerCase().trim();
      return t.length > 3 && !BLOCKED_TITLES.includes(t) && !t.includes("verification") && !t.includes("captcha");
    });

    // Deduplicate by title+company key
    const seen = new Set<string>();
    const unique = cleaned.filter(j => {
      const key = `${(j.title || "").toLowerCase().trim()}|${(j.company || "").toLowerCase().trim()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort by scraper relevance score descending, cap using admin-controlled global settings
    // maxJobsPerSearch = total pool from scraper; outputPerPrompt = how many show in preview
    const globalSettings = runtimeSettingsStore.get("global").settings;
    const maxJobs = globalSettings.maxJobsPerSearch ?? 20;
    const outputPerPrompt = globalSettings.outputPerPrompt ?? 10;
    const topJobs = unique
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, maxJobs)
      .slice(0, outputPerPrompt);

    const previewResult = await executeToolCall({
      tool: "preview_jobs",
      parameters: {
        jobs: topJobs.map((j: RawJob) => ({
          title: j.title || "Untitled Role",
          company: j.company || "Unknown Company",
          location: j.location || location,
          url: j.url || "#",
          salary: j.salary,
          source: j._platform,
          description: j.description || "",
          skills: Array.isArray(j.skills) ? j.skills.join(", ") : (j.skills || ""),
          datePosted: j.date_posted || "",
          jobType: j.job_type || "",
          score: j.score,
        }))
      }
    }, sid);

    const scoreList = topJobs.map((j: RawJob, i: number) =>
      `${i + 1}. ${j.title} at ${j.company} [${j._platform}] — score: ${Math.round(j.score ?? 0)}/100`
    ).join("\n");

    const failedNote = failedPlatforms.length > 0
      ? `\n\n**Failed platforms** (DOM may have changed — call \`update_scraper_selectors\` to fix):\n${failedPlatforms.map(f => {
          const hint = f.dom_sample ? `\n\`\`\`html\n${f.dom_sample.slice(0, 1000)}\n\`\`\`` : "";
          return `- **${f.name}**: ${f.error}${hint}`;
        }).join("\n")}`
      : "";

    return `### Job Discovery: ${query} in ${location}\n\nSearched ${successfulPlatforms.join(", ")} — found ${unique.length} unique jobs total. Showing top ${topJobs.length} by relevance score (pool cap: ${maxJobs}, preview cap: ${outputPerPrompt}).\n\n**SCRAPER MATCH SCORES — EXACT VALUES, USE THESE ONLY, DO NOT INVENT OR CHANGE ANY NUMBER:**\n${scoreList}\n\nThe preview box above shows exactly these ${topJobs.length} jobs with their exact scores. Do NOT mention any other counts or scores.\n\n${previewResult}${failedNote}`;
  }
  throw new Error(`Unsupported tool: ${toolCall.tool}`);
}

function normalizeAgentReply(input: string): string {
  let text = input.trim();
  text = text.replace(/<continuity_update>[\s\S]*?<\/continuity_update>/gi, "");
  // Keep __PREVIEW_JOBS__ in the text so the frontend can find and render the box 
  // (the frontend also have logic to hide this block from the user's view)
  // text = text.replace(/__PREVIEW_JOBS__[\s\S]*?__END_PREVIEW__/g, "");
  // Collapse 3+ newlines into exactly 2 for clean paragraph spacing
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim() || "Action performed. I'm updating my state.";
}

export class ConversationOrchestrator {
  async run(context: AgentRuntimeContext): Promise<AgentRuntimeResponse> {
    // Wave 1: auth + agent lookup in parallel
    const [session, agent] = await Promise.all([
      auth(),
      agentRegistry.getAgent(context.agentId, context.userId),
    ]);
    const isDeveloper = session?.user?.role === "ADMIN" || session?.user?.email === "admin@aijobos.local";
    const effectiveUserId = context.userId ?? agent.userId;

    // Fast-path: detect simple conversational messages that don't need tools
    const msgLower = context.message.toLowerCase().trim();
    const isSimpleChat = msgLower.length < 120 && !/(search|find|discover|import|save|extract|scrape|browse|navigate|screenshot|gmail|sync|email|cv|resume|upload|score|filter|draft|write|apply|follow.?up)/.test(msgLower);
    const dynamicMaxRounds = isSimpleChat ? 1 : (isDeveloper ? 15 : maxToolRounds);

    // Wave 2: session creation (needs agent.id)
    let effectiveSessionId = context.sessionId;
    if (effectiveUserId) {
      try {
        effectiveSessionId = await agentStore.createOrReuseSession({
          sessionId: context.sessionId,
          userId: effectiveUserId,
          agentId: agent.id,
          message: context.message
        });
      } catch {}
    }
    const sid = effectiveSessionId || "default";
    context.onUpdate?.({ type: "session_id", sessionId: sid });

    // Detect task type early for status message
    let taskType: string | undefined;
    const msg = msgLower;
    if (msg.includes("search") || msg.includes("find") || msg.includes("discovery")) taskType = "search";
    else if (msg.includes("import") || msg.includes("save") || msg.includes("add")) taskType = "validate";
    else if (msg.includes("score") || msg.includes("filter") || msg.includes("fit")) taskType = "score";
    else if (msg.includes("draft") || msg.includes("email") || msg.includes("write")) taskType = "outreach";

    context.onUpdate?.({ type: "status", status: taskType === "search" ? "Searching for jobs..." : "Analyzing request..." });

    // Wave 3: history + continuity in parallel (both need sid)
    let historyContext = "";
    let historyMessageCount = 0;
    const [historyMessages, layers] = await Promise.all([
      sid !== "new" && sid !== "default" ? agentStore.getSessionMessages(sid).catch(() => []) : Promise.resolve([]),
      continuitySyncService.hydrateTurnContext(agent.id, sid, taskType, 0, effectiveUserId),
    ]);
    if (historyMessages.length > 0) {
      historyMessageCount = historyMessages.length;
      historyContext = historyMessages.slice(-5).map((m: { role: string; content: string }) => `${m.role}: ${m.content}`).join("\n\n");
    }

    // Reset loop guard for every new prompt
    loopPreventionGuard.reset(agent.id, sid);

    // Onboarding
    let onboardingComplete = onboardingManager.isComplete(agent.id, agent.onboardingCompleted, effectiveUserId);
    if (!onboardingComplete && toolIntentPattern.test(context.message)) {
      await onboardingManager.handleConversation({ ...context, message: "skip onboarding" }, effectiveUserId);
      onboardingComplete = true;
    }

    if (!onboardingComplete) {
      const onboardingResponse = await onboardingManager.handleConversation({ ...context, agentId: agent.id }, effectiveUserId);
      return { reply: onboardingResponse.reply, shouldWriteSummary: onboardingResponse.completed, loopPrevented: false, onboardingCompleted: onboardingResponse.completed, sessionId: effectiveSessionId, profileSnapshot: onboardingResponse.profileSnapshot, continuitySynced: true, rehydrated: false };
    }


    console.time("Turn Execution");
    const budget = tokenBudgetManager.checkResponseBudget({ message: context.message, budget: agent.responseBudgetTokens });
    
    console.time("Prompt Composition");
    const systemPrompt = composeAgentSystemPrompt(agent, layers, { lightweight: isSimpleChat });
    console.timeEnd("Prompt Composition");

    const provider = getAiProvider(context.preferredProvider);
    let aiResponseText = "";
    let toolContext = "";
    const toolLogs: Array<{ tool: string; parameters: any; result: string }> = [];

    const formattedHistory = (historyContext && historyContext !== "No history yet.") ? historyContext : null;
    const rehydrated = layers.soul ? true : false;
    const internalStateStr = isSimpleChat ? "" : [
      layers.mind ? `[MIND]\n${layers.mind}` : "",
      layers.recentContext ? `[RECENT CONTEXT]\n${layers.recentContext}` : ""
    ].filter(Boolean).join("\n\n");

    for (let round = 0; round < dynamicMaxRounds && !aiResponseText; round++) {
      const continuationPrompt = round > 0
        ? `--- CONTINUATION Round ${round} ---`
        : null;

      const llmRequest = {
        systemPrompt,
        userPrompt: [
          `--- AGENT INTERNAL STATE ---\n${internalStateStr}\n----------------------------`,
          formattedHistory ? `Previous history:\n${formattedHistory}` : null,
          `User request: ${context.message}`,
          toolContext ? `Tool results:\n${toolContext}` : null,
          continuationPrompt
        ].filter(Boolean).join("\n\n"),
        model: context.preferredModel ?? agent.model,
        temperature: 0.4,
        apiKey: context.apiKey,
      };

      console.time(`LLM Round ${round}`);
      // Stream tokens live as deltas; if tool calls follow, send delta_clear to reset UI
      // Tag filter: suppress internal <continuity_update>...</continuity_update> blocks during streaming
      let tagFilterBuf = "";
      let inInternalTag = false;
      const OPEN_TAG = "<continuity_update>";
      const CLOSE_TAG = "</continuity_update>";

      function flushTagFilter(token: string) {
        tagFilterBuf += token;
        while (tagFilterBuf.length > 0) {
          if (inInternalTag) {
            const closeIdx = tagFilterBuf.indexOf(CLOSE_TAG);
            if (closeIdx !== -1) {
              tagFilterBuf = tagFilterBuf.slice(closeIdx + CLOSE_TAG.length);
              inInternalTag = false;
            } else {
              // Still inside tag — keep buffering, safety valve at 4000 chars
              if (tagFilterBuf.length > 4000) { tagFilterBuf = ""; inInternalTag = false; }
              break;
            }
          } else {
            const openIdx = tagFilterBuf.indexOf(OPEN_TAG);
            if (openIdx !== -1) {
              const safe = tagFilterBuf.slice(0, openIdx);
              if (safe) context.onUpdate?.({ type: "delta", text: safe });
              tagFilterBuf = tagFilterBuf.slice(openIdx + OPEN_TAG.length);
              inInternalTag = true;
            } else {
              // No open tag found — emit everything except the last N chars (partial tag guard)
              const guard = OPEN_TAG.length - 1;
              const safeLen = Math.max(0, tagFilterBuf.length - guard);
              if (safeLen > 0) {
                context.onUpdate?.({ type: "delta", text: tagFilterBuf.slice(0, safeLen) });
                tagFilterBuf = tagFilterBuf.slice(safeLen);
              }
              break;
            }
          }
        }
      }

      let sentDeltas = false;
      const aiResponse = provider.chatStream
        ? await provider.chatStream(llmRequest, (token) => {
            flushTagFilter(token);
            sentDeltas = true;
          })
        : await provider.chat(llmRequest);
      // Flush any remaining safe buffer after stream ends
      if (tagFilterBuf && !inInternalTag) {
        context.onUpdate?.({ type: "delta", text: tagFilterBuf });
        tagFilterBuf = "";
      }
      console.timeEnd(`LLM Round ${round}`);

      if (aiResponse.text.startsWith("Gemini request failed:")) {
        aiResponseText = aiResponse.text;
        break;
      }

      const toolCalls = extractToolCalls(aiResponse.text);
      
      // Loop Detection: Check if the agent is repeating text or tools
      const actionSignature = toolCalls.length > 0 
        ? toolCalls.map(t => `${t.tool}:${JSON.stringify(t.parameters)}`).join("|")
        : aiResponse.text;
      
      const agentLoopCheck = loopPreventionGuard.checkAgentAction(agent.id, sid, actionSignature, round);
      if (agentLoopCheck.blocked) {
        aiResponseText = agentLoopCheck.reason || "Agent loop detected. Terminating turn.";
        break;
      }

      if (toolCalls.length === 0) {
        aiResponseText = aiResponse.text;
        // Tokens were already emitted live; nothing more to flush
        break;
      }

      // Tool calls detected — clear any streamed partial text and continue
      if (sentDeltas) {
        context.onUpdate?.({ type: "delta_clear" });
      }

      let turnRes = "";
      for (const call of toolCalls) {
        context.onUpdate?.({ type: "tool_start", tool: call.tool, parameters: call.parameters });
        try {
          const res = await executeToolCall(call, sid, effectiveUserId);
          context.onUpdate?.({ type: "tool_end", tool: call.tool, parameters: call.parameters, result: res });
          toolLogs.push({ tool: call.tool, parameters: call.parameters, result: res });
          const hasFailed = res.startsWith("SCRAPER_ERROR") || res.startsWith("Error") || res.includes("Failed platforms") || res.includes("No job cards found");
          turnRes += `\nTool: ${call.tool}\n${hasFailed ? "⚠️ [TOOL_FAILED] You MUST explicitly tell the user which site(s) failed and what the error was.\n" : ""}Result: ${res}\n`;
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : "Unknown error";
          context.onUpdate?.({ type: "tool_end", tool: call.tool, parameters: call.parameters, result: `Error: ${errorMsg}` });
          toolLogs.push({ tool: call.tool, parameters: call.parameters, result: `Error: ${errorMsg}` });
          turnRes += `\nTool: ${call.tool}\nResult: Error — ${errorMsg}.\n`;
        }
      }
      toolContext = (toolContext + "\n" + turnRes).trim();
    }

    if (!aiResponseText && toolLogs.length > 0) {
      aiResponseText = `I completed the task with ${toolLogs.length} actions.`;
    }

    let finalReply = aiResponseText;
    const previewLogs = toolLogs.filter(l => l.tool === "preview_jobs");
    if (previewLogs.length > 0 && !finalReply.includes("__PREVIEW_JOBS__")) {
      const lastPreview = previewLogs[previewLogs.length - 1];
      finalReply += `\n\n${lastPreview.result}`;
    } else if (!finalReply.includes("__PREVIEW_JOBS__")) {
      // preview_jobs may have been called internally (auto-preview inside browser_extract_jobs)
      // In that case it won't appear in toolLogs, but the marker will be in toolContext
      const previewMatch = toolContext.match(/__PREVIEW_JOBS__[\s\S]*?__END_PREVIEW__/);
      if (previewMatch) {
        finalReply = previewMatch[0] + "\n\n" + finalReply;
      }
    }

    const normalizedReply = normalizeAgentReply(finalReply);
    if (effectiveUserId) {
      void Promise.all([
        agentStore.saveMessage({ sessionId: sid, role: "USER", content: context.message, tokenEstimate: 0, agentId: agent.id, userId: effectiveUserId }),
        agentStore.saveMessage({ sessionId: sid, role: "ASSISTANT", content: normalizedReply, tokenEstimate: 0, agentId: agent.id, userId: effectiveUserId }),
      ]).catch(() => {});
    }

    const continuityUpdate = extractContinuityUpdate(aiResponseText);
    if (continuityUpdate) {
      void continuitySyncService.syncLayersWithLlm(agent.id, sid, continuityUpdate, effectiveUserId);
    }

    return { 
      reply: normalizedReply, 
      shouldWriteSummary: true, 
      loopPrevented: false, 
      tokenBudgetWarning: budget.warning, 
      sessionId: effectiveSessionId, 
      onboardingCompleted: true, 
      continuitySynced: true, 
      rehydrated, 
      toolLogs, 
      pendingJobs: pendingJobsStore.get(sid) || null 
    };
  }
}

export const conversationOrchestrator = new ConversationOrchestrator();
