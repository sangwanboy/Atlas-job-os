"use client";

import { useEffect, useState } from "react";
import { LandingNav } from "./nav";
import { Hero } from "./hero";
import { SocialProof } from "./social-proof";
import { HowItWorks } from "./how-it-works";
import { Features } from "./features";
import { DemoPreview } from "./demo-preview";
import { Faq } from "./faq";
import { FooterCta } from "./footer-cta";

const SLOTS_TOTAL = 50;

interface LandingPageProps {
  initialSlotsUsed: number;
}

export function LandingPage({ initialSlotsUsed }: LandingPageProps) {
  const [slotsUsed, setSlotsUsed] = useState(initialSlotsUsed);
  const slotsRemaining = Math.max(0, SLOTS_TOTAL - slotsUsed);
  const isWaitlist = slotsRemaining === 0;

  useEffect(() => {
    async function refresh() {
      try {
        const res = await fetch("/api/beta-slots");
        if (res.ok) {
          const data = (await res.json()) as { slotsUsed: number };
          setSlotsUsed(data.slotsUsed);
        }
      } catch {
        // Graceful degradation
      }
    }

    // Refresh once after mount, then every 60s
    void refresh();
    const interval = setInterval(() => void refresh(), 60_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[hsl(218_32%_8%)] font-sans text-white">
      <LandingNav slotsRemaining={slotsRemaining} isWaitlist={isWaitlist} />
      <Hero slotsRemaining={slotsRemaining} isWaitlist={isWaitlist} />
      <SocialProof />
      <HowItWorks />
      <Features />
      <DemoPreview />
      <Faq />
      <FooterCta slotsRemaining={slotsRemaining} isWaitlist={isWaitlist} />
    </div>
  );
}
