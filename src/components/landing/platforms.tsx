"use client";

import { motion } from "framer-motion";

const PLATFORMS = [
  { name: "LinkedIn", abbr: "Li" },
  { name: "Indeed", abbr: "In" },
  { name: "Reed", abbr: "Re" },
  { name: "TotalJobs", abbr: "TJ" },
  { name: "Adzuna", abbr: "Az" },
  { name: "CV-Library", abbr: "CV" },
];

export function Platforms() {
  return (
    <section id="platforms" className="py-16 mx-auto max-w-7xl px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="text-center"
      >
        <p className="text-xs font-bold uppercase tracking-widest text-cyan-400">
          Platform Coverage
        </p>
        <h2 className="mt-3 text-3xl font-black text-white lg:text-4xl">
          Searches 6 major UK job platforms simultaneously.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-white/45">
          Real browser-based search with no API limits. Atlas uses your Chrome extension or stealth
          Playwright to search exactly like a human — no bot detection, no restrictions.
        </p>
      </motion.div>

      <motion.div
        className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
        initial="hidden"
        whileInView="show"
        viewport={{ once: true }}
        variants={{ show: { transition: { staggerChildren: 0.06 } } }}
      >
        {PLATFORMS.map((p) => (
          <motion.div
            key={p.name}
            variants={{
              hidden: { opacity: 0, scale: 0.9 },
              show: { opacity: 1, scale: 1, transition: { duration: 0.4 } },
            }}
            className="group flex flex-col items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-5 backdrop-blur transition-all hover:border-cyan-500/25 hover:bg-cyan-500/[0.06]"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-sm font-black text-white/60 transition-colors group-hover:border-cyan-500/30 group-hover:text-cyan-400">
              {p.abbr}
            </div>
            <span className="text-sm font-semibold text-white/60 transition-colors group-hover:text-white/80">
              {p.name}
            </span>
          </motion.div>
        ))}
      </motion.div>

      {/* Subtle divider glow */}
      <div className="mx-auto mt-12 h-px w-2/3 bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent" />
    </section>
  );
}
