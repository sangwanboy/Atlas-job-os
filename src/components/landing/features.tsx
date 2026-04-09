"use client";

import { motion } from "framer-motion";
import { Search, Target, Mail, LayoutDashboard, Globe, Cpu } from "lucide-react";

const FEATURES = [
  {
    icon: Search,
    title: "Autonomous Job Search",
    desc: "Atlas searches LinkedIn, Indeed, Glassdoor, and 100+ platforms continuously — you never have to scroll job boards again.",
    color: "text-cyan-400",
    bg: "bg-cyan-500/15",
    border: "border-cyan-500/25",
  },
  {
    icon: Target,
    title: "CV Scoring & Matching",
    desc: "Every job gets scored 0–100% against your CV. Only the best opportunities bubble up, saving you from irrelevant noise.",
    color: "text-violet-400",
    bg: "bg-violet-500/15",
    border: "border-violet-500/25",
  },
  {
    icon: Mail,
    title: "Gmail Outreach",
    desc: "Atlas drafts personalised outreach emails via your Gmail. Review, approve, and send — or set it to fully automatic.",
    color: "text-emerald-400",
    bg: "bg-emerald-500/15",
    border: "border-emerald-500/25",
  },
  {
    icon: LayoutDashboard,
    title: "Pipeline Management",
    desc: "Track every application from discovery to offer in a clean kanban pipeline. Never lose track of where you stand.",
    color: "text-amber-400",
    bg: "bg-amber-500/15",
    border: "border-amber-500/25",
  },
  {
    icon: Globe,
    title: "Multi-Platform Search",
    desc: "Real browser-based search across all major job sites. No API rate limits, no artificial restrictions — just results.",
    color: "text-pink-400",
    bg: "bg-pink-500/15",
    border: "border-pink-500/25",
  },
  {
    icon: Cpu,
    title: "Token-Aware Agent",
    desc: "Atlas manages its own compute budget intelligently. Full transparency on usage with monthly caps you control.",
    color: "text-blue-400",
    bg: "bg-blue-500/15",
    border: "border-blue-500/25",
  },
];

const cardVariants = {
  hidden: { opacity: 0, y: 32 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55 } },
};

export function Features() {
  return (
    <section id="features" className="py-24 mx-auto max-w-7xl px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="text-center"
      >
        <p className="text-xs font-bold uppercase tracking-widest text-cyan-400">Features</p>
        <h2 className="mt-3 text-4xl font-black text-white lg:text-5xl">
          Everything you need to land the job.
        </h2>
      </motion.div>

      <motion.div
        className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-80px" }}
        variants={{ show: { transition: { staggerChildren: 0.07 } } }}
      >
        {FEATURES.map((f) => {
          const Icon = f.icon;
          return (
            <motion.div
              key={f.title}
              variants={cardVariants}
              className="group rounded-2xl border border-white/[0.08] bg-white/[0.04] p-6 backdrop-blur transition-colors hover:border-white/[0.14] hover:bg-white/[0.07]"
            >
              <div className={`w-fit rounded-xl border ${f.border} ${f.bg} p-3`}>
                <Icon className={`h-5 w-5 ${f.color}`} />
              </div>
              <h3 className="mt-4 text-base font-bold text-white">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/50">{f.desc}</p>
            </motion.div>
          );
        })}
      </motion.div>
    </section>
  );
}
