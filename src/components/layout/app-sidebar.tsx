"use client";

import { useEffect, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Bot, BriefcaseBusiness, ChartNoAxesCombined, FileText, LayoutDashboard, Megaphone, Settings, Users, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import type { RuntimeSettingsResponse } from "@/types/settings";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/jobs", label: "Jobs", icon: BriefcaseBusiness },
  { href: "/agents/workspace", label: "Agent Workspace", icon: Bot },
  { href: "/outreach", label: "Outreach", icon: Megaphone },
  { href: "/cv", label: "My CV", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/analytics", label: "Analytics", icon: ChartNoAxesCombined },
] as const satisfies ReadonlyArray<{ href: Route; label: string; icon: React.ComponentType<{ className?: string }> }>;

type AppSidebarProps = {
  mobileOpen?: boolean;
  onClose?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
};

export function AppSidebar({ mobileOpen, onClose, collapsed, onToggleCollapse }: AppSidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";
  const [runtime, setRuntime] = useState<RuntimeSettingsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/settings/runtime");
        if (res.ok) {
          const data = (await res.json()) as RuntimeSettingsResponse;
          setRuntime(data);
        }
      } catch {
        // Ignore fetch errors in local dev/degraded mode
      } finally {
        setIsLoading(false);
      }
    }
    void load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  const totalTokens = runtime?.usage.totalTokens ?? 0;
  const budget = runtime?.settings.monthlyTokenBudget ?? 1000000;
  const percentage = Math.min(100, Math.round((totalTokens / budget) * 100));
  const budgetLabel = budget >= 1000000 ? `${(budget / 1000000).toFixed(1)}M` : `${Math.round(budget / 1000)}k`;
  const usageDisplay = totalTokens >= 1000 ? `${(totalTokens / 1000).toFixed(1)}k` : totalTokens;

  const NavLink = ({ item, onClick }: { item: typeof navItems[number]; onClick?: () => void }) => {
    const Icon = item.icon;
    const active = pathname ? pathname === item.href || pathname.startsWith(`${item.href}/`) : false;
    return (
      <Link
        href={item.href}
        onClick={onClick}
        className={`group flex items-center gap-3 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
          active
            ? "border-cyan-200/80 bg-cyan-50/80 text-slate-900"
            : "border-transparent text-muted hover:border-white/70 hover:bg-white/75 hover:text-text"
        }`}
      >
        <Icon className="h-4 w-4" />
        {item.label}
      </Link>
    );
  };

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={`hidden lg:flex flex-col border-r border-white/60 bg-white/50 backdrop-blur lg:sticky lg:top-0 lg:h-screen overflow-hidden transition-all duration-300 ${
          collapsed ? "w-[64px] py-5 px-2" : "w-[260px] p-5"
        }`}
      >
        {collapsed ? (
          <div className="flex flex-col items-center gap-3 h-full">
            <div className="w-full flex flex-col items-center gap-2">
              <div className="rounded-xl border border-white/65 bg-white/70 py-2 px-1 shadow-sm flex items-center justify-center w-full">
                <span className="text-sm font-black text-cyan-600">JO</span>
              </div>
              <button
                onClick={onToggleCollapse}
                title="Expand sidebar"
                className="rounded-lg border border-white/60 bg-white/75 p-1.5 text-muted hover:bg-white hover:text-text transition-colors"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            </div>
            <nav className="mt-2 flex flex-col items-center gap-1 w-full">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = pathname ? pathname === item.href || pathname.startsWith(`${item.href}/`) : false;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.label}
                    className={`flex items-center justify-center rounded-xl border p-2 w-full transition ${
                      active
                        ? "border-cyan-200/80 bg-cyan-50/80 text-slate-900"
                        : "border-transparent text-muted hover:border-white/70 hover:bg-white/75 hover:text-text"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </Link>
                );
              })}
              {isAdmin && (
                <>
                  <div className="w-full border-t border-white/40 my-1" />
                  <Link
                    href="/admin/users"
                    title="Manage Users"
                    className={`flex items-center justify-center rounded-xl border p-2 w-full transition ${
                      pathname?.startsWith("/admin/users")
                        ? "border-cyan-200/80 bg-cyan-50/80 text-slate-900"
                        : "border-transparent text-muted hover:border-white/70 hover:bg-white/75 hover:text-text"
                    }`}
                  >
                    <Users className="h-4 w-4" />
                  </Link>
                </>
              )}
            </nav>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between">
              <div className="rounded-2xl border border-white/65 bg-white/70 p-4 shadow-sm flex-1 mr-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted">AIG</p>
                <h1 className="mt-2 text-lg font-black leading-tight text-cyan-600">JOB OS</h1>
                <p className="mt-2 text-xs text-muted">Agent-led job discovery, ranking, and outreach operations.</p>
              </div>
              <button
                onClick={onToggleCollapse}
                title="Collapse sidebar"
                className="mt-1 rounded-lg border border-white/60 bg-white/75 p-1.5 text-muted hover:bg-white hover:text-text transition-colors flex-none"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </div>

            <nav className="mt-7 space-y-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = pathname ? pathname === item.href || pathname.startsWith(`${item.href}/`) : false;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`group flex items-center gap-3 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                      active
                        ? "border-cyan-200/80 bg-cyan-50/80 text-slate-900"
                        : "border-transparent text-muted hover:border-white/70 hover:bg-white/75 hover:text-text"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
              {isAdmin && (
                <>
                  <div className="my-2 border-t border-white/40" />
                  <Link
                    href="/admin/users"
                    className={`group flex items-center gap-3 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                      pathname?.startsWith("/admin/users")
                        ? "border-cyan-200/80 bg-cyan-50/80 text-slate-900"
                        : "border-transparent text-muted hover:border-white/70 hover:bg-white/75 hover:text-text"
                    }`}
                  >
                    <Users className="h-4 w-4" />
                    Manage Users
                  </Link>
                </>
              )}
            </nav>

            <div className="mt-8 space-y-4">
              <div className="rounded-2xl border border-white/60 bg-white/70 p-3 text-xs">
                {isLoading && !runtime ? (
                  <div className="space-y-2 animate-pulse">
                    <div className="flex items-center justify-between mb-2">
                      <div suppressHydrationWarning className="h-3 w-20 bg-slate-200 rounded" />
                      <div suppressHydrationWarning className="h-3 w-24 bg-slate-200 rounded" />
                    </div>
                    <div suppressHydrationWarning className="h-1.5 w-full rounded-full bg-slate-200" />
                    <div suppressHydrationWarning className="h-3 w-28 bg-slate-200 rounded mt-2" />
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-bold text-text">Token Usage</p>
                      <span className="text-[10px] font-medium text-muted">{percentage}% of monthly cap</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                      <div className="h-full bg-cyan-500 rounded-full transition-all duration-500" style={{ width: `${percentage}%` }} />
                    </div>
                    <p className="mt-2 text-[10px] text-muted">
                      {usageDisplay} / {budgetLabel} tokens used
                    </p>
                  </>
                )}
              </div>

              <div className="rounded-2xl border border-white/60 bg-white/70 p-3 text-xs text-muted">
                <p className="font-semibold text-text">Execution Mode</p>
                <p className="mt-1">Draft-first outreach, user-approved actions, token-aware agents.</p>
              </div>
            </div>
          </>
        )}
      </aside>

      {/* Mobile slide-over sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col w-[260px] border-r border-white/60 bg-white/95 backdrop-blur p-5 shadow-2xl transition-transform duration-300 lg:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-start justify-between mb-6">
          <div className="rounded-2xl border border-white/65 bg-white/70 p-4 shadow-sm flex-1 mr-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted">AIG</p>
            <h1 className="mt-2 text-lg font-black leading-tight text-cyan-600">JOB OS</h1>
            <p className="mt-2 text-xs text-muted">Agent-led job discovery, ranking, and outreach operations.</p>
          </div>
          <button
            onClick={onClose}
            className="mt-1 rounded-lg border border-white/60 bg-white/75 p-1.5 text-muted hover:bg-white hover:text-text transition-colors flex-none"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname ? pathname === item.href || pathname.startsWith(`${item.href}/`) : false;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`group flex items-center gap-3 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                  active
                    ? "border-cyan-200/80 bg-cyan-50/80 text-slate-900"
                    : "border-transparent text-muted hover:border-white/70 hover:bg-white/75 hover:text-text"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
          {isAdmin && (
            <>
              <div className="my-2 border-t border-white/40" />
              <Link
                href="/admin/users"
                onClick={onClose}
                className={`group flex items-center gap-3 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                  pathname?.startsWith("/admin/users")
                    ? "border-cyan-200/80 bg-cyan-50/80 text-slate-900"
                    : "border-transparent text-muted hover:border-white/70 hover:bg-white/75 hover:text-text"
                }`}
              >
                <Users className="h-4 w-4" />
                Manage Users
              </Link>
            </>
          )}
        </nav>
      </aside>
    </>
  );
}
