import * as React from "react";
import { createPortal } from "react-dom";
import type { JobRow } from "@/types/domain";
import { Mail, Clock, Send, X, ExternalLink, Unplug, FileText, Award, BadgeDollarSign, RefreshCw } from "lucide-react";

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

  return createPortal(
    <div className="fixed inset-0 z-[9999] overflow-y-auto bg-white dark:bg-slate-900">
      <div className="w-full min-h-screen flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6 p-6 pb-4 border-b border-slate-200 dark:border-white/10 sticky top-0 bg-white dark:bg-slate-900 z-10">
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

        {/* Meta cards */}
        <div className="grid grid-cols-1 gap-3 text-sm mb-8 sm:grid-cols-3 sm:gap-4 px-6">
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

        {/* Job Details */}
        <div className="space-y-6 mb-10 px-6 max-w-5xl w-full mx-auto">
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

          <div>
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
            <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 p-5 text-sm leading-relaxed text-slate-700 dark:text-slate-200 shadow-inner whitespace-pre-wrap">
              {job.description || "No description available for this role."}
            </div>
          </div>
        </div>

        {/* Emails */}
        <h4 className="font-extrabold text-lg flex items-center gap-2 mb-3 px-6 text-slate-900 dark:text-white">
          <Mail className="h-5 w-5 text-accent" />
          Related Emails &amp; Timeline
        </h4>

        {isLoading ? (
          <div className="animate-pulse space-y-3 px-6">
            <div className="h-20 bg-slate-200/50 dark:bg-white/5 rounded-lg w-full" />
            <div className="h-20 bg-slate-200/50 dark:bg-white/5 rounded-lg w-full" />
          </div>
        ) : threads.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 dark:border-white/10 bg-slate-50/40 dark:bg-white/5 p-6 text-center text-muted text-sm mx-6">
            No related recruiter emails found for this job. Sync your Gmail or attach threads manually.
          </div>
        ) : (
          <div className="space-y-4 px-6">
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

        {/* Footer CTA */}
        <div className="mt-auto pt-6 space-y-3 px-6 pb-6">
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
    </div>,
    document.body
  );
}
