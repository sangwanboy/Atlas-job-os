"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { useDashboardStats } from "@/hooks/use-dashboard-stats";

function TrendIcon({ trend }: { trend: "up" | "down" | "flat" }) {
  if (trend === "up") {
    return <ArrowUpRight className="h-4 w-4 text-emerald-500" />;
  }
  if (trend === "down") {
    return <ArrowDownRight className="h-4 w-4 text-rose-500" />;
  }
  return <Minus className="h-4 w-4 text-slate-400" />;
}

export function OverviewKpis() {
  const { data, loading, error } = useDashboardStats();
  const metrics = data?.kpiMetrics ?? [];

  if (error) {
    return (
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="kpi-card glass-panel col-span-full text-center text-sm text-rose-500 py-6">
          Unable to load metrics. Please refresh the page.
        </article>
      </section>
    );
  }

  if (loading && metrics.length === 0) {
    return (
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <article key={i} className="kpi-card animate-pulse bg-white/50 dark:bg-white/5 h-24" />
        ))}
      </section>
    );
  }

  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <article key={metric.label} className="kpi-card glass-panel hover:scale-[1.02] transition-transform duration-300">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{metric.label}</p>
          <div className="mt-2 flex items-end justify-between">
            <p className="text-3xl font-black tracking-tighter text-slate-900 dark:text-slate-100">{metric.value ?? "—"}</p>
            <div className="flex items-center gap-1 text-sm font-bold bg-white/80 dark:bg-white/10 px-2 py-0.5 rounded-full shadow-sm">
              <TrendIcon trend={metric.trend ?? "flat"} />
              <span className={metric.trend === 'up' ? 'text-emerald-600 dark:text-emerald-400' : metric.trend === 'down' ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'}>
                {metric.delta ?? "—"}
              </span>
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}
