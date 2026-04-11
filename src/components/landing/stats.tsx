"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import { Globe, FileText, Zap, Clock } from "lucide-react";

const STATS = [
  {
    icon: Globe,
    value: "6",
    label: "Job Platforms",
    sub: "Searched simultaneously",
    color: "text-cyan-400",
    bg: "bg-cyan-500/15",
    border: "border-cyan-500/25",
  },
  {
    icon: FileText,
    value: "3",
    label: "CV Templates",
    sub: "Classic, Modern & ATS",
    color: "text-violet-400",
    bg: "bg-violet-500/15",
    border: "border-violet-500/25",
  },
  {
    icon: Zap,
    value: "~90s",
    label: "Search Time",
    sub: "All 6 platforms combined",
    color: "text-amber-400",
    bg: "bg-amber-500/15",
    border: "border-amber-500/25",
  },
  {
    icon: Clock,
    value: "24/7",
    label: "Always On",
    sub: "Cloud-hosted agent",
    color: "text-emerald-400",
    bg: "bg-emerald-500/15",
    border: "border-emerald-500/25",
  },
];

function AnimatedNumber({ value, inView }: { value: string; inView: boolean }) {
  const isNumeric = /^\d+$/.test(value);
  const [displayed, setDisplayed] = useState(isNumeric ? "0" : value);

  useEffect(() => {
    if (!inView || !isNumeric) return;
    const target = parseInt(value, 10);
    const duration = 1200;
    const steps = 30;
    const increment = target / steps;
    let current = 0;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      current = Math.min(Math.round(increment * step), target);
      setDisplayed(String(current));
      if (step >= steps) clearInterval(timer);
    }, duration / steps);

    return () => clearInterval(timer);
  }, [inView, value, isNumeric]);

  return <span>{displayed}</span>;
}

export function Stats() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section className="py-20 mx-auto max-w-7xl px-6" ref={ref}>
      <motion.div
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-80px" }}
        variants={{ show: { transition: { staggerChildren: 0.08 } } }}
      >
        {STATS.map((s) => {
          const Icon = s.icon;
          return (
            <motion.div
              key={s.label}
              variants={{
                hidden: { opacity: 0, y: 24 },
                show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
              }}
              className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.04] p-6 backdrop-blur text-center"
            >
              <div className={`mx-auto w-fit rounded-xl border ${s.border} ${s.bg} p-3 mb-4`}>
                <Icon className={`h-5 w-5 ${s.color}`} />
              </div>
              <p className={`text-4xl font-black ${s.color}`}>
                <AnimatedNumber value={s.value} inView={inView} />
              </p>
              <p className="mt-1 text-sm font-bold text-white/80">{s.label}</p>
              <p className="mt-0.5 text-xs text-white/40">{s.sub}</p>
            </motion.div>
          );
        })}
      </motion.div>
    </section>
  );
}
