"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

interface BetaCounterProps {
  slotsRemaining: number;
  isWaitlist: boolean;
  className?: string;
}

export function BetaCounter({ slotsRemaining, isWaitlist, className = "" }: BetaCounterProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className={`inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm ${className}`}>
        <span className="h-2 w-2 rounded-full bg-white/20" />
        <span className="text-white/40">—</span>
      </div>
    );
  }

  if (isWaitlist) {
    return (
      <div className={`inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm ${className}`}>
        <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
        <span className="text-amber-300 font-semibold">Waitlist · Beta slots full</span>
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-2 rounded-full border border-red-400/25 bg-red-500/10 px-4 py-2 text-sm ${className}`}>
      <span className="h-2 w-2 rounded-full bg-red-400 animate-pulse" />
      <span className="text-white/70">
        <motion.span
          key={slotsRemaining}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="font-bold text-white"
        >
          {slotsRemaining}
        </motion.span>
        {" "}of 50 beta spots remaining
      </span>
    </div>
  );
}
