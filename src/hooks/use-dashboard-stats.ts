"use client";

import { useEffect, useState, useCallback } from "react";
import type { KpiMetric, DashboardTrendPoint } from "@/types/domain";

type DashboardStats = {
  kpiMetrics: KpiMetric[];
  weeklyTrend: DashboardTrendPoint[];
};

/* ── HMR-safe shared state via globalThis ── */
const GLOBAL_KEY = "__dashboardStats";

type SharedState = {
  cache: DashboardStats | null;
  listeners: Set<() => void>;
  intervalId: ReturnType<typeof setInterval> | null;
  fetching: boolean;
  lastError: string | null;
};

function getShared(): SharedState {
  const g = globalThis as any;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = { cache: null, listeners: new Set(), intervalId: null, fetching: false, lastError: null };
  }
  return g[GLOBAL_KEY];
}

async function fetchStats() {
  const shared = getShared();
  if (shared.fetching) return;          // prevent overlapping fetches
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return; // skip when tab hidden
  shared.fetching = true;
  try {
    const res = await fetch("/api/dashboard/stats");
    if (!res.ok) {
      shared.lastError = `Failed to load stats (${res.status})`;
      shared.listeners.forEach((cb) => cb());
      return;
    }
    const data = await res.json();
    shared.lastError = null;
    shared.cache = {
      kpiMetrics: data.kpiMetrics ?? [],
      weeklyTrend: data.weeklyTrend ?? [],
    };
    shared.listeners.forEach((cb) => cb());
  } catch (e) {
    shared.lastError = e instanceof Error ? e.message : "Network error";
    shared.listeners.forEach((cb) => cb());
  } finally {
    shared.fetching = false;
  }
}

const POLL_INTERVAL = 60_000; // 60s — dashboard stats don't need real-time updates

function startPolling() {
  const shared = getShared();
  // Clear any leaked interval before starting a new one
  if (shared.intervalId) clearInterval(shared.intervalId);
  shared.intervalId = setInterval(fetchStats, POLL_INTERVAL);
}

function stopPolling() {
  const shared = getShared();
  if (shared.intervalId) {
    clearInterval(shared.intervalId);
    shared.intervalId = null;
  }
}

export function useDashboardStats() {
  const shared = getShared();
  const [data, setData] = useState<DashboardStats | null>(shared.cache);
  const [loading, setLoading] = useState(shared.cache === null);
  const [error, setError] = useState<string | null>(shared.lastError);

  const refresh = useCallback(() => { void fetchStats(); }, []);

  useEffect(() => {
    const s = getShared();
    const update = () => {
      setError(s.lastError);
      if (s.cache) {
        setData({ ...s.cache });
        setLoading(false);
      } else if (s.lastError) {
        setLoading(false);
      }
    };

    s.listeners.add(update);

    // First subscriber starts polling
    if (s.listeners.size === 1) {
      void fetchStats();
      startPolling();
    } else if (s.cache) {
      update();
    }

    // Pause polling when tab is hidden, resume when visible
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void fetchStats();   // refresh on return
        startPolling();
      } else {
        stopPolling();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      s.listeners.delete(update);
      document.removeEventListener("visibilitychange", onVisibility);
      if (s.listeners.size === 0) {
        stopPolling();
      }
    };
  }, []);

  return { data, loading, error, refresh };
}
