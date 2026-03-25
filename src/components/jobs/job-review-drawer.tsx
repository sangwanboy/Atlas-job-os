import * as React from "react";
import type { JobRow } from "@/types/domain";
import { Mail, Clock, Send, X, ExternalLink, Unplug, FileText, Award, BadgeDollarSign } from "lucide-react";

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

export function JobReviewDrawer({ job, onClose }: JobReviewDrawerProps) {
  const [threads, setThreads] = React.useState<EmailThread[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

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

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="h-full w-full max-w-2xl overflow-y-auto bg-white/95 p-6 shadow-2xl backdrop-blur-xl border-l border-white/60 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-6 sticky top-0 bg-white/95 p-2 -mx-2 backdrop-blur-xl rounded-b-xl z-10 border-b border-white/60">
          <div>
            <h3 className="text-xl font-extrabold">{job.title}</h3>
            <p className="text-sm text-muted mt-1 font-medium">{job.company}</p>
          </div>
          <button onClick={onClose} className="rounded-full bg-slate-200/50 p-2 hover:bg-slate-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm mb-8">
          <div className="rounded-xl border border-white/60 bg-white/80 p-4">
            <p className="font-semibold mb-1">Status & Score</p>
            <div className="text-muted flex justify-between items-baseline">
              <span className="badge bg-slate-100">{job.status}</span>
              <span className="font-bold text-accent text-lg">{job.score}</span>
            </div>
          </div>
          <div className="rounded-xl border border-white/60 bg-white/80 p-4">
            <p className="font-semibold mb-1">Location & Salary</p>
            <p className="text-muted">{job.location} · {job.workMode}</p>
            <p className="text-accent font-medium mt-1 flex items-center gap-1">
              <BadgeDollarSign className="w-3.5 h-3.5" />
              {job.salaryRange}
            </p>
          </div>
        </div>

        {/* --- Job Details Section --- */}
        <div className="space-y-6 mb-10">
          <div>
            <h4 className="font-extrabold text-lg flex items-center gap-2 mb-3">
              <Award className="h-5 w-5 text-accent" />
              Required Skills
            </h4>
            {job.skills && job.skills.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {job.skills.map((skill, idx) => (
                  <span key={idx} className="bg-slate-100 px-3 py-1 rounded-full text-xs font-semibold text-slate-700 border border-slate-200">
                    {skill}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted italic">No specific skills extracted yet.</p>
            )}
          </div>

          <div>
            <h4 className="font-extrabold text-lg flex items-center gap-2 mb-3">
              <FileText className="h-5 w-5 text-accent" />
              Job Description
            </h4>
            <div className="rounded-xl border border-white/60 bg-white/80 p-5 text-sm leading-relaxed text-slate-700 max-h-[400px] overflow-y-auto shadow-inner whitespace-pre-wrap">
              {job.description || "No description available for this role."}
            </div>
          </div>
        </div>

        <h4 className="font-extrabold text-lg flex items-center gap-2 mb-3">
          <Mail className="h-5 w-5 text-accent" />
          Related Emails & Timeline
        </h4>

        {isLoading ? (
          <div className="animate-pulse space-y-3">
            <div className="h-20 bg-slate-200/50 rounded-lg w-full" />
            <div className="h-20 bg-slate-200/50 rounded-lg w-full" />
          </div>
        ) : threads.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white/40 p-6 text-center text-muted text-sm">
            No related recruiter emails found for this job. Sync your Gmail or attach threads manually.
          </div>
        ) : (
          <div className="space-y-4">
            {threads.map((thread) => (
              <div key={thread.id} className="rounded-xl border border-white/60 bg-white/80 p-4 shadow-sm relative group overflow-hidden">
                <div className="flex justify-between items-start gap-3">
                  <h5 className="font-bold text-sm leading-tight text-slate-800">{thread.subject || "No Subject"}</h5>
                  <div className="flex gap-2 text-xs">
                    <span className="flex items-center gap-1 bg-accent/10 px-2 py-1 rounded text-accent whitespace-nowrap">
                      <Clock className="w-3 h-3" />
                      {thread.lastMessageAt ? new Date(thread.lastMessageAt).toLocaleDateString() : ""}
                    </span>
                  </div>
                </div>
                
                <p className="text-xs text-muted mt-2 line-clamp-2">{thread.snippet}</p>
                
                <div className="mt-4 pt-4 border-t border-slate-200/50 flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-600">{thread.messageCount} messages in thread</span>
                  
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                     <button className="flex items-center gap-1 hover:text-danger text-muted transition-colors px-2 py-1">
                        <Unplug className="w-3 h-3" /> Detach
                     </button>
                     <button className="flex items-center gap-1 text-white bg-accent px-3 py-1 rounded shadow-sm hover:bg-accent/90 transition-colors">
                        <Send className="w-3 h-3" /> Gen Reply
                     </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-auto pt-6 space-y-3">
          {job.sourceUrl && (
            <a
              href={job.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary w-full text-center flex items-center justify-center gap-2"
            >
              View Original Listing <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
