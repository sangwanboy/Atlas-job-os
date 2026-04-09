"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";

interface LandingNavProps {
  slotsRemaining: number;
  isWaitlist: boolean;
}

export function LandingNav({ slotsRemaining: _slotsRemaining, isWaitlist }: LandingNavProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { scrollY } = useScroll();
  const bgOpacity = useTransform(scrollY, [0, 80], [0, 0.9]);
  const borderOpacity = useTransform(scrollY, [0, 80], [0, 0.12]);

  return (
    <>
      <motion.header
        className="fixed inset-x-0 top-0 z-50 backdrop-blur-md"
        style={{
          backgroundColor: bgOpacity.get() > 0 ? `rgba(13,17,28,${bgOpacity})` : "transparent",
          borderBottom: `1px solid rgba(255,255,255,${borderOpacity})`,
        }}
      >
        <motion.div
          style={{ backgroundColor: `rgba(13,17,28,${bgOpacity})` }}
          className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4"
        >
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl font-black text-white tracking-tight">Atlas</span>
            <span className="rounded-full border border-cyan-500/40 bg-cyan-500/15 px-2 py-0.5 text-[10px] font-bold tracking-widest text-cyan-400">
              BETA
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-8 md:flex">
            <a href="#how-it-works" className="text-sm text-white/50 hover:text-white transition-colors">
              How it works
            </a>
            <a href="#features" className="text-sm text-white/50 hover:text-white transition-colors">
              Features
            </a>
            <a href="#faq" className="text-sm text-white/50 hover:text-white transition-colors">
              FAQ
            </a>
          </nav>

          {/* Desktop CTAs */}
          <div className="hidden items-center gap-3 md:flex">
            <Link
              href="/login"
              className="text-sm font-semibold text-white/60 hover:text-white transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-600 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-cyan-500/20 hover:brightness-110 transition-all"
            >
              {isWaitlist ? "Join Waitlist" : "Get Early Access"}
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="rounded-lg border border-white/10 bg-white/5 p-2 text-white/60 md:hidden"
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </motion.div>
      </motion.header>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-x-0 top-[65px] z-40 border-b border-white/[0.08] bg-[rgba(13,17,28,0.97)] backdrop-blur-xl md:hidden"
          >
            <nav className="flex flex-col gap-1 px-6 py-4">
              {["#how-it-works", "#features", "#faq"].map((href, i) => (
                <a
                  key={href}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-xl px-3 py-3 text-sm font-semibold text-white/60 hover:bg-white/5 hover:text-white transition-colors"
                >
                  {["How it works", "Features", "FAQ"][i]}
                </a>
              ))}
              <div className="mt-2 border-t border-white/[0.08] pt-3 flex flex-col gap-2">
                <Link
                  href="/login"
                  onClick={() => setMobileOpen(false)}
                  className="rounded-xl border border-white/10 px-4 py-3 text-center text-sm font-semibold text-white/60"
                >
                  Sign In
                </Link>
                <Link
                  href="/register"
                  onClick={() => setMobileOpen(false)}
                  className="rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-600 px-4 py-3 text-center text-sm font-bold text-white"
                >
                  {isWaitlist ? "Join Waitlist" : "Get Early Access"}
                </Link>
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
