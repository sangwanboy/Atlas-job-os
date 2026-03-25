"use client";

import { useEffect, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { KpiMetric } from "@/types/domain";

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
  const [metrics, setMetrics] = useState<KpiMetric[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/dashboard/stats");
      const data = await res.json();
      if (data.kpiMetrics) {
        setMetrics(data.kpiMetrics);
      }
    } catch (err) {
      console.error("Failed to fetch kpis:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    // Real-time sync at 30s interval as requested
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading && metrics.length === 0) {
    return (
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <article key={i} className="kpi-card animate-pulse bg-white/50 h-24" />
        ))}
      </section>
    );
  }

  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <article key={metric.label} className="kpi-card glass-panel hover:scale-[1.02] transition-transform duration-300">
          <p className="text-sm font-medium text-slate-500">{metric.label}</p>
          <div className="mt-2 flex items-end justify-between">
            <p className="text-3xl font-black tracking-tighter text-slate-900">{metric.value}</p>
            <div className="flex items-center gap-1 text-sm font-bold bg-white/80 px-2 py-0.5 rounded-full shadow-sm">
              <TrendIcon trend={metric.trend} />
              <span className={metric.trend === 'up' ? 'text-emerald-600' : metric.trend === 'down' ? 'text-rose-600' : 'text-slate-500'}>
                {metric.delta}
              </span>
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}
