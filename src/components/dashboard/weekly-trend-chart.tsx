"use client";

import { useEffect, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DashboardTrendPoint } from "@/types/domain";

export function WeeklyTrendChart() {
  const [isMounted, setIsMounted] = useState(false);
  const [data, setData] = useState<DashboardTrendPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTrend = async () => {
    try {
      const res = await fetch("/api/dashboard/stats");
      const json = await res.json();
      if (json.weeklyTrend) {
        setData(json.weeklyTrend);
      }
    } catch (err) {
      console.error("Failed to fetch trend:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { 
    setIsMounted(true); 
    fetchTrend();
    const interval = setInterval(fetchTrend, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="panel p-5 glass-panel">
      <div className="mb-5">
        <h2 className="text-lg font-bold">Weekly Funnel Trend</h2>
        <p className="text-sm text-slate-500">Applications, replies, and interviews across the last 7 days.</p>
      </div>
      <div className="h-[300px] w-full">
        {isMounted && !loading && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ left: -20, right: 10, top: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="applied" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="interviews" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.1)" />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 12, fill: '#64748b' }} 
                tickLine={false} 
                axisLine={false} 
              />
              <YAxis 
                tick={{ fontSize: 12, fill: '#64748b' }} 
                tickLine={false} 
                axisLine={false} 
              />
              <Tooltip 
                contentStyle={{ 
                  borderRadius: '12px', 
                  border: 'none', 
                  boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
                  backgroundColor: 'rgba(255,255,255,0.9)',
                  backdropFilter: 'blur(8px)'
                }} 
              />
              <Area 
                type="monotone" 
                dataKey="applied" 
                stroke="#3b82f6" 
                fill="url(#applied)" 
                strokeWidth={3} 
                animationDuration={1500}
              />
              <Area 
                type="monotone" 
                dataKey="interviews" 
                stroke="#10b981" 
                fill="url(#interviews)" 
                strokeWidth={3} 
                animationDuration={1500}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
