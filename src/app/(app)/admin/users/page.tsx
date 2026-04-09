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
} from "lucide-react";

type UserEntry = {
  id: string;
  email: string;
  name: string;
  role: "USER" | "ADMIN";
  createdAt: string;
};

export default function AdminUsersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [resetTarget, setResetTarget] = useState<UserEntry | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [pushing, setPushing] = useState(false);

  // Create form state
  const [createForm, setCreateForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "USER" as "USER" | "ADMIN",
  });

  const isAdmin = session?.user?.role === "ADMIN";

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
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

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleAction = async (
    action: string,
    data: Record<string, unknown>,
  ) => {
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...data }),
      });
      const result = await res.json();
      if (!res.ok) {
        showToast(result.error || "Action failed", "error");
        return false;
      }
      showToast(
        action === "create"
          ? "User created"
          : action === "delete"
            ? "User deleted"
            : action === "updateRole"
              ? "Role updated"
              : "Password reset",
        "success",
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
    if (ok) {
      setShowCreateModal(false);
      setCreateForm({ name: "", email: "", password: "", role: "USER" });
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget || !newPassword) return;
    const ok = await handleAction("resetPassword", {
      userId: resetTarget.id,
      newPassword,
    });
    if (ok) {
      setResetTarget(null);
      setNewPassword("");
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500/30 border-t-cyan-500" />
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="flex h-full flex-col overflow-hidden px-3 pt-4 sm:px-4 md:px-6">
      <section className="flex flex-none flex-wrap items-center justify-between gap-3 pb-4 sm:pb-6">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-extrabold tracking-tight sm:text-2xl">
            <Users className="h-6 w-6 text-cyan-600" />
            User Management
          </h2>
          <p className="mt-1 hidden text-sm text-muted sm:block">
            Create, manage roles, and control access for all users.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              setPushing(true);
              try {
                const res = await fetch("/api/admin/push-atlas-config", { method: "POST" });
                const data = await res.json();
                if (res.ok) {
                  setToast({ message: `Atlas config pushed to ${data.pushed} users (${data.failed} failed)`, type: "success" });
                } else {
                  setToast({ message: data.error || "Push failed", type: "error" });
                }
              } catch {
                setToast({ message: "Network error during push", type: "error" });
              } finally {
                setPushing(false);
              }
            }}
            disabled={pushing}
            className="flex items-center gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-700 hover:bg-cyan-100 disabled:opacity-50 transition-colors"
          >
            {pushing ? "Pushing…" : "Push Atlas Config"}
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary flex items-center gap-2"
          >
            <UserPlus className="h-4 w-4" />
            <span className="hidden sm:inline">Create User</span>
            <span className="sm:hidden">Add</span>
          </button>
        </div>
      </section>

      {toast && (
        <div
          className={`mb-4 flex items-center justify-between rounded-xl border px-4 py-3 text-sm ${
            toast.type === "error"
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} className="font-bold opacity-60 hover:opacity-100">
            ×
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto min-h-0 pb-6">
        {/* Stats */}
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          <div className="panel p-4 text-center">
            <p className="text-xs text-muted">Total Users</p>
            <p className="mt-1 text-2xl font-extrabold">{users.length}</p>
          </div>
          <div className="panel p-4 text-center">
            <p className="text-xs text-muted">Admins</p>
            <p className="mt-1 text-2xl font-extrabold text-cyan-600">
              {users.filter((u) => u.role === "ADMIN").length}
            </p>
          </div>
          <div className="panel col-span-2 p-4 text-center sm:col-span-1">
            <p className="text-xs text-muted">Regular Users</p>
            <p className="mt-1 text-2xl font-extrabold">
              {users.filter((u) => u.role === "USER").length}
            </p>
          </div>
        </div>

        {/* User list */}
        <div className="space-y-3">
          {users.map((user) => (
            <div
              key={user.id}
              className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 text-sm font-bold text-cyan-700">
                  {user.name?.[0]?.toUpperCase() || "?"}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold">{user.name}</p>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        user.role === "ADMIN"
                          ? "bg-cyan-100 text-cyan-700 border border-cyan-200"
                          : "bg-slate-100 text-slate-600 border border-slate-200"
                      }`}
                    >
                      {user.role === "ADMIN" && (
                        <Shield className="h-2.5 w-2.5" />
                      )}
                      {user.role}
                    </span>
                  </div>
                  <p className="truncate text-xs text-muted">{user.email}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Toggle role */}
                <button
                  onClick={() =>
                    handleAction("updateRole", {
                      userId: user.id,
                      role: user.role === "ADMIN" ? "USER" : "ADMIN",
                    })
                  }
                  disabled={user.id === session?.user?.id}
                  className="btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-40"
                  title={
                    user.id === session?.user?.id
                      ? "Cannot change own role"
                      : user.role === "ADMIN"
                        ? "Demote to User"
                        : "Promote to Admin"
                  }
                >
                  {user.role === "ADMIN" ? (
                    <>
                      <ShieldOff className="h-3.5 w-3.5" /> Demote
                    </>
                  ) : (
                    <>
                      <Shield className="h-3.5 w-3.5" /> Promote
                    </>
                  )}
                </button>

                {/* Reset password */}
                <button
                  onClick={() => setResetTarget(user)}
                  className="btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-xs"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Reset PW</span>
                  <span className="sm:hidden">PW</span>
                </button>

                {/* Delete */}
                <button
                  onClick={() => {
                    if (
                      confirm(`Delete user ${user.name} (${user.email})?`)
                    ) {
                      handleAction("delete", { userId: user.id });
                    }
                  }}
                  disabled={user.id === session?.user?.id}
                  className="flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-100 disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Delete</span>
                </button>
              </div>
            </div>
          ))}

          {users.length === 0 && (
            <div className="panel p-8 text-center text-sm text-muted">
              No users found.
            </div>
          )}
        </div>
      </div>

      {/* Create User Modal */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
          onClick={() => setShowCreateModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-white/60 bg-white/95 p-5 shadow-2xl backdrop-blur-xl sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-extrabold">Create New User</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="rounded-full bg-slate-100 dark:bg-white/10 p-1.5 hover:bg-slate-200 dark:hover:bg-white/20 transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">
                  Name
                </label>
                <input
                  type="text"
                  required
                  value={createForm.name}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, name: e.target.value }))
                  }
                  className="field"
                  placeholder="Full name"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={createForm.email}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, email: e.target.value }))
                  }
                  className="field"
                  placeholder="user@company.com"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">
                  Password
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={createForm.password}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, password: e.target.value }))
                  }
                  className="field"
                  placeholder="Min. 6 characters"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">
                  Role
                </label>
                <select
                  value={createForm.role}
                  onChange={(e) =>
                    setCreateForm((f) => ({
                      ...f,
                      role: e.target.value as "USER" | "ADMIN",
                    }))
                  }
                  className="field"
                >
                  <option value="USER">User</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary flex-1">
                  Create User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
          onClick={() => setResetTarget(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-white/60 bg-white/95 p-5 shadow-2xl backdrop-blur-xl sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-extrabold">Reset Password</h3>
              <button
                onClick={() => setResetTarget(null)}
                className="rounded-full bg-slate-100 dark:bg-white/10 p-1.5 hover:bg-slate-200 dark:hover:bg-white/20 transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-4 text-sm text-muted">
              Set a new password for{" "}
              <span className="font-semibold text-text">
                {resetTarget.name}
              </span>{" "}
              ({resetTarget.email})
            </p>
            <form onSubmit={handleResetPassword} className="space-y-4">
              <input
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="field"
                placeholder="New password (min. 6 chars)"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setResetTarget(null)}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary flex-1">
                  Reset Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
