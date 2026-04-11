"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, ChevronDown } from "lucide-react";
import { GradientMesh } from "./gradient-mesh";
import { BetaCounter } from "./beta-counter";
import { FloatingUiMockup } from "./floating-ui-mockup";

const PHRASES = [
  "finds your next job.",
  "scores every opportunity.",
  "sends outreach for you.",
  "manages your pipeline.",
  "generates your CV.",
  "searches 6 platforms at once.",
];

function useTypewriter(phrases: string[]) {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [displayed, setDisplayed] = useState("");
  const [erasing, setErasing] = useState(false);

  useEffect(() => {
    const current = phrases[phraseIndex];

    if (!erasing && charIndex < current.length) {
      const t = setTimeout(() => {
        setDisplayed(current.slice(0, charIndex + 1));
        setCharIndex((c) => c + 1);
      }, 42);
      return () => clearTimeout(t);
    }

    if (!erasing && charIndex === current.length) {
      const t = setTimeout(() => setErasing(true), 1800);
      return () => clearTimeout(t);
    }

    if (erasing && charIndex > 0) {
      const t = setTimeout(() => {
        setDisplayed(current.slice(0, charIndex - 1));
        setCharIndex((c) => c - 1);
      }, 22);
      return () => clearTimeout(t);
    }

    if (erasing && charIndex === 0) {
      setErasing(false);
      setPhraseIndex((i) => (i + 1) % phrases.length);
    }
  }, [charIndex, erasing, phraseIndex, phrases]);

  return displayed;
}

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] } },
};

interface HeroProps {
  slotsRemaining: number;
  isWaitlist: boolean;
}

export function Hero({ slotsRemaining, isWaitlist }: HeroProps) {
  const displayed = useTypewriter(PHRASES);

  return (
    <section className="relative flex min-h-screen items-center pt-20">
      <GradientMesh />

      <div className="relative z-10 mx-auto w-full max-w-7xl px-6 py-16 lg:grid lg:grid-cols-2 lg:items-center lg:gap-16">
        {/* Left — copy */}
        <motion.div variants={container} initial="hidden" animate="show">
          {/* Label */}
          <motion.div variants={fadeUp}>
            <span className="inline-flex items-center gap-2 rounded-full border border-cyan-500/25 bg-cyan-500/10 px-3 py-1.5 text-xs font-bold tracking-widest text-cyan-400">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
              AI-Powered Job Search Agent
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            variants={fadeUp}
            className="mt-6 text-5xl font-black leading-[1.08] tracking-tight text-white lg:text-6xl xl:text-7xl"
          >
            Your AI agent that{" "}
            <br className="hidden sm:block" />
            <span className="bg-gradient-to-r from-cyan-400 to-cyan-300 bg-clip-text text-transparent">
              {displayed}
              <span className="animate-blink text-cyan-400">|</span>
            </span>
          </motion.h1>

          {/* Subhead */}
          <motion.p
            variants={fadeUp}
            className="mt-6 max-w-lg text-lg leading-relaxed text-white/55"
          >
            Atlas autonomously searches LinkedIn, Indeed, Reed, TotalJobs, Adzuna &amp; CV-Library,
            scores each role against your CV, generates tailored CVs, and handles outreach
            via Gmail — while you focus on what matters.
          </motion.p>

          {/* Beta counter */}
          <motion.div variants={fadeUp} className="mt-8">
            <BetaCounter slotsRemaining={slotsRemaining} isWaitlist={isWaitlist} />
          </motion.div>

          {/* CTAs */}
          <motion.div variants={fadeUp} className="mt-6 flex flex-wrap items-center gap-4">
            <Link
              href="/register"
              className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-600 px-6 py-3.5 text-base font-bold text-white shadow-xl shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:brightness-110 transition-all"
            >
              {isWaitlist ? "Join Waitlist" : "Claim Your Spot"}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href="/login"
              className="text-sm font-semibold text-white/50 hover:text-white transition-colors"
            >
              Already have an account →
            </Link>
          </motion.div>

          {/* Social trust */}
          <motion.p variants={fadeUp} className="mt-6 text-xs text-white/30">
            No credit card required · Free beta access · Cancel anytime
          </motion.p>
        </motion.div>

        {/* Right — floating mockup (desktop only) */}
        <div className="hidden lg:block">
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.9, delay: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <FloatingUiMockup />
          </motion.div>
        </div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2 }}
      >
        <span className="text-[10px] font-semibold uppercase tracking-widest text-white/25">
          Scroll
        </span>
        <motion.div
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        >
          <ChevronDown className="h-4 w-4 text-white/25" />
        </motion.div>
      </motion.div>
    </section>
  );
}
