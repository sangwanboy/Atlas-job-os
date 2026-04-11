"use client";

import { motion } from "framer-motion";
import {
  Search,
  Target,
  Mail,
  LayoutDashboard,
  FileText,
  Chrome,
  BarChart3,
  Shield,
} from "lucide-react";

const FEATURES = [
  {
    icon: Search,
    title: "Autonomous Job Search",
    desc: "Atlas searches LinkedIn, Indeed, Reed, TotalJobs, Adzuna & CV-Library simultaneously — you never have to scroll job boards again.",
    color: "text-cyan-400",
    bg: "bg-cyan-500/15",
    border: "border-cyan-500/25",
  },
  {
    icon: Target,
    title: "CV Scoring & Matching",
    desc: "Every job gets scored 0\u2013100% against your CV. Only the best opportunities bubble up, saving you from irrelevant noise.",
    color: "text-violet-400",
    bg: "bg-violet-500/15",
    border: "border-violet-500/25",
  },
  {
    icon: FileText,
    title: "CV Generation",
    desc: "Generate professional DOCX CVs with 3 UK-style templates \u2014 Classic, Modern, and ATS-Optimised. Tailored to your target role.",
    color: "text-rose-400",
    bg: "bg-rose-500/15",
    border: "border-rose-500/25",
  },
  {
    icon: Mail,
    title: "Gmail Outreach",
    desc: "Atlas drafts personalised outreach emails via your Gmail. Review, approve, and send \u2014 or set it to fully automatic.",
    color: "text-emerald-400",
    bg: "bg-emerald-500/15",
    border: "border-emerald-500/25",
  },
  {
    icon: LayoutDashboard,
    title: "Pipeline Management",
    desc: "Track every application from discovery to offer in a clean pipeline. Filter, sort, add notes \u2014 never lose track.",
    color: "text-amber-400",
    bg: "bg-amber-500/15",
    border: "border-amber-500/25",
  },
  {
    icon: Chrome,
    title: "Chrome Extension",
    desc: "Uses your real logged-in browser via a Chrome/Edge extension. No bot detection, no auth walls \u2014 see jobs you\u2019d actually get.",
    color: "text-blue-400",
    bg: "bg-blue-500/15",
    border: "border-blue-500/25",
  },
  {
    icon: BarChart3,
    title: "Analytics Dashboard",
    desc: "Score distributions, application funnels, source breakdowns, and outreach metrics \u2014 full visibility into your job search.",
    color: "text-pink-400",
    bg: "bg-pink-500/15",
    border: "border-pink-500/25",
  },
  {
    icon: Shield,
    title: "Privacy & Security",
    desc: "Your CV and data are encrypted and never shared. Cloud-hosted with admin controls, rate limiting, and PII redaction.",
    color: "text-teal-400",
    bg: "bg-teal-500/15",
    border: "border-teal-500/25",
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
        <p className="mx-auto mt-4 max-w-xl text-base text-white/45">
          From autonomous search to CV generation, pipeline tracking to Gmail outreach — Atlas handles the entire job hunt.
        </p>
      </motion.div>

      <motion.div
        className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-80px" }}
        variants={{ show: { transition: { staggerChildren: 0.06 } } }}
      >
        {FEATURES.map((f) => {
          const Icon = f.icon;
          return (
            <motion.div
              key={f.title}
              variants={cardVariants}
              className="group rounded-2xl border border-white/[0.08] bg-white/[0.04] p-6 backdrop-blur transition-all hover:border-white/[0.14] hover:bg-white/[0.07] hover:-translate-y-0.5"
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
