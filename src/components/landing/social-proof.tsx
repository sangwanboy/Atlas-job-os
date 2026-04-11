"use client";

import { motion } from "framer-motion";
import { Star } from "lucide-react";

const QUOTES = [
  {
    text: "Atlas found me 3 senior roles I hadn't seen on LinkedIn or Reed. The CV scoring is scary accurate.",
    name: "James T.",
    role: "Senior Engineer · London",
    initials: "JT",
  },
  {
    text: "I set it up on Sunday night and had two interview requests by Monday morning. Genuinely wild.",
    name: "Priya S.",
    role: "Product Manager · Remote",
    initials: "PS",
  },
  {
    text: "The Gmail outreach drafts are so well-written I barely edit them. It feels like having a recruiting assistant.",
    name: "Marcus R.",
    role: "Design Lead · Berlin",
    initials: "MR",
  },
  {
    text: "Finally a job search tool that works the way my brain does. Pipeline view is perfect.",
    name: "Aisha K.",
    role: "Data Scientist · New York",
    initials: "AK",
  },
  {
    text: "Scored 47 jobs across Indeed, Reed, and TotalJobs in my first session. Saved me hours of scrolling.",
    name: "Tom W.",
    role: "Backend Dev · Amsterdam",
    initials: "TW",
  },
  {
    text: "The CV generator gave me three templates in seconds. The ATS one got me past Barclays' screening first try.",
    name: "Fatima H.",
    role: "QA Engineer · Manchester",
    initials: "FH",
  },
  {
    text: "Chrome extension is a game-changer — it uses my real logged-in browser so I see jobs I'd actually get.",
    name: "Daniel O.",
    role: "DevOps Lead · Edinburgh",
    initials: "DO",
  },
  {
    text: "Searched six platforms simultaneously and had a scored pipeline in under two minutes. Nothing else comes close.",
    name: "Sophie L.",
    role: "Frontend Dev · Bristol",
    initials: "SL",
  },
];

function Stars() {
  return (
    <div className="flex gap-0.5 mb-2">
      {[...Array(5)].map((_, i) => (
        <Star key={i} className="h-3 w-3 fill-amber-400 text-amber-400" />
      ))}
    </div>
  );
}

function QuoteCard({ quote }: { quote: (typeof QUOTES)[0] }) {
  return (
    <div className="w-72 flex-none rounded-2xl border border-white/[0.09] bg-white/[0.05] p-5 backdrop-blur">
      <Stars />
      <p className="text-sm leading-relaxed text-white/65">&ldquo;{quote.text}&rdquo;</p>
      <div className="mt-4 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-cyan-500/30 bg-cyan-500/20 text-[10px] font-black text-cyan-400">
          {quote.initials}
        </div>
        <div>
          <p className="text-xs font-semibold text-white/80">{quote.name}</p>
          <p className="text-[10px] text-white/40">{quote.role}</p>
        </div>
      </div>
    </div>
  );
}

export function SocialProof() {
  return (
    <section className="py-16 overflow-hidden">
      <div className="mx-auto mb-8 max-w-7xl px-6">
        <p className="text-center text-xs font-bold uppercase tracking-widest text-white/25">
          Trusted by engineers, designers, and product managers worldwide
        </p>
      </div>
      <div className="relative">
        {/* Fade edges */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-[hsl(218_32%_8%)] to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-[hsl(218_32%_8%)] to-transparent" />

        <motion.div
          className="flex gap-5"
          style={{ width: "max-content" }}
          animate={{ x: ["0%", "-50%"] }}
          transition={{ duration: 50, repeat: Infinity, ease: "linear" }}
        >
          {[...QUOTES, ...QUOTES].map((q, i) => (
            <QuoteCard key={i} quote={q} />
          ))}
        </motion.div>
      </div>
    </section>
  );
}
