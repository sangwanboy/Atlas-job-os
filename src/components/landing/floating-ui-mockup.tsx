"use client";

import { motion } from "framer-motion";

const COMPANIES = ["GG", "MS", "AM", "AP", "LI"];

const PIPELINE_COLS = [
  { label: "Applied", jobs: ["Stripe", "Linear"] },
  { label: "Interview", jobs: ["Vercel"] },
  { label: "Offer", jobs: ["Arc"] },
];

export function FloatingUiMockup() {
  return (
    <div className="relative h-[520px] w-full max-w-[440px] mx-auto">
      {/* Card 1 — Atlas is searching */}
      <motion.div
        className="absolute top-0 left-0 w-[320px] rounded-2xl border border-white/[0.12] bg-white/[0.06] p-4 shadow-2xl backdrop-blur-xl"
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="mb-3 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-sm font-semibold text-white/80">Atlas is searching...</span>
        </div>
        {/* Typing dots */}
        <div className="mb-3 flex gap-1">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="h-2 w-2 rounded-full bg-cyan-400/60"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
            />
          ))}
        </div>
        {/* Company chips */}
        <div className="flex gap-2">
          {COMPANIES.map((abbr) => (
            <div
              key={abbr}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/10 text-[9px] font-black text-white/60"
            >
              {abbr}
            </div>
          ))}
        </div>
      </motion.div>

      {/* Card 2 — Job score */}
      <motion.div
        className="absolute top-28 right-0 w-[280px] rounded-2xl border border-white/[0.12] bg-white/[0.07] p-4 shadow-2xl backdrop-blur-xl"
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 0.8 }}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-black text-white">Senior Engineer</p>
            <p className="mt-0.5 text-xs text-white/50">Stripe · Remote · £90k–£120k</p>
          </div>
          <span className="rounded-full border border-emerald-500/40 bg-emerald-500/20 px-2 py-0.5 text-xs font-black text-emerald-400">
            94%
          </span>
        </div>
        <div className="mt-3 h-1 w-full rounded-full bg-white/10">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400"
            initial={{ width: 0 }}
            animate={{ width: "94%" }}
            transition={{ duration: 1.2, delay: 1, ease: "easeOut" }}
          />
        </div>
        <p className="mt-2 text-[10px] text-white/40">CV match score · Updated 2m ago</p>
      </motion.div>

      {/* Card 3 — Pipeline kanban */}
      <motion.div
        className="absolute bottom-0 left-4 right-4 rounded-2xl border border-white/[0.10] bg-white/[0.05] p-4 shadow-2xl backdrop-blur-xl"
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 4.8, repeat: Infinity, ease: "easeInOut", delay: 1.6 }}
      >
        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-white/30">
          Pipeline
        </p>
        <div className="grid grid-cols-3 gap-2 text-xs">
          {PIPELINE_COLS.map((col) => (
            <div key={col.label}>
              <p className="mb-1.5 text-[10px] font-semibold text-white/40">
                {col.label} ({col.jobs.length})
              </p>
              {col.jobs.map((job) => (
                <div
                  key={job}
                  className="mb-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-white/70"
                >
                  {job}
                </div>
              ))}
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
