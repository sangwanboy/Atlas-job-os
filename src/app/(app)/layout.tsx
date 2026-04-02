"use client";

import { useState, useCallback } from "react";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { TopNav } from "@/components/layout/top-nav";
import { AgentProvider } from "@/components/providers/agent-provider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const toggleMobileSidebar = useCallback(() => setSidebarOpen((v) => !v), []);
  const closeMobileSidebar = useCallback(() => setSidebarOpen(false), []);
  const toggleDesktopSidebar = useCallback(() => setSidebarCollapsed((v) => !v), []);

  return (
    <AgentProvider>
      <div className={`app-shell h-screen overflow-hidden lg:grid ${sidebarCollapsed ? "lg:grid-cols-[64px_1fr]" : "lg:grid-cols-[260px_1fr]"} transition-all duration-300`}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-semibold"
        >
          Skip to main content
        </a>

        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/30 backdrop-blur-sm lg:hidden"
            onClick={closeMobileSidebar}
          />
        )}

        <AppSidebar
          mobileOpen={sidebarOpen}
          onClose={closeMobileSidebar}
          collapsed={sidebarCollapsed}
          onToggleCollapse={toggleDesktopSidebar}
        />

        <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
          <TopNav
            onToggleSidebar={toggleMobileSidebar}
            sidebarCollapsed={sidebarCollapsed}
            onToggleDesktopSidebar={toggleDesktopSidebar}
          />
          <main id="main-content" className="relative flex-1 min-h-0 overflow-hidden bg-slate-50/50 dark:bg-transparent">
            {children}
          </main>
        </div>
      </div>
    </AgentProvider>
  );
}
