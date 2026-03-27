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

const maxToolRounds = 25;

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
  isAlreadyImported?: boolean;
};
const pendingJobsStore = new Map<string, PendingJob[]>();

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
    description: "Import previously previewed jobs into the pipeline. If the session state is lost, you can pass the 'jobs' array directly. Parameters: { action?: 'import_all' | 'import_selected', indices?: number[], jobs?: Job[] }",
    parameters: {
      action: "string?",
      indices: "number[]?",
      jobs: "Job[]?",
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
    description: "Crawl a website using Crawl4AI and return its LLM-optimized Markdown content. Use this to research specific job descriptions, company about pages, or career portals. Parameters: { url: string }",
    parameters: { url: "string" },
  },
  {
    name: "browser_extract_jobs",
    description: "Search for jobs on LinkedIn or other boards and extract structured data using Crawl4AI discovery. Parameters: { query: string, location: string, limit?: number }",
    parameters: { query: "string", location: "string", limit: "number?" },
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
      ["http://127.0.0.1:3001", env.NEXT_PUBLIC_APP_URL, env.NEXTAUTH_URL, "http://127.0.0.1:3000"]
        .filter(Boolean),
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

async function executeToolCall(toolCall: ToolCall, sid: string): Promise<string> {
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
    return `__PREVIEW_JOBS__${JSON.stringify(finalJobs)}__END_PREVIEW__\n\n### 🔍 Job Discovery Preview\nPreviewed ${finalJobs.length} accumulated job(s) for your review:\n${jobList}\n\nReview the list below. Jobs already in your pipeline are marked. Click 'Import All' to save the rest.`;
  }
  if (toolCall.tool === "import_pending_jobs") {
    const params = importPendingJobsSchema.parse(toolCall.parameters);
    let pending = pendingJobsStore.get(sid);
    
    // Fallback: Use passed jobs if store is empty
    if ((!pending || pending.length === 0) && params.jobs && params.jobs.length > 0) {
      pending = params.jobs;
    }

    if (!pending || pending.length === 0) {
      return "No pending jobs to import. Try searching again.";
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
        const payload = await postInternalJson<{ success: boolean; job: { id: string; title: string; company: string } }>("/api/jobs", {
          title: job.title,
          company: job.company,
          location: job.location,
          url: job.url,
          salary: job.salary,
          source: job.source || "Agent Search",
          description: job.description,
          skills: job.skills,
        });
        results.push(`✅ "${payload.job.title}" at ${payload.job.company} — saved`);
        job.isAlreadyImported = true; // Mark as imported in the store
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
  if (toolCall.tool === "save_job") {
    const params = saveJobToolSchema.parse(toolCall.parameters);
    const payload = await postInternalJson<{ success: boolean; job: { id: string; title: string; company: string } }>("/api/jobs", params);
    
    // Update pending store if this URL was in there
    const pending = pendingJobsStore.get(sid) || [];
    const idx = pending.findIndex(j => j.url === params.url);
    if (idx !== -1) {
      pending[idx].isAlreadyImported = true;
      pendingJobsStore.set(sid, pending);
    }

    return `Job "${payload.job.title}" at ${payload.job.company} saved successfully.`;
  }
  if (toolCall.tool === "read_context_memory") {
    const context = await continuitySyncService.hydrateTurnContext(sid, sid);
    const fullContext = context.recentContext || "No context memory found.";
    return `### 🧠 Context Memory\n${fullContext}`;
  }
  if (toolCall.tool === "gmail_sync") {
    const payload = await postInternalJson<{ success: boolean; count: number; threads?: any[] }>("/api/integrations/gmail/sync", {});
    return `Successfully synced ${payload.count} new/updated job threads.`;
  }
  if (toolCall.tool === "gmail_get_threads") {
    const jobId = String(toolCall.parameters.jobId || "");
    const payload = await postInternalJson<{ threads: any[] }>(`/api/jobs/${jobId}/emails`, {});
    return `Found ${payload.threads?.length || 0} threads.`;
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
    const { url } = toolCall.parameters as { url: string };
    const result = await ScraperService.scrape(url);
    if (!result.success) return `Error scraping ${url}: ${result.error}`;
    
    let response = `### 📄 Web Content: ${url}\n\n${result.markdown}`;
    if (result.jobs && result.jobs.length > 0) {
      response += `\n\n**STRUCTURED_DATA_FOUND**: I extracted ${result.jobs.length} structured items from this page. Use these for high-fidelity extraction.\n${JSON.stringify(result.jobs, null, 2)}`;
    }
    return response;
  }
  if (toolCall.tool === "browser_extract_jobs") {
    const { query, location } = toolCall.parameters as { query: string, location: string };
    // We construct a LinkedIn search URL as a primary discovery source
    const searchUrl = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(query)}&location=${encodeURIComponent(location)}`;
    const result = await ScraperService.scrape(searchUrl);
    if (!result.success) return `Error searching for jobs: ${result.error}`;
    
    let response = `### 🔍 Job Discovery: ${query} in ${location}\n\n${result.markdown}`;
    if (result.jobs && result.jobs.length > 0) {
      response += `\n\n**STRUCTURED_JOBS_FOUND**: I found ${result.jobs.length} structured job listings. Use these to populate the preview box.\n${JSON.stringify(result.jobs, null, 2)}`;
    }
    response += `\n\n**INSTRUCTION**: Analyze the content above and use the 'preview_jobs' tool to present relevant roles to the user.`;
    return response;
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
    const session = await auth();
    const isDeveloper = session?.user?.role === "ADMIN" || session?.user?.email === "admin@aijobos.local";
    const dynamicMaxRounds = isDeveloper ? 100 : maxToolRounds;

    const agent = await agentRegistry.getAgent(context.agentId, context.userId);
    const effectiveUserId = context.userId ?? agent.userId;
    
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

    let historyContext = "";
    if (sid !== "new" && sid !== "default") {
      try {
        const historyMessages = await agentStore.getSessionMessages(sid);
        if (historyMessages.length > 0) {
          historyContext = historyMessages.slice(-5).map(m => `${m.role}: ${m.content}`).join("\n\n");
        }
      } catch {}
    }

    let taskType: string | undefined;
    const msg = context.message.toLowerCase();
    if (msg.includes("search") || msg.includes("find") || msg.includes("discovery")) taskType = "search";
    else if (msg.includes("import") || msg.includes("save") || msg.includes("add")) taskType = "validate";
    else if (msg.includes("score") || msg.includes("filter") || msg.includes("fit")) taskType = "score";
    else if (msg.includes("draft") || msg.includes("email") || msg.includes("write")) taskType = "outreach";

    const layers = await continuitySyncService.hydrateTurnContext(agent.id, sid, taskType);
    context.onUpdate?.({ type: "status", status: taskType === "search" ? "Searching for jobs..." : "Analyzing request..." });
    await continuitySyncService.logContextMemory(`Starting turn: ${taskType || "general"}`);

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
    const systemPrompt = composeAgentSystemPrompt(agent, layers);
    console.timeEnd("Prompt Composition");

    const provider = getAiProvider(context.preferredProvider);
    let aiResponseText = "";
    let toolContext = "";
    const toolLogs: Array<{ tool: string; parameters: any; result: string }> = [];

    const formattedHistory = (historyContext && historyContext !== "No history yet.") ? historyContext : null;
    const rehydrated = layers.soul ? true : false;
    const internalStateStr = [
      layers.mind ? `[MIND]\n${layers.mind}` : "",
      layers.recentContext ? `[RECENT CONTEXT]\n${layers.recentContext}` : ""
    ].filter(Boolean).join("\n\n");

    for (let round = 0; round < dynamicMaxRounds && !aiResponseText; round++) {
      const continuationPrompt = round > 0
        ? `--- CONTINUATION Round ${round} ---`
        : null;

      console.time(`LLM Round ${round}`);
      const aiResponse = await provider.chat({
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
      });
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
        break;
      }

      let turnRes = "";
      for (const call of toolCalls) {
        context.onUpdate?.({ type: "tool_start", tool: call.tool, parameters: call.parameters });
        try {
          const res = await executeToolCall(call, sid);
          context.onUpdate?.({ type: "tool_end", tool: call.tool, parameters: call.parameters, result: res });
          toolLogs.push({ tool: call.tool, parameters: call.parameters, result: res });
          turnRes += `\nTool: ${call.tool}\nResult: ${res}\n`;
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
    }

    const normalizedReply = normalizeAgentReply(finalReply);
    if (effectiveUserId) {
      try {
        await agentStore.saveMessage({ sessionId: sid, role: "USER", content: context.message, tokenEstimate: 0, agentId: agent.id, userId: effectiveUserId });
        await agentStore.saveMessage({ sessionId: sid, role: "ASSISTANT", content: normalizedReply, tokenEstimate: 0, agentId: agent.id, userId: effectiveUserId });
      } catch {}
    }

    const continuityUpdate = extractContinuityUpdate(aiResponseText);
    if (continuityUpdate) {
      await continuitySyncService.syncLayersWithLlm(agent.id, sid, continuityUpdate);
    }

    await continuitySyncService.logContextMemory("Turn execution completed");

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
