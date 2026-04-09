"use client";

import { useEffect, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useDashboardStats } from "@/hooks/use-dashboard-stats";

export function WeeklyTrendChart() {
  const [isMounted, setIsMounted] = useState(false);
  const { data: stats, loading } = useDashboardStats();
  const data = stats?.weeklyTrend ?? [];

  useEffect(() => { setIsMounted(true); }, []);

  return (
    <div className="panel p-5 glass-panel">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold">Weekly Funnel Trend</h2>
          <p className="text-sm text-slate-500">Jobs saved, applications, and interviews across the last 7 days.</p>
        </div>
        <div className="flex flex-wrap gap-3 text-xs font-medium">
          <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-violet-500" />Saved</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-blue-500" />Applied</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />Interviews</span>
        </div>
      </div>
      <div className="h-[280px] w-full">
        {(!isMounted || loading) && (
          <div className="h-full w-full animate-pulse rounded-xl bg-slate-100 dark:bg-white/5" />
        )}
        {isMounted && !loading && data.length < 2 && (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            Not enough data to display a trend yet.
          </div>
        )}
        {isMounted && !loading && data.length >= 2 && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ left: -20, right: 10, top: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="gradSaved" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradApplied" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradInterviews" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.1)" />
              <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  borderRadius: '12px',
                  border: 'none',
                  boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
                  backgroundColor: 'rgba(255,255,255,0.9)',
                  backdropFilter: 'blur(8px)'
                }}
              />
              <Area type="monotone" dataKey="saved" name="Saved" stroke="#8b5cf6" fill="url(#gradSaved)" strokeWidth={2} animationDuration={1500} />
              <Area type="monotone" dataKey="applied" name="Applied" stroke="#3b82f6" fill="url(#gradApplied)" strokeWidth={2} animationDuration={1500} />
              <Area type="monotone" dataKey="interviews" name="Interviews" stroke="#10b981" fill="url(#gradInterviews)" strokeWidth={2} animationDuration={1500} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

    </div>
  );
}
