"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { GradientMesh } from "./gradient-mesh";
import { BetaCounter } from "./beta-counter";

interface FooterCtaProps {
  slotsRemaining: number;
  isWaitlist: boolean;
}

export function FooterCta({ slotsRemaining, isWaitlist }: FooterCtaProps) {
  return (
    <footer className="relative">
      {/* CTA block */}
      <section className="relative overflow-hidden py-32 text-center">
        <GradientMesh />
        <div className="relative z-10 mx-auto max-w-3xl px-6">
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-xs font-bold uppercase tracking-widest text-cyan-400"
          >
            Ready to start?
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="mt-4 text-4xl font-black text-white lg:text-5xl xl:text-6xl"
          >
            Let AI find your
            <br />
            <span className="bg-gradient-to-r from-cyan-400 to-cyan-300 bg-clip-text text-transparent">
              next job.
            </span>
          </motion.h2>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="mt-8 flex flex-col items-center gap-4"
          >
            <BetaCounter slotsRemaining={slotsRemaining} isWaitlist={isWaitlist} />
            <Link
              href="/register"
              className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-600 px-8 py-4 text-base font-bold text-white shadow-xl shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:brightness-110 transition-all mt-2"
            >
              {isWaitlist ? "Join the Waitlist" : "Claim Your Beta Spot"}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <p className="text-xs text-white/30">
              No credit card required · Free beta access
            </p>
          </motion.div>
        </div>
      </section>

      {/* Footer strip */}
      <div className="border-t border-white/[0.08] bg-[rgba(13,17,28,0.6)] backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
          <div className="flex items-center gap-2">
            <span className="text-base font-black text-white/70">Atlas</span>
            <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[9px] font-bold tracking-widest text-cyan-400">
              BETA
            </span>
            <span className="text-sm text-white/30">· Built with ❤️ in London</span>
          </div>
          <nav className="flex items-center gap-6">
            {[
              { label: "Features", href: "#features" },
              { label: "How it Works", href: "#how-it-works" },
              { label: "FAQ", href: "#faq" },
              { label: "Sign In", href: "/login" },
            ].map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-xs text-white/35 hover:text-white/70 transition-colors"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <p className="text-xs text-white/25">© 2026 Atlas Job OS</p>
        </div>
      </div>
    </footer>
  );
}
