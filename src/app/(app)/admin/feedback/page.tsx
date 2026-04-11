"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { MessageSquare, RefreshCw } from "lucide-react";

type FeedbackEntry = {
  id?: string;
  type: "bug" | "suggestion" | "other";
  description: string;
  email?: string;
  page?: string;
  createdAt: string;
};

function timeAgo(iso: string) {
  const ts = new Date(iso).getTime();
  if (!iso || isNaN(ts)) return "Unknown";
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const TYPE_FILTERS = [
  { key: "all", label: "All" },
  { key: "bug", label: "Bug 🐛" },
  { key: "suggestion", label: "Suggestion 💡" },
  { key: "other", label: "Other 💬" },
] as const;

type FilterKey = (typeof TYPE_FILTERS)[number]["key"];

function typeBadgeClass(type: string) {
  if (type === "bug")
    return "bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-400 ring-1 ring-red-200 dark:ring-red-500/30";
  if (type === "suggestion")
    return "bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 ring-1 ring-indigo-200 dark:ring-indigo-500/30";
  return "bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-400 ring-1 ring-slate-200 dark:ring-white/10";
}

function typeLabel(type: string) {
  if (type === "bug") return "Bug";
  if (type === "suggestion") return "Suggestion";
  return "Other";
}

export default function AdminFeedbackPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [entries, setEntries] = useState<FeedbackEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterType, setFilterType] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");

  const isAdmin = session?.user?.role === "ADMIN";

  const fetchFeedback = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    try {
      const res = await fetch("/api/admin/feedback");
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || []);
        setTotal(data.total ?? 0);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user || session.user.role !== "ADMIN") {
      router.push("/dashboard");
      return;
    }
    void fetchFeedback();
  }, [session, status, router, fetchFeedback]);

  if (status === "loading" || loading) {
    return (
      <div className="flex h-full flex-col overflow-hidden px-3 pt-4 sm:px-4 md:px-6">
        <section className="flex flex-none flex-wrap items-center justify-between gap-3 pb-4 sm:pb-6">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-extrabold tracking-tight sm:text-2xl">
              <MessageSquare className="h-6 w-6 text-cyan-600" />
              Beta Feedback
            </h2>
          </div>
        </section>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="panel animate-pulse p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-5 w-20 rounded-full bg-slate-200 dark:bg-white/10" />
                <div className="h-4 w-16 rounded bg-slate-200 dark:bg-white/10" />
                <div className="h-4 w-32 rounded bg-slate-200 dark:bg-white/10 ml-auto" />
              </div>
              <div className="h-4 w-full rounded bg-slate-200 dark:bg-white/10 mb-2" />
              <div className="h-4 w-3/4 rounded bg-slate-200 dark:bg-white/10" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!isAdmin) return null;

  const filtered = entries.filter((e) => {
    if (filterType !== "all" && e.type !== filterType) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        e.description?.toLowerCase().includes(q) ||
        e.email?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="flex h-full flex-col overflow-hidden px-3 pt-4 sm:px-4 md:px-6">
      {/* Header */}
      <section className="flex flex-none flex-wrap items-center justify-between gap-3 pb-4 sm:pb-6">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-extrabold tracking-tight sm:text-2xl">
            <MessageSquare className="h-6 w-6 text-cyan-600" />
            Beta Feedback
            <span className="ml-1 rounded-full bg-cyan-100 dark:bg-cyan-500/20 px-2 py-0.5 text-xs font-bold text-cyan-700 dark:text-cyan-300">
              {total}
            </span>
          </h2>
          <p className="mt-1 hidden text-sm text-muted sm:block">
            User-submitted bug reports, suggestions, and general feedback.
          </p>
        </div>
        <button
          onClick={() => void fetchFeedback(true)}
          disabled={refreshing}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-slate-400 transition hover:bg-white/10 hover:text-slate-200 disabled:opacity-40"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </section>

      {/* Filters + Search */}
      <div className="flex flex-none flex-wrap items-center gap-2 pb-4">
        <div className="flex items-center gap-1 rounded-xl border border-white/60 bg-white/60 dark:bg-white/5 p-1">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilterType(f.key)}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                filterType === f.key
                  ? "bg-cyan-500 text-white shadow-sm"
                  : "text-muted hover:text-text"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search by description or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="field min-w-[200px] flex-1 text-sm"
        />
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto min-h-0 pb-6">
        {filtered.length === 0 ? (
          <div className="panel flex flex-col items-center justify-center gap-3 p-12 text-center">
            <MessageSquare className="h-10 w-10 text-slate-300 dark:text-white/20" />
            <p className="text-sm text-muted">No feedback yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((entry, idx) => (
              <div key={entry.id ?? idx} className="panel flex flex-col gap-3 p-4">
                {/* Header */}
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${typeBadgeClass(entry.type)}`}
                  >
                    {typeLabel(entry.type)}
                  </span>
                  <span className="text-xs text-muted">{timeAgo(entry.createdAt)}</span>
                  {entry.email && (
                    <span className="ml-auto text-xs text-muted truncate max-w-[200px]">
                      {entry.email}
                    </span>
                  )}
                </div>
                {/* Body */}
                <p className="text-sm text-text leading-relaxed whitespace-pre-wrap">
                  {entry.description}
                </p>
                {/* Footer */}
                {entry.page && (
                  <p className="text-[11px] font-mono text-muted border-t border-white/40 pt-2">
                    {entry.page}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
