"use client";

import { useEffect, useState } from "react";
import { Puzzle, X, RefreshCw } from "lucide-react";

type Status = "loading" | "connected" | "disconnected";

export function ExtensionBanner() {
  const [status, setStatus] = useState<Status>("loading");
  const [dismissed, setDismissed] = useState(false);
  const [checking, setChecking] = useState(false);

  const checkStatus = async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/extension/status");
      if (res.ok) {
        const data = await res.json();
        setStatus(data.connected ? "connected" : "disconnected");
      } else {
        setStatus("disconnected");
      }
    } catch {
      setStatus("disconnected");
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    void checkStatus();
    // Re-check every 30s
    const interval = setInterval(() => void checkStatus(), 30_000);
    return () => clearInterval(interval);
  }, []);

  // Auto-show again if it was dismissed but is still disconnected
  // Don't show if connected or loading
  if (status === "loading") return null;
  if (status === "connected") return null;

  if (dismissed) return null;

  return (
    <div className="mt-3 rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="shrink-0 rounded-lg bg-amber-100 dark:bg-amber-500/20 p-2">
          <Puzzle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              Chrome Extension Required
            </p>
            <button onClick={() => setDismissed(true)} className="text-amber-400/50 hover:text-amber-600 transition-colors">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="mt-1 text-xs text-amber-700/80 dark:text-amber-300/70 leading-relaxed">
            Atlas needs the Chrome extension to search jobs using your real browser. Without it, job search capabilities are limited.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <details className="text-xs">
              <summary className="cursor-pointer font-semibold text-amber-700 dark:text-amber-400 hover:underline">
                How to install
              </summary>
              <ol className="mt-2 ml-4 list-decimal space-y-1 text-amber-700/80 dark:text-amber-300/70">
                <li>Open Chrome and go to <code className="rounded bg-amber-100 dark:bg-amber-500/20 px-1 py-0.5">chrome://extensions</code></li>
                <li>Enable <strong>Developer mode</strong> (top-right toggle)</li>
                <li>Click <strong>Load unpacked</strong></li>
                <li>Select the <code className="rounded bg-amber-100 dark:bg-amber-500/20 px-1 py-0.5">chrome-extension</code> folder from the Atlas project</li>
                <li>Make sure the browser server is running (<code className="rounded bg-amber-100 dark:bg-amber-500/20 px-1 py-0.5">npm run browser-server</code>)</li>
                <li>Click the extension icon and verify it says <strong>Connected</strong></li>
              </ol>
            </details>
            <button
              onClick={() => void checkStatus()}
              disabled={checking}
              className="ml-auto flex items-center gap-1.5 rounded-lg border border-amber-300 dark:border-amber-500/40 bg-amber-100 dark:bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 transition hover:bg-amber-200 dark:hover:bg-amber-500/30 disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${checking ? "animate-spin" : ""}`} />
              {checking ? "Checking..." : "Re-check"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
