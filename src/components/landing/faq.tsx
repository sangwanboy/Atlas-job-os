"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

const FAQS = [
  {
    q: "How does Atlas find jobs?",
    a: "Atlas uses a real browser to search job boards exactly the way a human would \u2014 no API limitations. It searches LinkedIn, Indeed, Reed, TotalJobs, Adzuna, and CV-Library simultaneously, collecting and scoring listings that match your preferences.",
  },
  {
    q: "Is my CV and personal data safe?",
    a: "Your CV and profile data is stored securely in our encrypted database and is never shared with third parties. We also support PII redaction and admin-level security controls.",
  },
  {
    q: "What job platforms does Atlas search?",
    a: "Atlas currently searches 6 major UK job platforms: LinkedIn, Indeed, Reed, TotalJobs, Adzuna, and CV-Library. The list is continuously expanding. You can set platform preferences in your settings.",
  },
  {
    q: "How does Gmail outreach work?",
    a: "You connect your Gmail account via OAuth. Atlas drafts personalised cold outreach emails for top-scoring roles and queues them for your approval. You can review and edit each draft, or enable automatic sending.",
  },
  {
    q: "Can Atlas generate my CV?",
    a: "Yes! Atlas can generate professional DOCX CVs using your profile data. Choose from 3 UK-style templates \u2014 Classic (traditional single-column), Modern (two-column with colour accents), or ATS-Optimised (plain text for maximum parsability). Each is tailored to your target role.",
  },
  {
    q: "What is the Chrome extension?",
    a: "The Chrome/Edge extension lets Atlas use your real logged-in browser sessions. This means no bot detection, no auth walls, and access to jobs you\u2019d actually see when browsing manually. It connects via WebSocket and works in the background.",
  },
  {
    q: "What analytics does Atlas provide?",
    a: "Atlas includes a full analytics dashboard with job score distributions, application funnel tracking (Saved \u2192 Applied \u2192 Interview \u2192 Offer), source breakdowns by platform, outreach engagement metrics, and token usage monitoring.",
  },
  {
    q: "What happens after the 50-user beta?",
    a: "Early beta users keep full access. After 50 spots are taken, new users join a waitlist. We\u2019ll expand access in batches \u2014 beta testers get priority for any future pricing changes.",
  },
  {
    q: "How many jobs can Atlas find per session?",
    a: "It depends on your target role and location, but Atlas typically surfaces 20\u201380 new scored listings per session across all 6 platforms. The entire search completes in about 90 seconds.",
  },
  {
    q: "Do I need to leave my computer on?",
    a: "No. Atlas runs on our cloud servers. Set it up once and it works continuously \u2014 you just check in on your pipeline when you\u2019re ready.",
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
            transition={{ duration: 0.4, delay: i * 0.04 }}
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
