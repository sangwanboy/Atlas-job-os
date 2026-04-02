"use client";

import { Bell, LogOut, Moon, Search, Settings, Sun, User, LogIn, Menu, PanelLeftOpen } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession, signOut, signIn } from "next-auth/react";
import { useTheme } from "next-themes";

type Notification = {
  id: string;
  title: string;
  message: string;
  color: "cyan" | "amber";
  read: boolean;
};

const defaultNotifications: Notification[] = [
  {
    id: "n1",
    title: "Job Match Found",
    message: "Atlas found 3 new high-priority roles matching your profile.",
    color: "cyan",
    read: false,
  },
  {
    id: "n2",
    title: "Follow-up Reminder",
    message: "You have 2 pending follow-ups due by end of day today.",
    color: "amber",
    read: false,
  },
];

type TopNavProps = {
  onToggleSidebar?: () => void;
  sidebarCollapsed?: boolean;
  onToggleDesktopSidebar?: () => void;
};

export function TopNav({ onToggleSidebar, sidebarCollapsed, onToggleDesktopSidebar }: TopNavProps = {}) {
  const router = useRouter();
  const { data: session } = useSession();
  const [search, setSearch] = useState("");
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>(defaultNotifications);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) {
      router.push(`/jobs?q=${encodeURIComponent(search.trim())}`);
    }
  };

  /* Bug 5: Mark all notifications as read */
  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  /* Bug 6: Click-outside and Escape to dismiss notification panel + profile menu */
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setShowNotifications(false);
        setShowProfileMenu(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const colorMap = {
    cyan: { border: "border-cyan-200/60 dark:border-cyan-500/30", bg: "bg-cyan-50/50 dark:bg-cyan-500/10", text: "text-cyan-800 dark:text-cyan-300" },
    amber: { border: "border-amber-200/60 dark:border-amber-500/30", bg: "bg-amber-50/50 dark:bg-amber-500/10", text: "text-amber-800 dark:text-amber-300" },
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center border-b border-white/60 dark:border-white/10 bg-white/45 dark:bg-slate-900/60 px-4 backdrop-blur md:px-6 lg:px-8">
      <div className="flex w-full items-center justify-between gap-3">
        {/* Mobile hamburger */}
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className="lg:hidden rounded-lg border border-white/60 dark:border-white/10 bg-white/75 dark:bg-white/5 p-2 shadow-sm hover:bg-white dark:hover:bg-white/10 transition-colors flex-none"
            aria-label="Open menu"
          >
            <Menu className="h-4 w-4" />
          </button>
        )}

        {/* Desktop: show expand button when sidebar is collapsed */}
        {sidebarCollapsed && onToggleDesktopSidebar && (
          <button
            onClick={onToggleDesktopSidebar}
            title="Expand sidebar"
            className="hidden lg:flex rounded-lg border border-white/60 dark:border-white/10 bg-white/75 dark:bg-white/5 p-2 shadow-sm hover:bg-white dark:hover:bg-white/10 transition-colors flex-none items-center gap-1.5 text-xs font-medium text-muted"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        )}

        <form
          onSubmit={handleSearch}
          className="flex flex-1 min-w-0 items-center gap-2 rounded-xl border border-white/60 dark:border-white/10 bg-white/75 dark:bg-white/5 px-3 py-2 shadow-sm focus-within:ring-2 focus-within:ring-cyan-500/20 transition-all"
        >
          <Search className="h-4 w-4 text-muted flex-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search jobs..."
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
          />
        </form>

        <div className="flex items-center gap-1.5 sm:gap-3">
          {/* Notification bell */}
          <div className="relative" ref={notifRef}>
            <button 
              onClick={() => setShowNotifications(!showNotifications)}
              className={`rounded-lg border p-2 shadow-sm transition-colors ${
                showNotifications
                  ? "bg-cyan-50 dark:bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-200 dark:border-cyan-500/40"
                  : "border-white/60 dark:border-white/10 bg-white/75 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10"
              }`}
            >
              <Bell className="h-4 w-4" />
              {/* Bug 5: Only show badge when there are unread notifications */}
              {unreadCount > 0 && (
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500 border-2 border-white" />
              )}
            </button>

            {showNotifications && (
              <div className="absolute right-0 top-full mt-2 w-[calc(100vw-2rem)] max-w-80 rounded-2xl border border-white/60 dark:border-white/10 bg-white/95 dark:bg-slate-900/95 p-4 shadow-2xl backdrop-blur-xl sm:w-80">
                <h4 className="font-bold">Notifications</h4>
                <div className="mt-3 space-y-3">
                  {notifications.map((notif) => {
                    const colors = colorMap[notif.color];
                    return (
                      <div
                        key={notif.id}
                        className={`rounded-xl border p-3 text-xs transition-all ${
                          notif.read
                            ? "border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/5 opacity-60"
                            : `${colors.border} ${colors.bg}`
                        }`}
                      >
                        <p className={`font-semibold ${notif.read ? "text-slate-500" : colors.text}`}>
                          {notif.title}
                        </p>
                        <p className="mt-1 text-muted">{notif.message}</p>
                      </div>
                    );
                  })}
                </div>
                <button 
                  className="mt-4 w-full py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted hover:text-text transition-colors"
                  onClick={markAllRead}
                >
                  Mark all as read
                </button>
              </div>
            )}
          </div>

          {/* Dark mode toggle */}
          {mounted && (
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="rounded-lg border border-white/60 dark:border-white/10 bg-white/75 dark:bg-white/5 p-2 shadow-sm hover:bg-white dark:hover:bg-white/10 transition-colors"
              aria-label="Toggle dark mode"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          )}

          {/* Bug 15: Founder profile button with dropdown menu */}
          <div className="relative" ref={profileRef}>
            {session ? (
              <>
                <button
                  onClick={() => setShowProfileMenu(!showProfileMenu)}
                  className={`rounded-lg border p-2 text-sm font-semibold shadow-sm whitespace-nowrap transition-colors flex items-center gap-2 sm:px-3 sm:py-2 sm:flex-col sm:items-start ${
                    showProfileMenu
                      ? "bg-cyan-50 dark:bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border-cyan-200 dark:border-cyan-500/40"
                      : "border-white/60 dark:border-white/10 bg-white/75 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10"
                  }`}
                >
                  <User className="h-4 w-4 sm:hidden" />
                  <span className="hidden leading-tight sm:block">{session.user?.name || "User"}</span>
                  {session.user?.role === "ADMIN" && <span className="hidden text-[10px] text-cyan-600 font-bold tracking-wider uppercase sm:block">Admin</span>}
                </button>

                {showProfileMenu && (
                  <div className="absolute right-0 top-full mt-2 w-52 rounded-2xl border border-white/60 dark:border-white/10 bg-white/95 dark:bg-slate-900/95 p-2 shadow-2xl backdrop-blur-xl">
                    <button
                      onClick={() => { router.push("/profile"); setShowProfileMenu(false); }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-white/8 transition-colors text-left"
                    >
                      <User className="h-4 w-4 text-muted" />
                      Profile
                    </button>
                    <button
                      onClick={() => { router.push("/settings"); setShowProfileMenu(false); }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-white/8 transition-colors text-left"
                    >
                      <Settings className="h-4 w-4 text-muted" />
                      Settings
                    </button>
                    <div className="my-1 border-t border-slate-100 dark:border-white/10" />
                    <button
                      onClick={() => { setShowProfileMenu(false); signOut({ callbackUrl: '/login' }); }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors text-left"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign Out
                    </button>
                  </div>
                )}
              </>
            ) : (
              <button
                onClick={() => signIn()}
                className="flex items-center gap-2 rounded-lg border border-transparent bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 transition-colors"
              >
                <LogIn className="h-4 w-4" />
                Sign In
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
