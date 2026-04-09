"use client";

import { motion } from "framer-motion";
import { LayoutDashboard, BriefcaseBusiness, Bot, Megaphone } from "lucide-react";

const DEMO_JOBS = [
  { co: "Stripe", role: "Senior Engineer", score: 94, status: "Applied" },
  { co: "Vercel", role: "Staff Engineer", score: 91, status: "Interview" },
  { co: "Linear", role: "Backend Dev", score: 88, status: "Applied" },
  { co: "Figma", role: "Eng Manager", score: 82, status: "Saved" },
];

const NAV_ICONS = [LayoutDashboard, BriefcaseBusiness, Bot, Megaphone];

export function DemoPreview() {
  return (
    <section className="py-24 mx-auto max-w-7xl px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="text-center"
      >
        <p className="text-xs font-bold uppercase tracking-widest text-cyan-400">Live Preview</p>
        <h2 className="mt-3 text-4xl font-black text-white lg:text-5xl">See Atlas in action.</h2>
      </motion.div>

      <motion.div
        className="mt-12 overflow-hidden rounded-2xl ring-1 ring-white/[0.10] shadow-[0_0_80px_rgba(6,182,212,0.08)]"
        initial={{ opacity: 0, scale: 0.96, y: 20 }}
        whileInView={{ opacity: 1, scale: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
      >
        {/* Browser chrome */}
        <div className="flex items-center gap-2 border-b border-white/[0.08] bg-white/[0.04] px-4 py-3">
          <span className="h-3 w-3 rounded-full bg-red-400/50" />
          <span className="h-3 w-3 rounded-full bg-yellow-400/50" />
          <span className="h-3 w-3 rounded-full bg-emerald-400/50" />
          <div className="ml-4 rounded-md bg-white/[0.06] px-4 py-1 text-xs text-white/30">
            app.atlas-job-os.com/dashboard
          </div>
        </div>

        {/* Dashboard content */}
        <div className="flex min-h-[360px] bg-[hsl(218_32%_10%)]">
          {/* Mini sidebar */}
          <div className="flex w-12 flex-col items-center gap-3 border-r border-white/[0.06] py-4">
            {NAV_ICONS.map((Icon, i) => (
              <div
                key={i}
                className={`rounded-xl p-2 ${i === 0 ? "bg-cyan-500/20 text-cyan-400" : "text-white/20"}`}
              >
                <Icon className="h-4 w-4" />
              </div>
            ))}
          </div>

          {/* Main area */}
          <div className="flex-1 p-6">
            {/* KPI row */}
            <div className="mb-6 grid grid-cols-3 gap-3">
              {[
                { label: "Jobs Found", value: "47", sub: "+12 today" },
                { label: "Scored >80%", value: "12", sub: "Top matches" },
                { label: "Outreach Sent", value: "3", sub: "Via Gmail" },
              ].map((kpi) => (
                <div
                  key={kpi.label}
                  className="rounded-xl border border-white/[0.07] bg-white/[0.04] p-3"
                >
                  <p className="text-[10px] text-white/40">{kpi.label}</p>
                  <p className="mt-1 text-xl font-black text-white">{kpi.value}</p>
                  <p className="text-[9px] text-cyan-400/60">{kpi.sub}</p>
                </div>
              ))}
            </div>

            {/* Jobs table */}
            <div className="overflow-hidden rounded-xl border border-white/[0.07]">
              <div className="grid grid-cols-4 bg-white/[0.03] px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-white/30">
                <span>Company</span>
                <span>Role</span>
                <span>Score</span>
                <span>Status</span>
              </div>
              {DEMO_JOBS.map((j, i) => (
                <div
                  key={i}
                  className="grid grid-cols-4 border-t border-white/[0.05] px-4 py-2.5 text-xs text-white/60"
                >
                  <span className="font-semibold text-white/80">{j.co}</span>
                  <span>{j.role}</span>
                  <span className="font-bold text-emerald-400">{j.score}%</span>
                  <span className="text-cyan-400">{j.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
