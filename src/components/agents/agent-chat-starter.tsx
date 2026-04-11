"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { activeAgent, initialChat, createInitialChat } from "@/lib/mock/data";
import type { SyncedAgentProfile } from "@/lib/services/agent/agent-profile-sync";
import type { ChatMessageView } from "@/types/domain";
import { Eye, Clock, ArrowDownToLine, CheckCircle2, X, FileText, Wrench, DollarSign, Paperclip, FileImage } from "lucide-react";
import { ExtensionBanner } from "./extension-banner";

function ScraperTimer({ startedAt, isDone, onHide }: { startedAt: number; isDone: boolean; onHide: () => void }) {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    if (isDone) {
      setPct(100);
      const timeout = setTimeout(onHide, 700);
      return () => clearTimeout(timeout);
    }

    const id = setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000;
      // Asymptotic easing: fast early, slows near 95%, never reaches 100% until done
      // 100 * (1 - e^(-elapsed/30)) → ~28% at 10s, ~63% at 30s, ~86% at 60s, caps at 95%
      const newPct = Math.min(98, 100 * (1 - Math.exp(-elapsed / 30)));
      setPct(newPct);
    }, 250);

    return () => clearInterval(id);
  }, [startedAt, isDone, onHide]);

  return (
    <div className="mt-2 rounded-lg border border-cyan-200 dark:border-cyan-500/30 bg-cyan-50/80 dark:bg-cyan-500/10 px-3 py-2 text-xs text-cyan-800 dark:text-cyan-300 space-y-1.5">
      <div className="flex items-center gap-1 font-semibold">
        <Clock className="h-3 w-3" />
        Searching job boards…
      </div>
      <div className="h-1.5 w-full rounded-full bg-cyan-200 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-cyan-400 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

const ChatMessageItem = React.memo(({
  message,
  showToolUse,
  previewJobs,
  onImportAll,
  onImportSingle,
  onDismiss,
  importing,
  scraperStartedAt,
  scraperDone,
  onScraperHide,
  isStreaming,
}: {
  message: ChatMessageView;
  showToolUse: boolean;
  previewJobs?: JobPreview[] | null;
  onImportAll?: () => void;
  onImportSingle?: (idx: number) => void;
  onDismiss?: () => void;
  importing?: boolean;
  scraperStartedAt?: number | null;
  scraperDone?: boolean;
  onScraperHide?: () => void;
  isStreaming?: boolean;
}) => {
  const content = useMemo(() => {
    return message.content
      // Strip complete preview block (both markers present)
      .replace(/__PREVIEW_JOBS__[\s\S]*?__END_PREVIEW__/gi, "")
      // Strip partial preview block still streaming (no closing marker yet)
      .replace(/__PREVIEW_JOBS__[\s\S]*/gi, "")
      // Strip raw tool-call JSON blobs that leak during streaming
      .replace(/\{\s*"tool"\s*:\s*"[a-z_]+"\s*,\s*"parameters"\s*:[\s\S]*/m, "")
      .trim()
      // Strip trailing pipe/cursor characters left by LLM
      .replace(/\s*\|\s*$/, "");
  }, [message.content]);

  const extractedJobs = useMemo(() => {
    if (previewJobs && previewJobs.length > 0) return previewJobs;
    
    // Extract using __END_PREVIEW__ boundary — safe against ] inside descriptions
    try {
      const boundaryMatch = message.content.match(/__PREVIEW_JOBS__([\s\S]*?)__END_PREVIEW__/i);
      if (boundaryMatch) {
        return JSON.parse(boundaryMatch[1].trim()) as JobPreview[];
      }
    } catch (e) {
      console.warn("[ChatMessageItem] Extraction fallback failed:", e);
    }
    return null;
  }, [message.content, previewJobs]);

  const toolLogs: any[] = (message as any).toolLogs || [];
  const isThinking = !content && message.role === "ASSISTANT";
  const activeToolLog = toolLogs.find((l: any) => l.result === "Executing...");
  const lastCompletedTool = [...toolLogs].reverse().find((l: any) => l.result !== "Executing...");

  if (!content && message.role === "ASSISTANT" && !toolLogs.length) return null;

  return (
    <div className="space-y-2">
      <div
        className={`max-w-[85%] w-fit rounded-xl px-4 py-2 text-sm shadow-sm leading-snug break-words overflow-hidden ${
          message.role === "USER"
            ? "ml-auto bg-gradient-to-br from-cyan-600 to-cyan-700 text-white whitespace-pre-wrap"
            : "border border-white/60 dark:border-slate-600/60 bg-white/90 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
        }`}
      >
        {message.role === "ASSISTANT" ? (
          <div className="space-y-3">
            {/* Operator logs — inside the bubble */}
            {showToolUse && toolLogs.length > 0 && (
              <div className="rounded-lg border border-dashed border-cyan-500/30 bg-cyan-500/5 p-2 text-[10px] font-mono text-cyan-700/70 dark:text-cyan-400/70 max-h-[220px] overflow-y-auto break-words custom-scrollbar">
                <p className="mb-1 uppercase tracking-wider font-bold sticky top-0 bg-cyan-50/90 dark:bg-slate-800/90 backdrop-blur-sm px-1 py-0.5 z-10 text-cyan-800 dark:text-cyan-300">Tool Calls</p>
                {toolLogs.map((log: any, idx: number) => {
                  const resultStr = typeof log.result === "string" ? log.result : JSON.stringify(log.result ?? "");
                  const preview = resultStr.length > 220 ? resultStr.slice(0, 220) + "…" : resultStr;
                  const paramStr = JSON.stringify(log.parameters ?? {});
                  const paramPreview = paramStr.length > 120 ? paramStr.slice(0, 120) + "…" : paramStr;
                  const isDone = log.result !== "Executing...";
                  return (
                    <div key={idx} className="mb-1.5 last:mb-0 border-l-2 border-cyan-500/30 pl-2">
                      <p className="font-bold flex items-center gap-1">
                        <span>{isDone ? "✓" : "⟳"}</span>
                        <span>{log.tool?.replace(/_/g, " ")}</span>
                      </p>
                      <p className="mt-0.5 opacity-60 italic truncate">{paramPreview}</p>
                      {isDone && <p className="mt-0.5 opacity-70 whitespace-pre-wrap">{preview}</p>}
                    </div>
                  );
                })}
              </div>
            )}
            {/* Thinking state: show live tool activity inside the bubble */}
            {isThinking && (
              <div className="space-y-2 min-w-[200px]">
                <div className="flex items-center gap-2">
                  <div className="flex gap-0.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-500 animate-bounce [animation-delay:0ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-500 animate-bounce [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-500 animate-bounce [animation-delay:300ms]" />
                  </div>
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    {activeToolLog ? `Running: ${activeToolLog.tool.replace(/_/g, " ")}` : "Atlas is thinking..."}
                  </span>
                </div>
                {toolLogs.length > 0 && (
                  <div className="space-y-1">
                    {toolLogs.map((log: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-1.5 text-[11px] text-slate-500">
                        {log.result === "Executing..." ? (
                          <span className="h-1 w-1 rounded-full bg-amber-400 animate-pulse flex-none" />
                        ) : (
                          <span className="h-1 w-1 rounded-full bg-emerald-500 flex-none" />
                        )}
                        <span className={log.result === "Executing..." ? "text-amber-700 font-medium" : "text-slate-500"}>
                          {log.tool.replace(/_/g, " ")}
                          {log.result === "Executing..." ? "..." : " ✓"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {lastCompletedTool && (
                  <p className="text-[10px] text-slate-400 italic truncate max-w-[280px]">
                    Last: {typeof lastCompletedTool.result === "string" ? lastCompletedTool.result.slice(0, 80) : "Done"}
                  </p>
                )}
              </div>
            )}
            {/* Scraper progress — visible while active and during completion animation */}
            {scraperStartedAt !== null && scraperStartedAt !== undefined && (
              <div className="space-y-1.5">
                <ScraperTimer
                  startedAt={scraperStartedAt}
                  isDone={!!scraperDone}
                  onHide={onScraperHide ?? (() => {})}
                />
                {!scraperDone && (
                  <p className="text-[10px] text-cyan-600/80 dark:text-cyan-400/70 flex items-center gap-1">
                    <Eye className="h-3 w-3 flex-shrink-0" />
                    Watch the live search in your browser tab above
                  </p>
                )}
              </div>
            )}
            {/* Final response */}
            {content && (
              <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:font-bold prose-headings:mt-3 prose-headings:mb-1 prose-strong:font-bold prose-p:my-0 prose-p:leading-snug prose-ul:my-0 prose-ol:my-0 prose-li:my-0 prose-li:leading-snug prose-hr:hidden">
                <ReactMarkdown
                  components={{
                    a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" className="text-cyan-600 hover:underline" />,
                    // Suppress <hr> — avoids flickering line during streaming when `---` is partially rendered
                    hr: () => null,
                  }}
                >
                  {content}
                </ReactMarkdown>
              </div>
            )}

            {extractedJobs && extractedJobs.length > 0 && (
              <JobPreviewBox
                jobs={extractedJobs}
                onImportAll={onImportAll!}
                onImportSingle={onImportSingle!}
                onDismiss={onDismiss!}
                importing={importing!}
              />
            )}
          </div>
        ) : (
          message.content
        )}
      </div>
    </div>
  );
}, (prev, next) => (
  prev.message.id === next.message.id &&
  prev.showToolUse === next.showToolUse &&
  prev.importing === next.importing &&
  prev.scraperStartedAt === next.scraperStartedAt &&
  prev.scraperDone === next.scraperDone &&
  prev.message.content === next.message.content &&
  prev.previewJobs?.length === next.previewJobs?.length &&
  prev.previewJobs?.filter(j => j.isAlreadyImported).length === next.previewJobs?.filter(j => j.isAlreadyImported).length &&
  (prev.message as any).toolLogs?.length === (next.message as any).toolLogs?.length &&
  (prev.message as any).toolLogs?.[(prev.message as any).toolLogs?.length - 1]?.result === (next.message as any).toolLogs?.[(next.message as any).toolLogs?.length - 1]?.result
));

type SyncStatusResponse = {
  userName?: string | null;
  summary: {
    lastSyncedAt: string;
    alignmentStatus: string;
  };
  usage: {
    totalTokens: number;
    lastUpdated: string;
  };
  layers: {
    soul: { mission: string };
    identity: { name: string };
    agent: { mode: string };
    memory: { summaries: string[]; todos: string[] };
    history: { recentTurnCount: number };
  };
};

function initialProfile(): SyncedAgentProfile {
  return {
    agentId: activeAgent.id,
    name: "Atlas",
    roleTitle: activeAgent.identity.roleTitle,
    specialization: "Job search intelligence and outreach support",
    soulMission: activeAgent.soul.mission,
    longTermObjective: "Land high-fit interviews with focused, low-noise actions.",
    principles: activeAgent.soul.principles,
    decisionPhilosophy: "Prioritize evidence-backed opportunities and avoid noisy actions.",
    communicationStyle: activeAgent.identity.communicationStyle,
    personalityStyle: activeAgent.identity.communicationStyle,
    mindModel: activeAgent.mind.model,
    mindConstraints: ["Do not fabricate facts", "Always stay within user-approved actions"],
    memoryAnchors: "Prefer high-fit roles and concise updates.",
  };
}

let cachedSessions: Array<{ id: string; title: string }> | null = null;
let cachedSessionId: string | null = null;
let cachedMessages: ChatMessageView[] | null = null;

import { useAgent } from "@/components/providers/agent-provider";


type JobPreview = {
  title: string;
  company: string;
  location: string;
  url: string;
  salary?: string;
  source?: string;
  description?: string;
  skills?: string;
  datePosted?: string;
  jobType?: string;
  score?: number;
  cvScore?: number;
  cvGaps?: string[];
  isAlreadyImported?: boolean;
  hasDescription?: boolean;
  hasSkills?: boolean;
  descriptionPreview?: string;
};

const JobPreviewBox = ({ 
  jobs, 
  onImportAll, 
  onImportSingle, 
  onDismiss, 
  importing 
}: { 
  jobs: JobPreview[]; 
  onImportAll: () => void; 
  onImportSingle: (idx: number) => void; 
  onDismiss: () => void; 
  importing: boolean;
}) => {
  return (
    <div className="mt-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="rounded-xl border border-slate-200/60 dark:border-white/10 bg-slate-50/50 dark:bg-white/5 p-3 shadow-inner">
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-cyan-600 text-[10px] font-bold text-white shadow-sm ring-2 ring-white">{jobs.filter(j => !j.isAlreadyImported).length}</span>
            <p className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-tight">
              {jobs.every(j => j.isAlreadyImported) ? "Discovery Complete" : "Staged Roles"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!jobs.every(j => j.isAlreadyImported) && (
              <button
                onClick={onImportAll}
                disabled={importing}
                className="rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-all hover:from-emerald-600 hover:to-emerald-700 hover:shadow-md disabled:opacity-50 active:scale-95"
              >
                {importing ? "Importing..." : <><ArrowDownToLine className="inline h-3 w-3 mr-1" />Import All</>}
              </button>
            )}
            <button
              onClick={onDismiss}
              disabled={importing}
              className="rounded-lg border border-slate-200 dark:border-white/10 bg-white/80 dark:bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 shadow-sm transition-all hover:bg-slate-50 dark:hover:bg-white/10 hover:border-slate-300 dark:hover:border-white/20 disabled:opacity-50 active:scale-95"
            >
              <X className="inline h-3 w-3 mr-1" />{jobs.every(j => j.isAlreadyImported) ? "Close" : "Dismiss"}
            </button>
          </div>
        </div>
        {jobs.every(j => j.isAlreadyImported) && (
          <div className="mb-4 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 p-3 text-center animate-in zoom-in duration-300">
            <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">🎉 All jobs have been imported to your job pipeline. You can see them on the Jobs interface.</p>
          </div>
        )}
        <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar pr-1">
          {jobs.map((job, idx) => (
            <div key={idx} className="group flex items-start justify-between rounded-lg border border-white/60 dark:border-white/10 bg-white/70 dark:bg-white/5 p-3 transition-all hover:border-cyan-200 dark:hover:border-cyan-500/40 hover:bg-white dark:hover:bg-white/10 hover:shadow-sm">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">{job.title}</p>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{job.company} • {job.location}</p>
                {job.descriptionPreview && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-snug">{job.descriptionPreview}</p>
                )}
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {/* Search relevance score (query+location fit, not profile match) */}
                  {job.score != null && (
                    (() => {
                      const pct = job.score > 1 ? Math.round(job.score) : Math.round(job.score * 100);
                      const color = pct >= 70
                        ? "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 ring-emerald-200/60 dark:ring-emerald-500/30"
                        : pct >= 40
                          ? "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 ring-amber-200/60 dark:ring-amber-500/30"
                          : "bg-slate-50 dark:bg-white/5 text-slate-500 dark:text-slate-400 ring-slate-200/60 dark:ring-white/10";
                      return (
                        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold ring-1 ${color}`}>
                          ⚡ {pct}% relevance
                        </span>
                      );
                    })()
                  )}
                  {/* CV fit score */}
                  {job.cvScore != null && job.cvScore >= 0 && (
                    (() => {
                      const cvPct = job.cvScore > 1 ? Math.round(job.cvScore) : Math.round(job.cvScore * 100);
                      const cvColor = cvPct >= 70
                        ? "bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400 ring-blue-200/60 dark:ring-blue-500/30"
                        : cvPct >= 40
                          ? "bg-violet-50 dark:bg-violet-500/15 text-violet-700 dark:text-violet-400 ring-violet-200/60 dark:ring-violet-500/30"
                          : "bg-slate-50 dark:bg-white/5 text-slate-500 dark:text-slate-400 ring-slate-200/60 dark:ring-white/10";
                      return (
                        <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold ring-1 ${cvColor}`} title={job.cvGaps?.length ? `CV gaps: ${job.cvGaps.join(", ")}` : "Strong CV match"}>
                          <FileText className="h-2.5 w-2.5" />{cvPct}% CV fit
                        </span>
                      );
                    })()
                  )}
                  {/* CV gaps */}
                  {job.cvGaps && job.cvGaps.length > 0 && (
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                      gaps: {job.cvGaps.join(", ")}
                    </span>
                  )}
                  {/* Salary */}
                  {(() => {
                    const raw = job.salary?.trim();
                    const noInfo = !raw || /^(not specified|not disclosed|n\/a|none|null)$/i.test(raw);
                    const isCompetitive = /competi|negotia|market rate|attractive/i.test(raw || "");
                    const display = noInfo ? "Not disclosed" : raw!;
                    const cls = noInfo
                      ? "bg-slate-50 dark:bg-white/5 text-slate-500 dark:text-slate-400 ring-slate-200/60 dark:ring-white/10"
                      : isCompetitive
                        ? "bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400 ring-blue-200/60 dark:ring-blue-500/30"
                        : "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 ring-emerald-200/60 dark:ring-emerald-500/30";
                    return (
                      <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold ring-1 ${cls}`}>
                        <DollarSign className="h-2.5 w-2.5" />{display}
                      </span>
                    );
                  })()}
                  {/* Job type */}
                  {job.jobType?.trim() && (
                    <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold bg-violet-50 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300 ring-1 ring-violet-200/60 dark:ring-violet-500/30">
                      {job.jobType.trim()}
                    </span>
                  )}
                  {/* Date posted */}
                  {job.datePosted?.trim() && (
                    <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold bg-cyan-50 dark:bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-100 dark:border-cyan-500/30">
                      <Clock className="h-2.5 w-2.5" />{job.datePosted.trim()}
                    </span>
                  )}
                  {/* Source */}
                  {job.source?.trim() && (
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium bg-slate-100/60 dark:bg-white/5 px-1.5 py-0.5 rounded border border-slate-200/60 dark:border-white/10">{job.source.trim()}</span>
                  )}
                  {/* Richness indicators */}
                  {job.hasDescription && (
                    <span title={job.descriptionPreview || "Full description available"} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-200/60 dark:ring-indigo-500/30 cursor-help">
                      <FileText className="h-2.5 w-2.5" />desc
                    </span>
                  )}
                  {job.hasSkills && (
                    <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold bg-teal-50 dark:bg-teal-500/15 text-teal-700 dark:text-teal-300 ring-1 ring-teal-200/60 dark:ring-teal-500/30">
                      <Wrench className="h-2.5 w-2.5" />skills
                    </span>
                  )}
                  {/* View link */}
                  <a
                    href={job.url && job.url !== "#" ? job.url : `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(`${job.title} ${job.company}`)}&location=${encodeURIComponent(job.location || "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] font-bold text-cyan-600 hover:text-cyan-800 hover:underline transition-all"
                  >
                    {job.url && job.url !== "#" ? "View listing ↗" : "Search ↗"}
                  </a>
                </div>
              </div>
              {job.isAlreadyImported ? (
                <div className="ml-2 flex-none px-2 py-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-500/10 rounded-md border border-emerald-100/50 dark:border-emerald-500/20 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />Imported
                </div>
              ) : (
                <button
                  onClick={() => void onImportSingle(idx)}
                  disabled={importing}
                  className="ml-2 flex-none rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700 opacity-0 transition-all group-hover:opacity-100 hover:bg-emerald-100 disabled:opacity-50 active:scale-95"
                >
                  Import
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export function AgentChatStarter() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlSessionId = searchParams?.get("sessionId") || undefined;

  const {
    messages, setMessages,
    sessionId, setSessionId,
    sessions, setSessions,
    pendingJobs, setPendingJobs,
    loading, setLoading,
    initialLoading, setInitialLoading
  } = useAgent();

  const [input, setInput] = useState("");
  const [showToolUse, setShowToolUse] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState(activeAgent.onboardingCompleted);
  const [profile, setProfile] = useState<SyncedAgentProfile>(initialProfile);
  const [syncStatus, setSyncStatus] = useState<SyncStatusResponse | null>(null);
  const [showImportSuccess, setShowImportSuccess] = useState(false);
  const [importingJobs, setImportingJobs] = useState(false);
  const [loadingTextIndex, setLoadingTextIndex] = useState(0);
  const [scraperStartedAt, setScraperStartedAt] = useState<number | null>(null);
  const [scraperDone, setScraperDone] = useState(false);
  const [importedJobUrls, setImportedJobUrls] = useState<Set<string>>(new Set());
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const newChatRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastTextDeltaRef = useRef<number>(0);
  const [isTextActive, setIsTextActive] = useState(false);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [pendingUploadFile, setPendingUploadFile] = useState<File | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // History scroll only
  }, [messages]);

  const processingSteps = [
    "Atlas is organizing the search strategy...",
    "Analyzing request...",
    "Formulating response..."
  ];

  async function saveJobDirect(job: JobPreview): Promise<boolean> {
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: job.title,
          company: job.company,
          location: job.location || "Unknown",
          salary: job.salary || "",
          url: job.url || "",
          source: job.source || "Atlas",
          description: job.description || "",
          skills: Array.isArray(job.skills) ? job.skills.join(", ") : (job.skills || ""),
          datePosted: job.datePosted || "",
          score: job.score ?? 0,
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async function handleImportAllInMessage(jobsInMessage: JobPreview[]) {
    if (!jobsInMessage || jobsInMessage.length === 0) return;
    setImportingJobs(true);
    await Promise.all(jobsInMessage.map(saveJobDirect));
    // Mark all as imported so UI updates
    setImportedJobUrls(prev => {
      const next = new Set(prev);
      for (const j of jobsInMessage) if (j.url) next.add(j.url);
      return next;
    });
    setImportingJobs(false);
  }

  async function handleImportSingleInMessage(job: JobPreview) {
    setImportingJobs(true);
    await saveJobDirect(job);
    if (job.url) setImportedJobUrls(prev => new Set(prev).add(job.url!));
    setImportingJobs(false);
  }

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (loading && !importingJobs && !initialLoading) {
      setLoadingTextIndex(0);
      interval = setInterval(() => {
        setLoadingTextIndex((prev) => Math.min(prev + 1, processingSteps.length - 1));
      }, 4000);
    }
    return () => clearInterval(interval);
  }, [loading, importingJobs, initialLoading]);

  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Effect 1: Loading Sessions (run once on mount if not hydrated)
  useEffect(() => {
    // If we already have messages and sessions, we're good
    if (messages.length > initialChat.length && sessions.length > 0 && !urlSessionId) {
      setInitialLoading(false);
      return; 
    }

    let ignore = false;
    async function loadSessions() {
      try {
        const response = await fetch(`/api/agents/sessions?agentId=${activeAgent.id}`);
        if (!response.ok) throw new Error("Failed to load sessions");
        const data = await response.json();
        
        if (!ignore) {
          const loadedSessions: { id: string; title: string }[] = data.sessions || [];
          setSessions(loadedSessions);
          
          // Hydration Optimization: Use messages if returned in list response
          if (data.hydratedMessages && data.hydratedMessages.length > 0) {
            console.log("[Performance] Using hydrated messages for first session");
            
            // Format hydrated messages with IDs if missing
            const formattedHydrated = data.hydratedMessages.map((m: any) => ({
              ...m,
              id: m.id || crypto.randomUUID()
            }));

            // Hydrate if we don't have a specific URL session requested, and either we don't have a local session or our local session matches the hydrated one
            if (!urlSessionId && (!sessionId || sessionId === data.hydratedSessionId)) {
              setMessages(formattedHydrated);
              setSessionId(data.hydratedSessionId);
              setInitialLoading(false);
              return;
            }
          }

          // If we need to arbitrarily pick the first session because there's no url, no active session, and no cache
          if (loadedSessions.length > 0 && !urlSessionId && !sessionId && !newChatRef.current) {
            void switchSession(loadedSessions[0].id);
          } else {
            if (!urlSessionId) {
              setInitialLoading(false);
            }
          }
        }
      } catch (error) {
        console.error("Failed to load sessions:", error);
        if (!ignore) setInitialLoading(false);
      }
    }
    void loadSessions();
    return () => { ignore = true; };
  }, [activeAgent.id, urlSessionId]);

  // Effect 2: Loading Sync Status (reaction to active session, debounced)
  useEffect(() => {
    let ignore = false;

    const debounce = setTimeout(() => {
      async function loadSyncStatus() {
        const targetSid = sessionId || urlSessionId || "default";
        try {
          const response = await fetch(`/api/agents/sync-status?agentId=atlas&sessionId=${targetSid}`);
          const payload = (await response.json()) as SyncStatusResponse;
          if (!ignore) setSyncStatus(payload);
        } catch {
          if (!ignore) setSyncStatus(null);
        }
      }
      void loadSyncStatus();
    }, 300); // debounce — skip if sessionId changes rapidly

    return () => {
      ignore = true;
      clearTimeout(debounce);
    };
  }, [sessionId, urlSessionId]);

  // Effect 2b: Personalize initial greeting once user name is known
  useEffect(() => {
    if (!syncStatus?.userName) return;
    setMessages((prev) => {
      if (prev.length === 1 && prev[0].id === "greeting-msg") {
        return createInitialChat(syncStatus.userName);
      }
      return prev;
    });
  }, [syncStatus?.userName]);

  // Effect 3: URL Synchronization
  useEffect(() => {
    if (urlSessionId) {
      // If we have a URL session but we don't have its messages cached OR we haven't synced state
      if (urlSessionId !== cachedSessionId || urlSessionId !== sessionId) {
        void switchSession(urlSessionId);
      } else {
        // We have the URL session in cache, clear loading
        setInitialLoading(false);
      }
    }
  }, [urlSessionId]);

  async function switchSession(id: string) {
    if (id === "new") {
      newChatRef.current = true;
      setSessionId(undefined);
      cachedSessionId = null;
      setMessages(initialChat);
      cachedMessages = null;
      setPendingJobs(null);
      router.push("/agents/workspace");
      return;
    }
    newChatRef.current = false;
    
    // Prevent redundant loading if already on this session
    if (id === sessionId && messages.length > initialChat.length) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/agents/sessions?sessionId=${id}`);
      const payload = (await response.json()) as { messages: Array<{ role: string; content: string; createdAt: string }> };
      const formatted = payload.messages.map((m) => ({
        id: crypto.randomUUID(),
        role: m.role as "USER" | "ASSISTANT",
        content: m.content,
        createdAt: m.createdAt,
      }));
      setMessages(formatted.length > 0 ? formatted : initialChat);
      cachedMessages = formatted.length > 0 ? formatted : initialChat;
      setSessionId(id);
      cachedSessionId = id;
      setPendingJobs(null);
      router.push(`/agents/workspace?sessionId=${id}`);
    } catch {
      // error handling
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  }

  const CHAT_CV_MAX_BYTES = 10 * 1024 * 1024;
  const CHAT_CV_ACCEPT_EXTS = new Set([".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png", ".webp"]);

  function validateCvFile(file: File): string | null {
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!CHAT_CV_ACCEPT_EXTS.has(ext))
      return "Please upload a CV or resume only (PDF, DOC, DOCX, or image).";
    if (file.size > CHAT_CV_MAX_BYTES)
      return "File exceeds 10 MB limit. Please upload a smaller file.";
    return null;
  }

  async function sendMessage(overrideMessage?: string) {
    // If file is confirmed and attached, upload first then trigger Atlas
    if (attachedFile && !overrideMessage) {
      setUploading(true);
      setAttachError(null);
      const fd = new FormData();
      fd.append("file", attachedFile);
      try {
        const res = await fetch("/api/cv", { method: "POST", body: fd });
        const json = await res.json();
        if (!res.ok || !json.success) {
          setAttachError((json as { error?: string }).error ?? "Upload failed. Please try again.");
          setUploading(false);
          return;
        }
      } catch {
        setAttachError("Upload failed. Please check your connection.");
        setUploading(false);
        return;
      }
      setUploading(false);
      const uploadedName = attachedFile.name;
      setAttachedFile(null);
      void sendMessage(`I've uploaded my CV/resume "${uploadedName}" for review. Please analyze it, give me upgrade suggestions, confirm that the CV has been saved to my CV library, and suggest target job roles that match my profile.`);
      return;
    }

    const msg = overrideMessage || input.trim();
    if (!msg) return;
    setInitialLoading(false);

    const userMessage: ChatMessageView = {
      id: crypto.randomUUID(),
      role: "USER",
      content: msg,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => {
      const next = [...prev, userMessage];
      cachedMessages = next;
      return next;
    });
    if (!overrideMessage) setInput("");
    setLoading(true);
    setSyncStatus(null);

    const assistantMessageId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      {
        id: assistantMessageId,
        role: "ASSISTANT",
        content: "",
        createdAt: new Date().toISOString(),
        toolLogs: []
      } as any
    ]);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const response = await fetch("/api/agents/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: activeAgent.id,
          sessionId,
          message: msg,
        }),
        signal: abortController.signal,
      });

      if (!response.body) throw new Error("No response body");
      const reader = response.body.getReader();
      const decoder = new TextEncoder();
      const textDecoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const decodedChunk = textDecoder.decode(value, { stream: true });
        console.log("[ChatStream] Chunk received, length:", decodedChunk.length);
        buffer += decodedChunk;
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const update = JSON.parse(line);
            console.log("[ChatStream] Processing update:", update.type, update);
            
            if (update.type === "session_id") {
              setSessionId(update.sessionId);
            } else if (update.type === "status" && update.status) {
              const statusIdx = processingSteps.indexOf(update.status);
              if (statusIdx !== -1) setLoadingTextIndex(statusIdx);
            } else if (update.type === "delta") {
              lastTextDeltaRef.current = Date.now();
              setIsTextActive(true);
              setMessages(prev => prev.map(m =>
                m.id === assistantMessageId
                  ? { ...m, content: ((m.content as string) || "") + (update.text as string) } as any
                  : m
              ));
            } else if (update.type === "delta_clear") {
              setMessages(prev => prev.map(m =>
                m.id === assistantMessageId
                  ? { ...m, content: "" } as any
                  : m
              ));
            } else if (update.type === "tool_start") {
              setIsTextActive(false);
              if (update.tool === "browser_extract_jobs") { setScraperStartedAt(Date.now()); setScraperDone(false); }
              setMessages(prev => prev.map(m =>
                m.id === assistantMessageId
                ? { ...m, toolLogs: [...((m as any).toolLogs || []), { tool: update.tool, parameters: update.parameters, result: "Executing..." }] } as any
                : m
              ));
            } else if (update.type === "tool_end") {
              if (update.tool === "browser_extract_jobs") setScraperDone(true);
              setMessages(prev => prev.map(m => {
                if (m.id !== assistantMessageId) return m;
                const toolLogs = (m as any).toolLogs || [];
                const newLogs = toolLogs.map((l: any) =>
                  l.tool === update.tool && l.result === "Executing..."
                  ? { ...l, result: typeof update.result === "string" ? update.result : (update.result || "Action completed") }
                  : l
                );
                return { ...m, toolLogs: newLogs } as any;
              }));
            } else if (update.type === "final") {
              const payload = update.result;
              setMessages(prev => prev.map(m => 
                m.id === assistantMessageId 
                ? { 
                    ...m, 
                    content: payload.reply, 
                    toolLogs: payload.toolLogs,
                    createdAt: new Date().toISOString()
                  } as any
                : m
              ));

              if (payload.pendingJobs) setPendingJobs(payload.pendingJobs);
              
              if (payload.reply?.includes("ALL_JOBS_IMPORTED_SUCCESSFULLY")) {
                setShowImportSuccess(true);
              }
              
              const newSessionId = payload.sessionId ?? sessionId;
              if (newSessionId && newSessionId !== sessionId) {
                setSessionId(newSessionId);
                router.push(`/agents/workspace?sessionId=${newSessionId}`);
                // Refresh sessions list
                fetch(`/api/agents/sessions?agentId=${activeAgent.id}`)
                  .then(r => r.json())
                  .then(d => setSessions(d.sessions || []));
              }

              setIsTextActive(false);
              setOnboardingComplete((prev) => payload.onboardingCompleted ?? prev);
              if (payload.profileSnapshot) {
                setProfile(prev => {
                  const next = payload.profileSnapshot;
                  if (
                    prev.soulMission === next.soulMission &&
                    prev.communicationStyle === next.communicationStyle &&
                    prev.mindModel === next.mindModel &&
                    prev.memoryAnchors === next.memoryAnchors &&
                    prev.name === next.name &&
                    prev.roleTitle === next.roleTitle
                  ) return prev;
                  return next;
                });
              }
            }
          } catch (e) {
            console.warn("[Chat] Streaming parse error:", e);
          }
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setMessages(prev => prev.map(m =>
          m.id === assistantMessageId
            ? { ...m, content: m.content || "_(stopped)_" } as any
            : m
        ));
      } else {
        console.error("Failed to send message:", error);
      }
    } finally {
      abortControllerRef.current = null;
      setLoading(false);
      setIsTextActive(false);
    }
  }

  function stopGeneration() {
    abortControllerRef.current?.abort();
    // Cancel any in-progress extension extraction
    fetch("http://localhost:3001/api/browser/cancel", { method: "POST" }).catch(() => {});
  }

  async function handleImportAll() {
    if (!pendingJobs || pendingJobs.length === 0) return;
    setImportingJobs(true);
    await sendMessage("Import all previewed jobs to my pipeline");
    setImportingJobs(false);
  }

  async function handleDismissJobs() {
    setPendingJobs(null);
    const dismissMsg: ChatMessageView = {
      id: crypto.randomUUID(),
      role: "USER",
      content: "Dismiss previewed jobs",
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, dismissMsg]);
    const assistantMsg: ChatMessageView = {
      id: crypto.randomUUID(),
      role: "ASSISTANT",
      content: "No problem — previewed jobs have been dismissed. Let me know if you'd like to search again or try different criteria.",
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, assistantMsg]);
  }

  async function handleImportSingle(index: number) {
    if (!pendingJobs || !pendingJobs[index]) return;
    const job = pendingJobs[index];
    setImportingJobs(true);
    
    // Optimistic update
    const updated = [...pendingJobs];
    updated[index] = { ...updated[index], isAlreadyImported: true };
    setPendingJobs(updated);

    await sendMessage(`Save this specific job: "${job.title}" at ${job.company}, location: ${job.location}, url: ${job.url}${job.salary ? `, salary: ${job.salary}` : ""}`);
    setImportingJobs(false);
  }

  const lastSyncedLabel = syncStatus
    ? `${Math.max(0, Math.round((Date.now() - new Date(syncStatus.summary.lastSyncedAt).getTime()) / 60000))} minutes ago`
    : "Syncing...";

  const layerStatuses = syncStatus
    ? [
        { label: "Soul", healthy: Boolean(syncStatus.layers.soul.mission) },
        { label: "Identity", healthy: Boolean(syncStatus.layers.identity.name) },
        { label: "Agent", healthy: Boolean(syncStatus.layers.agent.mode) },
        { label: "History", healthy: syncStatus.layers.history.recentTurnCount >= 0 },
      ]
    : [
        { label: "Soul", healthy: false },
        { label: "Identity", healthy: false },
        { label: "Agent", healthy: false },
        { label: "History", healthy: false },
      ];

  return (
    <div className="flex h-full min-h-0 w-full gap-2 overflow-hidden xl:flex-row flex-col sm:gap-3">
      <aside className="panel flex-none xl:flex xl:flex-col xl:w-[320px] p-4 sm:p-5 custom-scrollbar scroll-well overflow-y-auto max-h-[150px] sm:max-h-[200px] xl:max-h-full xl:overflow-y-auto">
        {/* Compact mobile header, full profile on xl */}
        <div className="flex items-center gap-3 xl:block xl:pb-4 xl:border-b xl:border-white/10 dark:xl:border-white/10">
          {/* Desktop: full stacked profile */}
          <div className="hidden xl:flex xl:items-center xl:gap-3 xl:mb-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-cyan-700 text-white shadow-lg shadow-cyan-500/20 flex-shrink-0">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-500 dark:text-cyan-400">Agent Profile</p>
              <h3 className="text-xl font-extrabold leading-tight">{profile.name}</h3>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <p className="text-xs text-muted">{profile.roleTitle}</p>
              </div>
            </div>
          </div>
          {/* Mobile: compact inline */}
          <div className="flex xl:hidden items-center gap-2 w-full">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-cyan-700 text-white flex-shrink-0">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
            <h3 className="text-base font-extrabold">{profile.name}</h3>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <p className="text-xs text-muted">{profile.roleTitle}</p>
            <span className="ml-auto text-[10px] text-muted">{profile.mindModel}</span>
          </div>
        </div>

        <div className="hidden xl:block flex-none space-y-2 py-4 text-sm">
          {[
            { label: "Soul Mission", value: profile.soulMission },
            { label: "Style", value: profile.communicationStyle },
            { label: "Agent Model", value: profile.mindModel },
            { label: "Memory Anchor", value: profile.memoryAnchors },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg px-3 py-2.5 bg-white/40 dark:bg-white/5 border border-white/40 dark:border-white/10">
              <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-600 dark:text-cyan-400 block mb-0.5">{label}</span>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-snug">{value}</p>
            </div>
          ))}
        </div>

        <div className="hidden xl:block flex-none pt-4 border-t border-white/20 space-y-3">
            <div className="rounded-xl border border-white/60 dark:border-white/10 bg-white/75 dark:bg-white/5 p-3 text-xs">
              <div className="flex items-center justify-between mb-1">
                <p className="font-semibold text-slate-700 dark:text-slate-200">Tool Use</p>
                {/* Toggle switch */}
                <button
                  onClick={() => setShowToolUse(!showToolUse)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                    showToolUse ? "bg-cyan-500" : "bg-slate-300 dark:bg-slate-600"
                  }`}
                  title={showToolUse ? "Hide logs" : "Show logs"}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                    showToolUse ? "translate-x-4" : "translate-x-0.5"
                  }`} />
                </button>
              </div>
              <p className="text-[10px] text-muted leading-tight">Expose orchestrator calls &amp; tool results.</p>
              {showToolUse && (() => {
                const allLogs = messages.flatMap((m: any) => m.toolLogs || []);
                if (allLogs.length === 0) return <p className="mt-2 text-[10px] text-muted italic">No tool calls yet this session.</p>;
                return (
                  <div className="mt-2 space-y-1.5 max-h-[200px] overflow-y-auto custom-scrollbar">
                    {allLogs.map((log: any, i: number) => {
                      const isErr = typeof log.result === 'string' && (log.result.includes('Error') || log.result.includes('error') || log.result.includes('failed') || log.result.includes('"status":"error"'));
                      return (
                        <div key={i} className={`rounded p-1.5 border ${isErr
                          ? 'bg-red-50/50 dark:bg-red-900/20 border-red-200/40 dark:border-red-500/20'
                          : 'bg-emerald-50/50 dark:bg-emerald-900/20 border-emerald-200/40 dark:border-emerald-500/20'}`}>
                          <p className="font-bold text-[10px] flex items-center gap-1">
                            <span className={isErr ? 'text-red-500' : 'text-emerald-500'}>{isErr ? '✗' : '✓'}</span>
                            <span className="dark:text-slate-200">{log.tool}</span>
                          </p>
                          <p className="text-[9px] text-muted truncate">{JSON.stringify(log.parameters).slice(0, 80)}</p>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

          <div className="rounded-xl border border-white/60 dark:border-white/10 bg-white/75 dark:bg-white/5 p-3 text-xs">
            <div className="flex items-center justify-between mb-1.5">
              <p className="font-semibold text-slate-700 dark:text-slate-200">Token Usage</p>
              <span className="text-[10px] text-muted">{syncStatus?.usage.totalTokens.toLocaleString() ?? 0} / 1M</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-cyan-400 transition-all"
                style={{ width: `${Math.min(((syncStatus?.usage.totalTokens ?? 0) / 1_000_000) * 100, 100)}%` }}
              />
            </div>
            <p className="mt-1 text-[10px] text-muted">{((syncStatus?.usage.totalTokens ?? 0) / 10_000).toFixed(1)}% of monthly cap</p>
          </div>

          <div className="rounded-xl border border-white/60 dark:border-white/10 bg-white/75 dark:bg-white/5 p-3 text-xs">
            <div className="flex items-center justify-between mb-2">
              <p className="font-semibold text-slate-700 dark:text-slate-200">Memory Health</p>
              {syncStatus && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  layerStatuses.every(l => l.healthy)
                    ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                    : "bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400"
                }`}>
                  {layerStatuses.filter(l => l.healthy).length}/{layerStatuses.length}
                </span>
              )}
            </div>
            {!syncStatus ? (
              <div className="space-y-2 animate-pulse">
                <div className="h-3 w-3/4 bg-slate-200 dark:bg-white/10 rounded" />
                <div className="h-3 w-1/2 bg-slate-200 dark:bg-white/10 rounded" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-1.5">
                  {layerStatuses.map((layer) => (
                    <div key={layer.label} className={`flex items-center gap-1.5 rounded-lg px-2 py-1 ${
                      layer.healthy
                        ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        : "bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400"
                    }`}>
                      <span className="text-[10px]">{layer.healthy ? "✓" : "✗"}</span>
                      <span className="text-[10px] font-medium">{layer.label}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[10px] text-muted border-t border-white/30 dark:border-white/10 pt-2 italic">Last synced: {lastSyncedLabel}</p>
              </>
            )}
          </div>

          <ExtensionBanner />

        </div>
      </aside>

      <section className="panel flex min-h-0 flex-1 flex-col overflow-hidden p-3 pb-2 sm:p-4 sm:pb-3 md:p-5 md:pb-4 shadow-well">
        {/* Session selector + New Chat */}
        <div className="mb-2 flex flex-none items-center justify-between gap-2 border-b border-white/10 pb-2">
          <div className="flex flex-1 items-center gap-2 overflow-hidden min-w-0">
            <select
              value={sessionId || "new"}
              onChange={(e) => void switchSession(e.target.value)}
              className="field text-xs font-medium bg-white/50 dark:bg-slate-800 dark:text-slate-200 py-1.5 focus:bg-white dark:focus:bg-slate-700 min-w-0"
            >
              <option value="new">Current Conversation</option>
              {sessions?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title || "Untitled Conversation"}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => void switchSession("new")}
            className="btn-secondary whitespace-nowrap px-2.5 py-1.5 text-xs flex items-center gap-1 sm:px-3 sm:gap-1.5"
          >
            <span className="text-base leading-none font-bold">+</span>
            <span className="hidden sm:inline">New Chat</span>
            <span className="sm:hidden">New</span>
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-2 pt-2 pb-0 custom-scrollbar scroll-well shadow-well relative sm:px-4 sm:pt-4">
          <div className="flex flex-col gap-4 pb-4">
            {initialLoading ? (
              <div className="flex flex-col gap-4 animate-pulse">
                <div className="max-w-[85%] rounded-xl px-4 py-3 bg-white/60 dark:bg-white/5 border border-white/20 dark:border-white/10 w-3/4 h-24 self-start shadow-sm" />
                <div className="max-w-[85%] rounded-xl px-4 py-3 bg-cyan-600/30 w-1/2 h-16 self-end shadow-sm" />
                <div className="max-w-[85%] rounded-xl px-4 py-3 bg-white/60 dark:bg-white/5 border border-white/20 dark:border-white/10 w-2/3 h-32 self-start shadow-sm" />
              </div>
            ) : (
              messages.map((message, msgIdx) => {
                // Use __END_PREVIEW__ boundary — avoids breaking on ] inside job descriptions
                let messageJobs: JobPreview[] | null = null;
                const boundaryMatch = message.content.match(/__PREVIEW_JOBS__([\s\S]*?)__END_PREVIEW__/i);
                if (boundaryMatch) {
                  try {
                    messageJobs = JSON.parse(boundaryMatch[1].trim()) as JobPreview[];
                    // Merge persisted import state so cards show "Imported" after Import All
                    if (importedJobUrls.size > 0) {
                      messageJobs = messageJobs.map(j => j.url && importedJobUrls.has(j.url) ? { ...j, isAlreadyImported: true } : j);
                    }
                  } catch {
                    // Non-fatal: old messages may have malformed preview JSON — skip gracefully
                  }
                }

                return (
                  <ChatMessageItem
                    key={message.id}
                    message={message}
                    showToolUse={showToolUse}
                    previewJobs={messageJobs}
                    onImportAll={() => handleImportAllInMessage(messageJobs!)}
                    onImportSingle={(idx) => handleImportSingleInMessage(messageJobs![idx])}
                    onDismiss={handleDismissJobs}
                    importing={importingJobs}
                    scraperStartedAt={msgIdx === messages.length - 1 ? scraperStartedAt : null}
                    scraperDone={msgIdx === messages.length - 1 ? scraperDone : false}
                    onScraperHide={() => { setScraperStartedAt(null); setScraperDone(false); }}
                    isStreaming={loading && isTextActive && msgIdx === messages.length - 1 && message.role === "ASSISTANT"}
                  />
                );
              })
            )}
          </div>
          <div id="chat-bottom" className="h-px w-full opacity-0" ref={chatBottomRef} />
        </div>

        <div className="mt-2 flex-none rounded-2xl border border-white/60 dark:border-white/10 bg-white/80 dark:bg-white/5 shadow-sm transition-all duration-300 focus-within:ring-2 focus-within:ring-cyan-500/30 focus-within:border-cyan-400/40">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              if (!file) return;
              const err = validateCvFile(file);
              if (err) { setAttachError(err); return; }
              setAttachError(null);
              setPendingUploadFile(file);
              e.target.value = "";
            }}
          />

          <div className="flex items-end gap-2 p-2 sm:p-3">
            {/* Paperclip attach button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading || uploading}
              title="Attach CV or resume"
              className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-slate-400 dark:text-slate-500 hover:text-cyan-500 dark:hover:text-cyan-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors disabled:opacity-40"
            >
              <Paperclip className="h-4 w-4" />
            </button>

            <textarea
              autoFocus
              rows={1}
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                // Auto-resize: grow to content, max 3 lines (~72px)
                const el = event.target;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 72)}px`;
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !loading && (input.trim() || attachedFile)) {
                  event.preventDefault();
                  void sendMessage();
                  // Reset height after send
                  const el = event.target as HTMLTextAreaElement;
                  setTimeout(() => { el.style.height = "auto"; }, 0);
                }
              }}
              placeholder="Message Atlas…"
              className="field flex-1 bg-transparent border-none shadow-none focus:ring-0 min-h-[36px] max-h-[72px] resize-none overflow-y-auto placeholder:text-slate-400 dark:placeholder:text-slate-500 leading-6"
            />
            {loading ? (
              <button
                onClick={stopGeneration}
                className="flex h-9 w-9 flex-none items-center justify-center rounded-full border-2 border-cyan-600 bg-white dark:bg-slate-800 text-cyan-600 transition-colors hover:bg-cyan-50 dark:hover:bg-slate-700"
                title="Stop generation"
              >
                <span className="h-3.5 w-3.5 rounded-sm bg-cyan-600 block" />
              </button>
            ) : (
              <button
                onClick={() => void sendMessage()}
                disabled={(!input.trim() && !attachedFile) || uploading}
                className="btn-primary flex-none rounded-full disabled:opacity-40 transition-all"
              >
                Send
              </button>
            )}
          </div>

          {/* Confirmation chip — shown after file is selected, before user approves */}
          {pendingUploadFile && !attachedFile && (
            <div className="flex items-center gap-2 px-3 pb-3 flex-wrap">
              <div className="flex items-center gap-1.5 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 px-3 py-1.5 text-xs text-amber-800 dark:text-amber-300 flex-1 min-w-0">
                <FileText className="h-3.5 w-3.5 flex-none text-amber-500" />
                <span className="truncate font-medium">{pendingUploadFile.name}</span>
                <span className="text-amber-500 flex-none ml-1">({(pendingUploadFile.size / 1024).toFixed(0)} KB)</span>
                <span className="text-amber-600 dark:text-amber-400 ml-1.5 hidden sm:inline">— will be saved to your CV library</span>
              </div>
              <div className="flex gap-1.5 flex-none">
                <button
                  type="button"
                  onClick={() => { setAttachedFile(pendingUploadFile); setPendingUploadFile(null); }}
                  className="rounded-lg bg-cyan-500 hover:bg-cyan-600 active:scale-95 text-white px-3 py-1.5 text-xs font-semibold transition-all"
                >
                  Save &amp; Analyse
                </button>
                <button
                  type="button"
                  onClick={() => { setPendingUploadFile(null); setAttachError(null); }}
                  className="rounded-lg bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/15 active:scale-95 text-slate-600 dark:text-slate-300 px-3 py-1.5 text-xs font-semibold transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Confirmed file chip — shown after user clicks Save & Analyse */}
          {attachedFile && (
            <div className="flex items-center gap-2 px-3 pb-3">
              <div className="flex items-center gap-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-1 text-xs text-cyan-700 dark:text-cyan-300 max-w-[280px]">
                {/\.(jpg|jpeg|png|webp)$/i.test(attachedFile.name)
                  ? <FileImage className="h-3 w-3 flex-none" />
                  : <FileText className="h-3 w-3 flex-none" />}
                <span className="truncate">{attachedFile.name}</span>
                <span className="text-slate-400 dark:text-slate-500 flex-none text-[10px] ml-1">
                  {(attachedFile.size / 1024).toFixed(0)} KB
                </span>
                <button
                  type="button"
                  onClick={() => { setAttachedFile(null); setAttachError(null); }}
                  className="flex-none ml-0.5 text-slate-400 hover:text-red-500 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
              {uploading && (
                <span className="text-[10px] text-slate-400 dark:text-slate-500 animate-pulse">Uploading…</span>
              )}
            </div>
          )}

          {/* Inline validation / upload error */}
          {attachError && (
            <p className="px-3 pb-3 text-[11px] text-red-500 dark:text-red-400">{attachError}</p>
          )}

          <div className="flex items-center gap-2 px-3 pb-2 text-[10px] text-slate-400 dark:text-slate-600">
            <span>Enter to send</span>
            <span>·</span>
            <span>Shift+Enter for newline</span>
            {input.length > 0 && <span className="ml-auto">{input.length}</span>}
          </div>
        </div>
      </section>

    </div>
  );
}
