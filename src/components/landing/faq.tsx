"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

const FAQS = [
  {
    q: "How does Atlas find jobs?",
    a: "Atlas uses a real browser (Playwright) to search job boards exactly the way a human would — no API limitations. It searches LinkedIn, Indeed, Glassdoor, and many more, collecting listings that match your preferences.",
  },
  {
    q: "Is my CV and personal data safe?",
    a: "Your CV and profile data is stored securely in our encrypted database and is never shared with third parties. It's only used to score job listings against your experience.",
  },
  {
    q: "What job boards does Atlas search?",
    a: "Atlas searches LinkedIn, Indeed, Glassdoor, Reed, TotalJobs, and many more. The list is continuously expanding. You can set platform preferences in your settings.",
  },
  {
    q: "How does Gmail outreach work?",
    a: "You connect your Gmail account via OAuth. Atlas drafts personalised cold outreach emails for top-scoring roles and queues them for your approval. You can review and edit each draft, or enable automatic sending.",
  },
  {
    q: "What happens after the 50-user beta?",
    a: "Early beta users keep full access. After 50 spots are taken, new users join a waitlist. We'll expand access in batches — beta testers get priority for any future pricing changes.",
  },
  {
    q: "How many jobs can Atlas find per day?",
    a: "It depends on your target role and location, but Atlas typically surfaces 20–80 new scored listings per session. You control search frequency and the agent runs 24/7 in the background.",
  },
  {
    q: "Do I need to leave my computer on?",
    a: "No. Atlas runs on our cloud servers. Set it up once and it works continuously — you just check in on your pipeline when you're ready.",
  },
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section id="faq" className="py-24 mx-auto max-w-3xl px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="text-center"
      >
        <p className="text-xs font-bold uppercase tracking-widest text-cyan-400">FAQ</p>
        <h2 className="mt-3 text-4xl font-black text-white">Common questions.</h2>
      </motion.div>

      <div className="mt-10 space-y-2">
        {FAQS.map((item, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.4, delay: i * 0.05 }}
            className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur"
          >
            <button
              onClick={() => setOpen(open === i ? null : i)}
              className="flex w-full items-center justify-between px-6 py-4 text-left"
            >
              <span className="text-sm font-semibold text-white/85">{item.q}</span>
              <motion.div
                animate={{ rotate: open === i ? 180 : 0 }}
                transition={{ duration: 0.25 }}
                className="flex-none ml-4"
              >
                <ChevronDown className="h-4 w-4 text-white/40" />
              </motion.div>
            </button>

            <AnimatePresence>
              {open === i && (
                <motion.div
                  key="body"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.28, ease: "easeInOut" }}
                  className="overflow-hidden"
                >
                  <p className="px-6 pb-5 text-sm leading-relaxed text-white/50">{item.a}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
