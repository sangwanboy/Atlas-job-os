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
} from "lucide-react";

type UserEntry = {
  id: string;
  email: string;
  name: string;
  role: "USER" | "ADMIN";
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
  const [activeTab, setActiveTab] = useState<"users" | "feedback">("users");

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
            Manage users and review beta feedback.
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
            className="flex items-center gap-2 rounded-xl border border-white/60 bg-white/75 px-3 py-2 text-sm font-semibold text-muted transition hover:bg-white hover:text-text disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${feedbackRefreshing ? "animate-spin" : ""}`} />
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
          Beta Feedback
          {feedbackTotal > 0 && (
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${activeTab === "feedback" ? "bg-white/20 text-white" : "bg-cyan-100 dark:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300"}`}>
              {feedbackTotal}
            </span>
          )}
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
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
            <div className="panel p-4 text-center">
              <p className="text-xs text-muted">Total Users</p>
              <p className="mt-1 text-2xl font-extrabold">{users.length}</p>
            </div>
            <div className="panel p-4 text-center">
              <p className="text-xs text-muted">Admins</p>
              <p className="mt-1 text-2xl font-extrabold text-cyan-600">{users.filter((u) => u.role === "ADMIN").length}</p>
            </div>
            <div className="panel col-span-2 p-4 text-center sm:col-span-1">
              <p className="text-xs text-muted">Regular Users</p>
              <p className="mt-1 text-2xl font-extrabold">{users.filter((u) => u.role === "USER").length}</p>
            </div>
          </div>

          <div className="space-y-3">
            {users.map((user) => (
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
                    </div>
                    <p className="truncate text-xs text-muted">{user.email}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
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

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" onClick={() => setShowCreateModal(false)}>
          <div className="w-full max-w-md rounded-2xl border border-white/60 bg-white/95 p-5 shadow-2xl backdrop-blur-xl sm:p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-extrabold">Create New User</h3>
              <button onClick={() => setShowCreateModal(false)} className="rounded-full bg-slate-100 dark:bg-white/10 p-1.5 hover:bg-slate-200 dark:hover:bg-white/20 transition-colors cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Name</label>
                <input type="text" required value={createForm.name} onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))} className="field" placeholder="Full name" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Email</label>
                <input type="email" required value={createForm.email} onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))} className="field" placeholder="user@company.com" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Password</label>
                <input type="password" required minLength={6} value={createForm.password} onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))} className="field" placeholder="Min. 6 characters" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Role</label>
                <select value={createForm.role} onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value as "USER" | "ADMIN" }))} className="field">
                  <option value="USER">User</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowCreateModal(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" className="btn-primary flex-1">Create User</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" onClick={() => setResetTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-white/60 bg-white/95 p-5 shadow-2xl backdrop-blur-xl sm:p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-extrabold">Reset Password</h3>
              <button onClick={() => setResetTarget(null)} className="rounded-full bg-slate-100 dark:bg-white/10 p-1.5 hover:bg-slate-200 dark:hover:bg-white/20 transition-colors cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-4 text-sm text-muted">
              Set a new password for <span className="font-semibold text-text">{resetTarget.name}</span> ({resetTarget.email})
            </p>
            <form onSubmit={handleResetPassword} className="space-y-4">
              <input type="password" required minLength={6} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="field" placeholder="New password (min. 6 chars)" />
              <div className="flex gap-2">
                <button type="button" onClick={() => setResetTarget(null)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" className="btn-primary flex-1">Reset Password</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
