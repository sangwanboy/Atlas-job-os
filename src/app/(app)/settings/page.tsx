import { Suspense } from "react";
import { LlmSettingsPanel } from "@/components/settings/llm-settings-panel";
import { GmailIntegrationPanel } from "@/components/settings/gmail-integration-panel";

function SettingsSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden animate-pulse">
      <section className="flex-none pb-6">
        <div className="h-8 w-32 bg-slate-200 dark:bg-white/10 rounded mb-2" />
        <div className="h-4 w-64 bg-slate-200 dark:bg-white/10 rounded" />
      </section>
      <div className="flex-1 space-y-4">
        <div className="panel p-5 space-y-3">
          <div className="h-5 w-40 bg-slate-200 dark:bg-white/10 rounded" />
          <div className="h-4 w-full bg-slate-200 dark:bg-white/10 rounded" />
          <div className="h-4 w-3/4 bg-slate-200 dark:bg-white/10 rounded" />
          <div className="h-10 w-full bg-slate-200 dark:bg-white/10 rounded mt-4" />
          <div className="h-10 w-full bg-slate-200 dark:bg-white/10 rounded" />
        </div>
        <div className="panel p-5 space-y-3">
          <div className="h-5 w-40 bg-slate-200 dark:bg-white/10 rounded" />
          <div className="h-10 w-full bg-slate-200 dark:bg-white/10 rounded mt-4" />
          <div className="h-10 w-full bg-slate-200 dark:bg-white/10 rounded" />
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div className="flex h-full flex-col overflow-hidden px-3 pt-4 sm:px-4 md:px-6">
      <section className="flex-none pb-4 sm:pb-6">
        <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">Settings</h2>
        <p className="mt-1 hidden text-sm text-muted sm:block">
          Manage your AI job agent configuration, connected integrations, and system preferences.
        </p>
      </section>

      <div className="flex-1 overflow-y-auto min-h-0 space-y-6 pb-20 custom-scrollbar">
        <Suspense fallback={<SettingsSkeleton />}>
          <GmailIntegrationPanel />
        </Suspense>
        <Suspense fallback={<SettingsSkeleton />}>
          <LlmSettingsPanel />
        </Suspense>
      </div>
    </div>
  );
}
