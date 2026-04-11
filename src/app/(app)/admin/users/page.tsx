"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Shield,
  ShieldOff,
  Trash2,
  UserPlus,
  KeyRound,
  Users,
  X,
  MessageSquare,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Coins,
  Save,
} from "lucide-react";
import type { UserUsageSummary } from "@/lib/services/agent/token-budget-manager";

type UserEntry = {
  id: string;
  email: string;
  name: string;
  role: "USER" | "ADMIN";
  status: "ACTIVE" | "PENDING" | "SUSPENDED";
  createdAt: string;
};

type FeedbackEntry = {
  id?: string;
  type: "bug" | "suggestion" | "other";
  description: string;
  userEmail?: string;
  page?: string;
  timestamp: string;
};

const FEEDBACK_TYPE_FILTERS = [
  { key: "all", label: "All" },
  { key: "bug", label: "Bug 🐛" },
  { key: "suggestion", label: "Suggestion 💡" },
  { key: "other", label: "Other 💬" },
] as const;

type FeedbackFilterKey = (typeof FEEDBACK_TYPE_FILTERS)[number]["key"];

function typeBadgeClass(type: string) {
  if (type === "bug") return "bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-400 ring-1 ring-red-200 dark:ring-red-500/30";
  if (type === "suggestion") return "bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 ring-1 ring-indigo-200 dark:ring-indigo-500/30";
  return "bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-400 ring-1 ring-slate-200 dark:ring-white/10";
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function AdminUsersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"users" | "feedback" | "tokens">("users");

  // Users state
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [resetTarget, setResetTarget] = useState<UserEntry | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [pushing, setPushing] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", email: "", password: "", role: "USER" as "USER" | "ADMIN" });

  // Feedback state
  const [feedbackEntries, setFeedbackEntries] = useState<FeedbackEntry[]>([]);
  const [feedbackTotal, setFeedbackTotal] = useState(0);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackRefreshing, setFeedbackRefreshing] = useState(false);
  const [feedbackFilter, setFeedbackFilter] = useState<FeedbackFilterKey>("all");
  const [feedbackSearch, setFeedbackSearch] = useState("");

  // Token usage state
  const [tokenUsers, setTokenUsers] = useState<UserUsageSummary[]>([]);
  const [tokenTotals, setTokenTotals] = useState({ inputTokens: 0, outputTokens: 0, costUsd: 0 });
  const [globalLimit, setGlobalLimit] = useState(10);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [tokenRefreshing, setTokenRefreshing] = useState(false);
  const [editingLimit, setEditingLimit] = useState<string | null>(null);
  const [editLimitValue, setEditLimitValue] = useState("");
  const [savingLimit, setSavingLimit] = useState(false);

  const isAdmin = session?.user?.role === "ADMIN";

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  const fetchFeedback = useCallback(async (showSpinner = false) => {
    if (showSpinner) setFeedbackRefreshing(true);
    else setFeedbackLoading(true);
    try {
      const res = await fetch("/api/admin/feedback");
      if (res.ok) {
        const data = await res.json();
        setFeedbackEntries(data.entries || []);
        setFeedbackTotal(data.total ?? 0);
      }
    } catch { /* ignore */ } finally {
      setFeedbackLoading(false);
      setFeedbackRefreshing(false);
    }
  }, []);

  const fetchTokenUsage = useCallback(async (showSpinner = false) => {
    if (showSpinner) setTokenRefreshing(true);
    else setTokenLoading(true);
    try {
      const res = await fetch("/api/admin/token-usage");
      if (res.ok) {
        const data = await res.json();
        setTokenUsers(data.users ?? []);
        setTokenTotals(data.totals ?? { inputTokens: 0, outputTokens: 0, costUsd: 0 });
        setGlobalLimit(data.globalLimit ?? 10);
      }
    } catch { /* ignore */ } finally {
      setTokenLoading(false);
      setTokenRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "tokens" && tokenUsers.length === 0 && !tokenLoading) {
      void fetchTokenUsage();
    }
  }, [activeTab, tokenUsers.length, tokenLoading, fetchTokenUsage]);

  const handleSetLimit = async (userId: string) => {
    const val = parseFloat(editLimitValue);
    if (isNaN(val) || val <= 0) return;
    setSavingLimit(true);
    try {
      const res = await fetch("/api/admin/user-limit", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, monthlyBudgetUsd: val }),
      });
      if (res.ok) {
        showToast("User limit updated", "success");
        setEditingLimit(null);
        setEditLimitValue("");
        await fetchTokenUsage(true);
      } else {
        showToast("Failed to update limit", "error");
      }
    } catch {
      showToast("Network error", "error");
    } finally {
      setSavingLimit(false);
    }
  };

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user || session.user.role !== "ADMIN") {
      router.push("/dashboard");
      return;
    }
    fetchUsers();
  }, [session, status, router, fetchUsers]);

  useEffect(() => {
    if (activeTab === "feedback" && feedbackEntries.length === 0 && !feedbackLoading) {
      void fetchFeedback();
    }
  }, [activeTab, feedbackEntries.length, feedbackLoading, fetchFeedback]);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleAction = async (action: string, data: Record<string, unknown>) => {
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...data }),
      });
      const result = await res.json();
      if (!res.ok) { showToast(result.error || "Action failed", "error"); return false; }
      showToast(
        action === "create" ? "User created"
        : action === "delete" ? "User deleted"
        : action === "updateRole" ? "Role updated"
        : "Password reset",
        "success"
      );
      await fetchUsers();
      return true;
    } catch {
      showToast("Something went wrong", "error");
      return false;
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await handleAction("create", createForm);
    if (ok) { setShowCreateModal(false); setCreateForm({ name: "", email: "", password: "", role: "USER" }); }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget || !newPassword) return;
    const ok = await handleAction("resetPassword", { userId: resetTarget.id, newPassword });
    if (ok) { setResetTarget(null); setNewPassword(""); }
  };

  if (status === "loading" || loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500/30 border-t-cyan-500" />
      </div>
    );
  }

  if (!isAdmin) return null;

  const filteredFeedback = feedbackEntries.filter((e) => {
    if (feedbackFilter !== "all" && e.type !== feedbackFilter) return false;
    if (feedbackSearch.trim()) {
      const q = feedbackSearch.toLowerCase();
      return e.description?.toLowerCase().includes(q) || e.userEmail?.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="flex h-full flex-col overflow-hidden px-3 pt-4 sm:px-4 md:px-6">
      {/* Header */}
      <section className="flex flex-none flex-wrap items-center justify-between gap-3 pb-4 sm:pb-5">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-extrabold tracking-tight sm:text-2xl">
            <Users className="h-6 w-6 text-cyan-600" />
            Admin
          </h2>
          <p className="mt-1 hidden text-sm text-muted sm:block">
            Manage users, review feedback, and monitor token usage.
          </p>
        </div>
        {activeTab === "users" && (
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                setPushing(true);
                try {
                  const res = await fetch("/api/admin/push-atlas-config", { method: "POST" });
                  const data = await res.json();
                  if (res.ok) setToast({ message: `Atlas config pushed to ${data.pushed} users (${data.failed} failed)`, type: "success" });
                  else setToast({ message: data.error || "Push failed", type: "error" });
                } catch { setToast({ message: "Network error during push", type: "error" }); }
                finally { setPushing(false); }
              }}
              disabled={pushing}
              className="flex items-center gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-700 hover:bg-cyan-100 disabled:opacity-50 transition-colors"
            >
              {pushing ? "Pushing…" : "Push Atlas Config"}
            </button>
            <button onClick={() => setShowCreateModal(true)} className="btn-primary flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              <span className="hidden sm:inline">Create User</span>
              <span className="sm:hidden">Add</span>
            </button>
          </div>
        )}
        {activeTab === "feedback" && (
          <button
            onClick={() => void fetchFeedback(true)}
            disabled={feedbackRefreshing}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-slate-400 transition hover:bg-white/10 hover:text-slate-200 disabled:opacity-40"
          >
            <RefreshCw className={`h-4 w-4 ${feedbackRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        )}
        {activeTab === "tokens" && (
          <button
            onClick={() => void fetchTokenUsage(true)}
            disabled={tokenRefreshing}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-slate-400 transition hover:bg-white/10 hover:text-slate-200 disabled:opacity-40"
          >
            <RefreshCw className={`h-4 w-4 ${tokenRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        )}
      </section>

      {/* Tabs */}
      <div className="flex flex-none items-center gap-1 rounded-xl border border-white/60 bg-white/60 dark:bg-white/5 p-1 w-fit mb-4">
        <button
          onClick={() => setActiveTab("users")}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
            activeTab === "users" ? "bg-cyan-500 text-white shadow-sm" : "text-muted hover:text-text"
          }`}
        >
          <Users className="h-3.5 w-3.5" />
          Users
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${activeTab === "users" ? "bg-white/20 text-white" : "bg-slate-200 dark:bg-white/10 text-muted"}`}>
            {users.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab("feedback")}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
            activeTab === "feedback" ? "bg-cyan-500 text-white shadow-sm" : "text-muted hover:text-text"
          }`}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Feedback
          {feedbackTotal > 0 && (
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${activeTab === "feedback" ? "bg-white/20 text-white" : "bg-cyan-100 dark:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300"}`}>
              {feedbackTotal}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("tokens")}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
            activeTab === "tokens" ? "bg-cyan-500 text-white shadow-sm" : "text-muted hover:text-text"
          }`}
        >
          <Coins className="h-3.5 w-3.5" />
          Token Usage
        </button>
      </div>

      {toast && (
        <div className={`mb-4 flex items-center justify-between rounded-xl border px-4 py-3 text-sm ${
          toast.type === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"
        }`}>
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} className="font-bold opacity-60 hover:opacity-100">×</button>
        </div>
      )}

      {/* ── Users Tab ── */}
      {activeTab === "users" && (
        <div className="flex-1 overflow-y-auto min-h-0 pb-6">
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            <div className="panel p-4 text-center">
              <p className="text-xs text-muted">Total Users</p>
              <p className="mt-1 text-2xl font-extrabold">{users.length}</p>
            </div>
            <div className="panel p-4 text-center">
              <p className="text-xs text-muted">Admins</p>
              <p className="mt-1 text-2xl font-extrabold text-cyan-600">{users.filter((u) => u.role === "ADMIN").length}</p>
            </div>
            <div className="panel p-4 text-center">
              <p className="text-xs text-muted">Active Users</p>
              <p className="mt-1 text-2xl font-extrabold">{users.filter((u) => u.role === "USER" && u.status === "ACTIVE").length}</p>
            </div>
            <div className="panel p-4 text-center">
              <p className="text-xs text-muted">Pending</p>
              <p className="mt-1 text-2xl font-extrabold text-amber-600">{users.filter((u) => u.status === "PENDING").length}</p>
            </div>
          </div>

          <div className="space-y-3">
            {[...users].sort((a, b) => {
              // PENDING users first, then by creation date
              if (a.status === "PENDING" && b.status !== "PENDING") return -1;
              if (a.status !== "PENDING" && b.status === "PENDING") return 1;
              return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            }).map((user) => (
              <div key={user.id} className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 text-sm font-bold text-cyan-700">
                    {user.name?.[0]?.toUpperCase() || "?"}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold">{user.name}</p>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        user.role === "ADMIN" ? "bg-cyan-100 text-cyan-700 border border-cyan-200" : "bg-slate-100 text-slate-600 border border-slate-200"
                      }`}>
                        {user.role === "ADMIN" && <Shield className="h-2.5 w-2.5" />}
                        {user.role}
                      </span>
                      {user.status === "PENDING" && (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 border border-amber-200">
                          <Clock className="h-2.5 w-2.5" />
                          PENDING
                        </span>
                      )}
                      {user.status === "SUSPENDED" && (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-rose-100 text-rose-700 border border-rose-200">
                          SUSPENDED
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted">{user.email}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {user.status === "PENDING" && (
                    <>
                      <button
                        onClick={() => handleAction("approve", { userId: user.id })}
                        className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-600 transition hover:bg-emerald-100"
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                        Approve
                      </button>
                      <button
                        onClick={() => { if (confirm(`Reject and delete ${user.name} (${user.email})?`)) handleAction("reject", { userId: user.id }); }}
                        className="flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-100"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Reject
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => handleAction("updateRole", { userId: user.id, role: user.role === "ADMIN" ? "USER" : "ADMIN" })}
                    disabled={user.id === session?.user?.id}
                    className="btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-40"
                    title={user.id === session?.user?.id ? "Cannot change own role" : user.role === "ADMIN" ? "Demote to User" : "Promote to Admin"}
                  >
                    {user.role === "ADMIN" ? <><ShieldOff className="h-3.5 w-3.5" /> Demote</> : <><Shield className="h-3.5 w-3.5" /> Promote</>}
                  </button>
                  <button onClick={() => setResetTarget(user)} className="btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-xs">
                    <KeyRound className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Reset PW</span>
                    <span className="sm:hidden">PW</span>
                  </button>
                  <button
                    onClick={() => { if (confirm(`Delete user ${user.name} (${user.email})?`)) handleAction("delete", { userId: user.id }); }}
                    disabled={user.id === session?.user?.id}
                    className="flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-100 disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Delete</span>
                  </button>
                </div>
              </div>
            ))}
            {users.length === 0 && <div className="panel p-8 text-center text-sm text-muted">No users found.</div>}
          </div>
        </div>
      )}

      {/* ── Feedback Tab ── */}
      {activeTab === "feedback" && (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Filters */}
          <div className="flex flex-none flex-wrap items-center gap-2 pb-4">
            <div className="flex items-center gap-1 rounded-xl border border-white/60 bg-white/60 dark:bg-white/5 p-1">
              {FEEDBACK_TYPE_FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFeedbackFilter(f.key)}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                    feedbackFilter === f.key ? "bg-cyan-500 text-white shadow-sm" : "text-muted hover:text-text"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="Search by description or email…"
              value={feedbackSearch}
              onChange={(e) => setFeedbackSearch(e.target.value)}
              className="field min-w-[200px] flex-1 text-sm"
            />
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 pb-6">
            {feedbackLoading ? (
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
            ) : filteredFeedback.length === 0 ? (
              <div className="panel flex flex-col items-center justify-center gap-3 p-12 text-center">
                <MessageSquare className="h-10 w-10 text-slate-300 dark:text-white/20" />
                <p className="text-sm text-muted">No feedback yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredFeedback.map((entry, idx) => (
                  <div key={entry.id ?? idx} className="panel flex flex-col gap-3 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${typeBadgeClass(entry.type)}`}>
                        {entry.type === "bug" ? "Bug" : entry.type === "suggestion" ? "Suggestion" : "Other"}
                      </span>
                      <span className="text-xs text-muted">{timeAgo(entry.timestamp)}</span>
                      {entry.userEmail && (
                        <span className="ml-auto text-xs text-muted truncate max-w-[200px]">{entry.userEmail}</span>
                      )}
                    </div>
                    <p className="text-sm text-text leading-relaxed whitespace-pre-wrap">{entry.description}</p>
                    {entry.page && (
                      <p className="text-[11px] font-mono text-muted border-t border-white/40 pt-2">{entry.page}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Token Usage Tab ── */}
      {activeTab === "tokens" && (
        <div className="flex-1 overflow-y-auto min-h-0 pb-6">
          {tokenLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="panel animate-pulse p-4">
                  <div className="h-6 w-48 rounded bg-slate-200 dark:bg-white/10 mb-2" />
                  <div className="h-4 w-full rounded bg-slate-200 dark:bg-white/10" />
                </div>
              ))}
            </div>
          ) : (
            <>
              {/* Summary cards */}
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
                <div className="panel p-4 text-center">
                  <p className="text-xs text-muted">Total Tokens Used</p>
                  <p className="mt-1 text-2xl font-extrabold">
                    {tokenTotals.inputTokens + tokenTotals.outputTokens >= 1000
                      ? `${((tokenTotals.inputTokens + tokenTotals.outputTokens) / 1000).toFixed(1)}k`
                      : tokenTotals.inputTokens + tokenTotals.outputTokens}
                  </p>
                  <p className="text-[10px] text-muted">This month</p>
                </div>
                <div className="panel p-4 text-center">
                  <p className="text-xs text-muted">Total Cost</p>
                  <p className="mt-1 text-2xl font-extrabold text-cyan-600">${tokenTotals.costUsd.toFixed(4)}</p>
                  <p className="text-[10px] text-muted">All users combined</p>
                </div>
                <div className="panel p-4 text-center">
                  <p className="text-xs text-muted">Global Limit</p>
                  <p className="mt-1 text-2xl font-extrabold">${globalLimit.toFixed(2)}</p>
                  <p className="text-[10px] text-muted">Per user/month</p>
                </div>
                <div className="panel p-4 text-center">
                  <p className="text-xs text-muted">Over 80% Budget</p>
                  <p className="mt-1 text-2xl font-extrabold text-amber-600">
                    {tokenUsers.filter((u) => u.usagePercent >= 80).length}
                  </p>
                  <p className="text-[10px] text-muted">Users at risk</p>
                </div>
              </div>

              {/* Per-user table */}
              <div className="panel overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-left text-xs font-bold uppercase tracking-wider text-muted">
                        <th className="px-4 py-3">User</th>
                        <th className="px-4 py-3 text-right">Input</th>
                        <th className="px-4 py-3 text-right">Output</th>
                        <th className="px-4 py-3 text-right">Cost</th>
                        <th className="px-4 py-3 text-right">Limit</th>
                        <th className="px-4 py-3 w-40">Usage</th>
                        <th className="px-4 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tokenUsers.map((u) => {
                        const barColor =
                          u.usagePercent >= 100 ? "bg-red-500" :
                          u.usagePercent >= 80 ? "bg-amber-500" :
                          u.usagePercent >= 60 ? "bg-yellow-500" :
                          "bg-emerald-500";
                        const rowBg =
                          u.usagePercent >= 100 ? "bg-red-500/5" :
                          u.usagePercent >= 80 ? "bg-amber-500/5" :
                          "";
                        return (
                          <tr key={u.userId} className={`border-b border-white/5 ${rowBg}`}>
                            <td className="px-4 py-3">
                              <p className="font-semibold truncate max-w-[180px]">{u.name || "—"}</p>
                              <p className="text-[11px] text-muted truncate max-w-[180px]">{u.email}</p>
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-xs">
                              {u.inputTokens >= 1000 ? `${(u.inputTokens / 1000).toFixed(1)}k` : u.inputTokens}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-xs">
                              {u.outputTokens >= 1000 ? `${(u.outputTokens / 1000).toFixed(1)}k` : u.outputTokens}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-xs font-bold">
                              ${u.costUsd.toFixed(4)}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-xs">
                              ${u.limitUsd.toFixed(2)}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="h-1.5 flex-1 rounded-full bg-white/10 overflow-hidden">
                                  <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(u.usagePercent, 100)}%` }} />
                                </div>
                                <span className={`text-[11px] font-bold tabular-nums ${
                                  u.usagePercent >= 100 ? "text-red-400" :
                                  u.usagePercent >= 80 ? "text-amber-400" :
                                  "text-muted"
                                }`}>
                                  {u.usagePercent}%
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              {editingLimit === u.userId ? (
                                <div className="flex items-center gap-1">
                                  <span className="text-xs text-muted">$</span>
                                  <input
                                    type="number"
                                    step="0.5"
                                    min="0.5"
                                    value={editLimitValue}
                                    onChange={(e) => setEditLimitValue(e.target.value)}
                                    className="w-16 rounded-lg border border-white/20 bg-white/5 px-2 py-1 text-xs font-mono focus:border-cyan-500 focus:outline-none"
                                    autoFocus
                                    onKeyDown={(e) => { if (e.key === "Enter") handleSetLimit(u.userId); if (e.key === "Escape") setEditingLimit(null); }}
                                  />
                                  <button
                                    onClick={() => handleSetLimit(u.userId)}
                                    disabled={savingLimit}
                                    className="rounded-lg bg-cyan-500/20 p-1 text-cyan-400 hover:bg-cyan-500/30 disabled:opacity-50"
                                  >
                                    <Save className="h-3 w-3" />
                                  </button>
                                  <button onClick={() => setEditingLimit(null)} className="rounded-lg p-1 text-muted hover:text-text">
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => { setEditingLimit(u.userId); setEditLimitValue(String(u.limitUsd)); }}
                                  className="rounded-lg border border-white/10 px-2.5 py-1 text-[11px] font-semibold text-muted hover:border-cyan-500/30 hover:text-cyan-400 transition"
                                >
                                  Set Limit
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {tokenUsers.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted">No usage data for this month.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" onClick={() => setShowCreateModal(false)}>
          <div className="w-full max-w-md rounded-2xl border border-white/60 dark:border-white/10 bg-white dark:bg-slate-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {/* Modal header */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/10 px-6 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-600">
                  <UserPlus className="h-4 w-4" />
                </div>
                <h3 className="text-base font-extrabold text-text">Create New User</h3>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="rounded-lg p-1.5 text-muted hover:bg-slate-100 dark:hover:bg-white/10 hover:text-text transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            {/* Modal body */}
            <form onSubmit={handleCreate} className="space-y-4 px-6 py-5">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-muted uppercase tracking-wide">Full Name</label>
                <input type="text" required value={createForm.name} onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))} className="field" placeholder="e.g. Jane Smith" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-muted uppercase tracking-wide">Email Address</label>
                <input type="email" required value={createForm.email} onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))} className="field" placeholder="jane@company.com" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-muted uppercase tracking-wide">Password</label>
                <input type="password" required minLength={6} value={createForm.password} onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))} className="field" placeholder="Min. 6 characters" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-muted uppercase tracking-wide">Role</label>
                <select value={createForm.role} onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value as "USER" | "ADMIN" }))} className="field appearance-none cursor-pointer">
                  <option value="USER">User — standard access</option>
                  <option value="ADMIN">Admin — full access</option>
                </select>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowCreateModal(false)} className="btn-secondary flex-1 py-2.5">Cancel</button>
                <button type="submit" className="btn-primary flex-1 py-2.5">Create User</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" onClick={() => setResetTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-white/60 dark:border-white/10 bg-white dark:bg-slate-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/10 px-6 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600">
                  <KeyRound className="h-4 w-4" />
                </div>
                <h3 className="text-base font-extrabold text-text">Reset Password</h3>
              </div>
              <button onClick={() => setResetTarget(null)} className="rounded-lg p-1.5 text-muted hover:bg-slate-100 dark:hover:bg-white/10 hover:text-text transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-6 py-5">
              <p className="mb-4 text-sm text-muted">
                Set a new password for <span className="font-semibold text-text">{resetTarget.name}</span>
                <span className="block text-xs mt-0.5">{resetTarget.email}</span>
              </p>
              <form onSubmit={handleResetPassword} className="space-y-4">
                <input type="password" required minLength={6} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="field" placeholder="New password (min. 6 chars)" />
                <div className="flex gap-3">
                  <button type="button" onClick={() => setResetTarget(null)} className="btn-secondary flex-1 py-2.5">Cancel</button>
                  <button type="submit" className="btn-primary flex-1 py-2.5">Reset Password</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
