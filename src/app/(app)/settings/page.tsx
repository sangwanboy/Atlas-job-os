import { Suspense } from "react";
import { LlmSettingsPanel } from "@/components/settings/llm-settings-panel";
import { GmailIntegrationPanel } from "@/components/settings/gmail-integration-panel";

function SettingsSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden animate-pulse">
      <section className="flex-none pb-6">
        <div className="h-8 w-32 bg-slate-200 rounded mb-2" />
        <div className="h-4 w-64 bg-slate-200 rounded" />
      </section>
      <div className="flex-1 space-y-4">
        <div className="panel p-5 space-y-3">
          <div className="h-5 w-40 bg-slate-200 rounded" />
          <div className="h-4 w-full bg-slate-200 rounded" />
          <div className="h-4 w-3/4 bg-slate-200 rounded" />
          <div className="h-10 w-full bg-slate-200 rounded mt-4" />
          <div className="h-10 w-full bg-slate-200 rounded" />
        </div>
        <div className="panel p-5 space-y-3">
          <div className="h-5 w-40 bg-slate-200 rounded" />
          <div className="h-10 w-full bg-slate-200 rounded mt-4" />
          <div className="h-10 w-full bg-slate-200 rounded" />
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <section className="flex-none pb-6">
        <h2 className="text-2xl font-extrabold tracking-tight">Settings</h2>
        <p className="mt-1 text-sm text-muted">
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
