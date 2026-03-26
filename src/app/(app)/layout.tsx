"use client";

import { useState, useCallback } from "react";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { TopNav } from "@/components/layout/top-nav";
import { AgentProvider } from "@/components/providers/agent-provider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const toggleMobileSidebar = useCallback(() => setMobileSidebarOpen((v) => !v), []);
  const closeMobileSidebar = useCallback(() => setMobileSidebarOpen(false), []);
  const toggleDesktopSidebar = useCallback(() => setSidebarCollapsed((v) => !v), []);

  return (
    <AgentProvider>
      <div className="app-shell h-screen overflow-hidden flex">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-semibold"
        >
          Skip to main content
        </a>

        {/* Mobile sidebar overlay */}
        {mobileSidebarOpen && (
          <div className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm lg:hidden" onClick={closeMobileSidebar} />
        )}

        <AppSidebar
          mobileOpen={mobileSidebarOpen}
          onClose={closeMobileSidebar}
          collapsed={sidebarCollapsed}
          onToggleCollapse={toggleDesktopSidebar}
        />

        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <TopNav
            onToggleSidebar={toggleMobileSidebar}
            sidebarCollapsed={sidebarCollapsed}
            onToggleDesktopSidebar={toggleDesktopSidebar}
          />
          <main id="main-content" className="relative flex-1 min-h-0 overflow-auto bg-slate-50/50">
            {children}
          </main>
        </div>
      </div>
    </AgentProvider>
  );
}
