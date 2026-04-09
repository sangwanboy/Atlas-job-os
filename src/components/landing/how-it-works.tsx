"use client";

import { motion } from "framer-motion";
import { FileText, Search, CheckCircle } from "lucide-react";

const STEPS = [
  {
    n: "01",
    icon: FileText,
    title: "Upload your CV",
    desc: "Atlas learns your skills, experience, and goals in seconds. Your profile becomes the scoring engine for every job it finds.",
  },
  {
    n: "02",
    icon: Search,
    title: "Agent searches 24/7",
    desc: "Set your preferences and let Atlas loose. It searches LinkedIn, Indeed, and 100+ boards continuously — scoring every role against your CV.",
  },
  {
    n: "03",
    icon: CheckCircle,
    title: "Review & approve outreach",
    desc: "Top matches land in your pipeline. Atlas drafts personalised Gmail outreach — you approve with one click, or it sends automatically.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-32 relative mx-auto max-w-7xl px-6">
      {/* Section header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="text-center"
      >
        <p className="text-xs font-bold uppercase tracking-widest text-cyan-400">How It Works</p>
        <h2 className="mt-3 text-4xl font-black text-white lg:text-5xl">
          Three steps. Zero effort.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lg text-white/50">
          From upload to interview in days, not months.
        </p>
      </motion.div>

      <div className="mt-16 relative">
        {/* Connector line — desktop */}
        <div className="hidden lg:block absolute top-10 left-[16%] right-[16%] h-px">
          <motion.div
            className="h-full bg-gradient-to-r from-cyan-500/0 via-cyan-500/30 to-cyan-500/0"
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.2, delay: 0.4 }}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.6, delay: i * 0.15 }}
                className="relative rounded-2xl border border-white/[0.08] bg-white/[0.04] p-8 backdrop-blur"
              >
                <p className="text-6xl font-black text-white/10">{step.n}</p>
                <div className="mt-4 w-fit rounded-xl border border-cyan-500/25 bg-cyan-500/15 p-3">
                  <Icon className="h-5 w-5 text-cyan-400" />
                </div>
                <h3 className="mt-4 text-lg font-bold text-white">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/50">{step.desc}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
