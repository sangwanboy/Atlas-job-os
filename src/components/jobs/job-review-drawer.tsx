import * as React from "react";
import { createPortal } from "react-dom";
import type { JobRow } from "@/types/domain";
import { Mail, Clock, Send, X, ExternalLink, Unplug, FileText, Award, BadgeDollarSign, RefreshCw, Paperclip, Search } from "lucide-react";

type EmailMessage = {
  id: string;
  sender: string | null;
  subject: string | null;
  bodyText: string | null;
  receivedAt: string | null;
};

type EmailThread = {
  id: string;
  subject: string | null;
  snippet: string | null;
  lastMessageAt: string | null;
  messageCount: number;
  messages: EmailMessage[];
};

type JobReviewDrawerProps = {
  job: JobRow;
  onClose: () => void;
};

export function JobReviewDrawer({ job: initialJob, onClose }: JobReviewDrawerProps) {
  const [job, setJob] = React.useState<JobRow>(initialJob);
  const [threads, setThreads] = React.useState<EmailThread[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isFetching, setIsFetching] = React.useState(false);
  const [fetchError, setFetchError] = React.useState<string | null>(null);
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => { setMounted(true); }, []);

  // Attach thread state
  const [showAttachModal, setShowAttachModal] = React.useState(false);
  const [allThreads, setAllThreads] = React.useState<EmailThread[]>([]);
  const [attachSearch, setAttachSearch] = React.useState("");
  const [attachLoading, setAttachLoading] = React.useState(false);
  const [attaching, setAttaching] = React.useState<string | null>(null);

  async function openAttachModal() {
    setShowAttachModal(true);
    setAttachLoading(true);
    try {
      const res = await fetch("/api/jobs/emails");
      if (res.ok) {
        const data = await res.json();
        setAllThreads(data.threads || []);
      }
    } catch { /* ignore */ } finally {
      setAttachLoading(false);
    }
  }

  async function attachThread(externalId: string) {
    setAttaching(externalId);
    try {
      const res = await fetch("/api/jobs/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id, threadId: externalId }),
      });
      if (res.ok) {
        // Reload threads
        const emailsRes = await fetch(`/api/jobs/${job.id}/emails`);
        if (emailsRes.ok) setThreads((await emailsRes.json()).threads || []);
        setShowAttachModal(false);
      }
    } catch { /* ignore */ } finally {
      setAttaching(null);
    }
  }

  async function handleRefetch() {
    setIsFetching(true);
    setFetchError(null);
    try {
      const res = await fetch(`/api/jobs/${job.id}/refetch`, { method: "POST" });
      const data = await res.json() as { success?: boolean; job?: { descriptionRaw?: string; descriptionClean?: string; requiredSkills?: string[] }; error?: string };
      if (!res.ok || !data.success) {
        setFetchError(data.error ?? "Failed to fetch details");
      } else {
        setJob((prev) => ({
          ...prev,
          description: data.job?.descriptionClean ?? data.job?.descriptionRaw ?? prev.description,
          skills: data.job?.requiredSkills ?? prev.skills,
        }));
      }
    } catch {
      setFetchError("Browser server unreachable. Make sure it is running.");
    } finally {
      setIsFetching(false);
    }
  }

  React.useEffect(() => {
    async function loadEmails() {
      try {
        const res = await fetch(`/api/jobs/${job.id}/emails`);
        if (res.ok) {
          const payload = await res.json();
          setThreads(payload.threads || []);
        }
      } catch (err) {
        console.error("Failed to fetch emails for job", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadEmails();
  }, [job.id]);

  if (!mounted) return null;

  const portal = createPortal(
    <div className="fixed inset-0 z-[9999] flex justify-end" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" />

      {/* Drawer panel */}
      <div
        className="relative z-10 w-full max-w-2xl h-full bg-white dark:bg-slate-900 flex flex-col shadow-2xl border-l border-slate-200 dark:border-white/10 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 p-6 pb-4 border-b border-slate-200 dark:border-white/10 shrink-0">
          <div>
            <h3 className="text-xl font-extrabold text-slate-900 dark:text-white">{job.title}</h3>
            <p className="text-sm text-muted mt-1 font-medium">{job.company}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full bg-slate-100 dark:bg-white/10 p-2 hover:bg-slate-200 dark:hover:bg-white/20 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5 text-slate-600 dark:text-slate-300" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
          {/* Meta cards */}
          <div className="grid grid-cols-2 gap-3 text-sm p-6 pb-0">
            <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 p-4">
              <p className="font-semibold mb-1 text-slate-700 dark:text-slate-300">Status &amp; Score</p>
              <div className="flex justify-between items-baseline">
                <span className="badge bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10">
                  {job.status}
                </span>
                <span className="font-bold text-accent text-lg">{job.score}</span>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 p-4">
              <p className="font-semibold mb-1 text-slate-700 dark:text-slate-300">Location &amp; Salary</p>
              <p className="text-muted">{job.location} · {job.workMode}</p>
              <p className="text-accent font-medium mt-1 flex items-center gap-1">
                <BadgeDollarSign className="w-3.5 h-3.5" />
                {job.salaryRange}
              </p>
            </div>
          </div>

          {/* Job Details — flex-1 when emails empty so description fills the space */}
          <div className={`space-y-6 p-6 ${!isLoading && threads.length === 0 ? "flex-1" : ""}`}>
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-extrabold text-lg flex items-center gap-2 text-slate-900 dark:text-white">
                  <Award className="h-5 w-5 text-accent" />
                  Required Skills
                </h4>
                {(!job.skills || job.skills.length === 0) && job.sourceUrl && (
                  <button
                    onClick={handleRefetch}
                    disabled={isFetching}
                    className="flex items-center gap-1.5 rounded-lg border border-cyan-200 dark:border-cyan-500/30 bg-cyan-50 dark:bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-700 dark:text-cyan-300 hover:bg-cyan-100 dark:hover:bg-cyan-500/20 disabled:opacity-50 transition-colors"
                  >
                    <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
                    {isFetching ? "Fetching…" : "Re-fetch Details"}
                  </button>
                )}
              </div>
              {job.skills && job.skills.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {job.skills.map((skill, idx) => (
                    <span
                      key={idx}
                      className="bg-slate-100 dark:bg-white/10 px-3 py-1 rounded-full text-xs font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted italic">No specific skills extracted yet.</p>
              )}
            </div>

            <div className={!isLoading && threads.length === 0 ? "flex flex-col flex-1" : ""}>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-extrabold text-lg flex items-center gap-2 text-slate-900 dark:text-white">
                  <FileText className="h-5 w-5 text-accent" />
                  Job Description
                </h4>
                {!job.description && job.sourceUrl && (
                  <button
                    onClick={handleRefetch}
                    disabled={isFetching}
                    className="flex items-center gap-1.5 rounded-lg border border-cyan-200 dark:border-cyan-500/30 bg-cyan-50 dark:bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-700 dark:text-cyan-300 hover:bg-cyan-100 dark:hover:bg-cyan-500/20 disabled:opacity-50 transition-colors"
                  >
                    <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
                    {isFetching ? "Fetching…" : "Re-fetch Details"}
                  </button>
                )}
              </div>
              {fetchError && (
                <p className="mb-3 rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">{fetchError}</p>
              )}
              <div className={`rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 p-5 text-sm leading-relaxed text-slate-700 dark:text-slate-200 shadow-inner whitespace-pre-wrap ${!isLoading && threads.length === 0 ? "flex-1 overflow-y-auto" : ""}`}>
                {job.description || "No description available for this role."}
              </div>
            </div>
          </div>

          {/* Emails */}
          {(!isLoading || threads.length > 0) && (
            <div className="px-6 pb-2">
              <h4 className="font-extrabold text-lg flex items-center gap-2 mb-3 text-slate-900 dark:text-white">
                <Mail className="h-5 w-5 text-accent" />
                Related Emails &amp; Timeline
              </h4>

              {isLoading ? (
                <div className="animate-pulse space-y-3">
                  <div className="h-20 bg-slate-200/50 dark:bg-white/5 rounded-lg w-full" />
                  <div className="h-20 bg-slate-200/50 dark:bg-white/5 rounded-lg w-full" />
                </div>
              ) : threads.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 dark:border-white/10 bg-slate-50/40 dark:bg-white/5 p-4 text-center text-muted text-sm flex flex-col items-center gap-3">
                  <p>No related recruiter emails found for this job.</p>
                  <button
                    onClick={openAttachModal}
                    className="flex items-center gap-2 rounded-xl border border-accent/40 bg-accent/10 px-4 py-2 text-xs font-semibold text-accent hover:bg-accent/20 transition-colors"
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                    Attach Email Thread
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {threads.map((thread) => (
                    <div
                      key={thread.id}
                      className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 p-4 shadow-sm relative group overflow-hidden hover:border-accent/40 transition-colors"
                    >
                      <div className="flex justify-between items-start gap-3">
                        <h5 className="font-bold text-sm leading-tight text-slate-800 dark:text-slate-100">
                          {thread.subject || "No Subject"}
                        </h5>
                        <div className="flex gap-2 text-xs">
                          <span className="flex items-center gap-1 bg-accent/10 px-2 py-1 rounded text-accent whitespace-nowrap">
                            <Clock className="w-3 h-3" />
                            {thread.lastMessageAt ? new Date(thread.lastMessageAt).toLocaleDateString() : ""}
                          </span>
                        </div>
                      </div>

                      <p className="text-xs text-muted mt-2 line-clamp-2">{thread.snippet}</p>

                      <div className="mt-4 pt-4 border-t border-slate-200 dark:border-white/10 flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-600 dark:text-slate-400">
                          {thread.messageCount} messages in thread
                        </span>
                        <div className="flex gap-2 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                          <button className="flex items-center gap-1 hover:text-danger text-muted transition-colors px-2 py-1 cursor-pointer">
                            <Unplug className="w-3 h-3" /> Detach
                          </button>
                          <button className="flex items-center gap-1 text-white bg-accent px-3 py-1 rounded shadow-sm hover:bg-accent/90 transition-colors cursor-pointer">
                            <Send className="w-3 h-3" /> Gen Reply
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Footer CTA */}
          <div className="mt-auto pt-4 px-6 pb-6 shrink-0">
            <a
              href={job.sourceUrl || `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(`${job.title} ${job.company}`)}&location=${encodeURIComponent(job.location || '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary w-full text-center flex items-center justify-center gap-2"
            >
              {job.sourceUrl ? "View Original Listing" : "Search on LinkedIn"} <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );

  function renderAttachModal() {
    if (!showAttachModal) return null;
    const filtered = allThreads.filter(t =>
      !attachSearch.trim() ||
      t.subject?.toLowerCase().includes(attachSearch.toLowerCase()) ||
      t.snippet?.toLowerCase().includes(attachSearch.toLowerCase())
    );
    return createPortal(
      <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4" onClick={() => setShowAttachModal(false)}>
        <div className="w-full max-w-lg rounded-2xl border border-white/60 dark:border-white/10 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-white/10">
            <h3 className="font-extrabold text-base flex items-center gap-2">
              <Paperclip className="h-4 w-4 text-accent" />
              Attach Email Thread
            </h3>
            <button onClick={() => setShowAttachModal(false)} className="rounded-full bg-slate-100 dark:bg-white/10 p-1.5 hover:bg-slate-200 dark:hover:bg-white/20 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-4 border-b border-slate-200 dark:border-white/10">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted" />
              <input
                autoFocus
                type="text"
                placeholder="Search threads by subject…"
                value={attachSearch}
                onChange={e => setAttachSearch(e.target.value)}
                className="field pl-8 text-sm"
              />
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {attachLoading ? (
              <div className="p-6 text-center text-sm text-muted">Loading threads…</div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted">No threads found. Sync Gmail in Settings first.</div>
            ) : (
              filtered.map(t => (
                <div key={t.id} className="flex items-start justify-between gap-3 p-3 border-b border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{t.subject || "(No Subject)"}</p>
                    <p className="text-xs text-muted truncate mt-0.5">{t.snippet}</p>
                  </div>
                  <button
                    onClick={() => attachThread((t as any).externalId ?? t.id)}
                    disabled={attaching === ((t as any).externalId ?? t.id)}
                    className="shrink-0 flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent/90 disabled:opacity-50 transition-colors"
                  >
                    {attaching === ((t as any).externalId ?? t.id) ? "Attaching…" : "Attach"}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>,
      document.body
    );
  }

  return (
    <>
      {portal}
      {renderAttachModal()}
    </>
  );
}
