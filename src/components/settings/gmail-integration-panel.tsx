"use client";

import { useEffect, useState } from "react";
import { Mail, ShieldCheck, MailWarning, RefreshCw, Unplug, CheckCircle2, Key, ChevronDown, ChevronUp, Save } from "lucide-react";
import { useSearchParams } from "next/navigation";

type SyncStatus = "IDLE" | "SYNCING" | "ERROR";

type GmailStatus = {
  connected: boolean;
  email?: string;
  status?: string;
  syncStatus?: SyncStatus;
  lastSyncedAt?: string;
  syncError?: string;
};

type ApiConfig = {
  googleClientId: string;
  googleClientSecret: string;
  autoMatch: boolean;
  draftFirstMode: boolean;
};

export function GmailIntegrationPanel() {
  const [status, setStatus] = useState<GmailStatus | null>(null);
  const [config, setConfig] = useState<ApiConfig>({
    googleClientId: "",
    googleClientSecret: "",
    autoMatch: true,
    draftFirstMode: true,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showApiConfig, setShowApiConfig] = useState(false);
  const searchParams = useSearchParams();
  const errorParam = searchParams?.get("error");
  const successParam = searchParams?.get("success");

  useEffect(() => {
    async function fetchData() {
      try {
        const [statusRes, configRes] = await Promise.all([
          fetch("/api/integrations/gmail/status"),
          fetch("/api/integrations/gmail/settings")
        ]);

        if (statusRes.ok) setStatus(await statusRes.json());
        if (configRes.ok) setConfig(await configRes.json());
      } catch (err) {
        console.error("Failed to fetch Gmail data", err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, []);

  async function handleSaveConfig() {
    setIsSaving(true);
    try {
      const res = await fetch("/api/integrations/gmail/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        // Optionially show a toast or message
      }
    } catch (err) {
      console.error("Failed to save config", err);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDisconnect() {
    setIsLoading(true);
    try {
      const res = await fetch("/api/integrations/gmail/disconnect", { method: "POST" });
      if (res.ok) {
        setStatus({ connected: false });
      }
    } catch (err) {
      console.error("Failed to disconnect Gmail", err);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSync() {
    setIsLoading(true);
    try {
      const syncRes = await fetch("/api/integrations/gmail/sync", { method: "POST" });
      const syncData = await syncRes.json();
      
      const res = await fetch("/api/integrations/gmail/status");
      if (res.ok) {
        const newStatus = await res.json();
        setStatus(newStatus);
      }
    } catch (err) {
      console.error("Sync failed:", err);
      // Try to reload status anyway
      try {
        const res = await fetch("/api/integrations/gmail/status");
        if (res.ok) setStatus(await res.json());
      } catch {}
    } finally {
      setIsLoading(false);
    }
  }

  if (isLoading) {
    return (
      <section className="panel p-6 animate-pulse">
        <div className="h-6 w-48 rounded bg-white/60 mb-4" />
        <div className="h-4 w-96 rounded bg-white/50 mb-6" />
        <div className="h-20 w-full rounded-lg bg-white/40" />
      </section>
    );
  }

  const isConnected = status?.connected;

  return (
    <section className="panel p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold flex items-center gap-2">
            <Mail className="h-6 w-6 text-accent" />
            Gmail Integration
          </h2>
          <p className="mt-1 text-sm text-muted">
            Connect your Gmail account to automatically track recruiter emails, generate follow-up drafts, and view communication timelines securely.
          </p>
        </div>
      </div>

      {errorParam && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-danger/50 bg-danger/10 p-3 text-sm text-danger">
          <MailWarning className="h-4 w-4" />
          <span>Integration Error: {errorParam === "ConfigurationMissing" ? "Google API Credentials not found. Please add them below." : errorParam}</span>
        </div>
      )}

      {/* API Configuration Manual Entry */}
      <div className="mt-4 overflow-hidden rounded-xl border border-white/20 bg-bg/40 backdrop-blur-md transition-all">
        <button 
          onClick={() => setShowApiConfig(!showApiConfig)}
          className="flex w-full items-center justify-between p-4 text-left hover:bg-white/5"
        >
          <div className="flex items-center gap-3">
            <Key className="h-5 w-5 text-accent" />
            <span className="font-bold">API Configuration (Developer Setup)</span>
          </div>
          {showApiConfig ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        
        {showApiConfig && (
          <div className="border-t border-white/10 p-4 space-y-4">
            <p className="text-xs text-muted">Paste your Google OAuth Client credentials here. Use <code className="bg-slate-800 px-1 rounded text-accent">http://127.0.0.1:3000/api/integrations/gmail/callback</code> as your redirect URI in Google Cloud Console.</p>
            
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted">Client ID</label>
                <input 
                  type="text" 
                  value={config.googleClientId}
                  onChange={(e) => setConfig({ ...config, googleClientId: e.target.value })}
                  placeholder="xxxx-xxxx.apps.googleusercontent.com"
                  className="w-full rounded-lg border border-white/20 bg-slate-900/50 p-2.5 text-sm font-mono focus:border-accent focus:ring-1 focus:ring-accent"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted">Client Secret</label>
                <input 
                  type="password" 
                  value={config.googleClientSecret}
                  onChange={(e) => setConfig({ ...config, googleClientSecret: e.target.value })}
                  placeholder="GOCSPX-xxxxxxxx"
                  className="w-full rounded-lg border border-white/20 bg-slate-900/50 p-2.5 text-sm font-mono focus:border-accent focus:ring-1 focus:ring-accent"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button 
                onClick={handleSaveConfig}
                disabled={isSaving}
                className="rounded-lg bg-glass px-4 py-2 text-sm font-bold flex items-center gap-2 hover:bg-bg/60 disabled:opacity-50"
              >
                {isSaving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save API Config
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 rounded-xl border bg-bg p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-4">
          <div className={`flex h-12 w-12 items-center justify-center rounded-full ${isConnected ? "bg-accent/20 text-accent ring-4 ring-accent/10" : "bg-slate-200 text-slate-500"}`}>
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h3 className="font-bold text-lg">{isConnected ? "Connected to Gmail" : "Not Connected"}</h3>
            {isConnected ? (
              <div className="space-y-1">
                <p className="text-sm text-muted flex items-center gap-2">
                  <span className="font-medium">{status.email}</span>
                  <span>•</span>
                  <span className={`capitalize font-bold ${status.syncStatus === "ERROR" ? "text-danger" : "text-accent"}`}>
                    {status.syncStatus?.toLowerCase() || "Idle"}
                  </span>
                </p>
                {status.syncStatus === "ERROR" && status.syncError && (
                  <p className="text-[10px] text-danger/80 font-mono bg-danger/5 p-1 px-2 rounded border border-danger/20 max-w-md truncate" title={status.syncError}>
                    Error: {status.syncError}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted">Secure read-only and draft-only access to synchronize job threads.</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isConnected ? (
            <>
              <button onClick={handleSync} disabled={status.syncStatus === "SYNCING"} className="rounded-lg border bg-panel px-4 py-2 text-sm font-semibold flex items-center gap-2 hover:bg-bg disabled:opacity-50 transition-all">
                <RefreshCw className={`h-4 w-4 ${status.syncStatus === "SYNCING" ? "animate-spin" : ""}`} />
                {status.syncStatus === "SYNCING" ? "Syncing..." : "Sync Now"}
              </button>
              <button onClick={handleDisconnect} className="rounded-lg border border-danger/50 text-danger px-4 py-2 text-sm font-semibold flex items-center gap-2 hover:bg-danger/10 transition-all">
                <Unplug className="h-4 w-4" />
                Disconnect
              </button>
            </>
          ) : (
            <a href="/api/integrations/gmail/connect" className="rounded-lg bg-accent px-6 py-2.5 text-sm font-bold text-white shadow-lg hover:shadow-accent/40 hover:-translate-y-0.5 transition-all flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Connect Gmail
            </a>
          )}
        </div>
      </div>

      {isConnected && (
        <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <label className="inline-flex cursor-pointer items-center gap-3 rounded-lg border bg-bg/20 px-4 py-3 text-sm hover:border-accent/40 transition-colors">
            <input 
              type="checkbox" 
              checked={config.autoMatch} 
              onChange={(e) => {
                const newConfig = { ...config, autoMatch: e.target.checked };
                setConfig(newConfig);
                // Trigger auto-save for simple toggles
                fetch("/api/integrations/gmail/settings", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(newConfig),
                });
              }}
              className="h-4 w-4 rounded border-slate-300 text-accent focus:ring-accent" 
            />
            <div className="space-y-0.5">
              <span className="block font-bold">Auto-attach Threads</span>
              <span className="block text-xs text-muted">Link job emails automatically</span>
            </div>
          </label>
          <label className="inline-flex cursor-pointer items-center gap-3 rounded-lg border bg-bg/20 px-4 py-3 text-sm hover:border-accent/40 transition-colors">
            <input 
              type="checkbox" 
              checked={config.draftFirstMode} 
              onChange={(e) => {
                const newConfig = { ...config, draftFirstMode: e.target.checked };
                setConfig(newConfig);
                fetch("/api/integrations/gmail/settings", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(newConfig),
                });
              }}
              className="h-4 w-4 rounded border-slate-300 text-accent focus:ring-accent" 
            />
            <div className="space-y-0.5">
              <span className="block font-bold">Draft-First Mode</span>
              <span className="block text-xs text-muted">Only generate drafts for review</span>
            </div>
          </label>
          <div className="rounded-lg border bg-bg/20 px-4 py-3 text-sm space-y-1">
            <span className="block font-bold text-muted uppercase text-[10px] tracking-widest">Last Synced</span>
            <span className="block font-mono text-xs text-accent">{status.lastSyncedAt ? new Date(status.lastSyncedAt).toLocaleString() : "Never"}</span>
          </div>
        </div>
      )}
    </section>
  );
}
