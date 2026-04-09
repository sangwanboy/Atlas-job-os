import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "hsl(var(--bg))",
        panel: "hsl(var(--panel))",
        border: "hsl(var(--border))",
        text: "hsl(var(--text))",
        muted: "hsl(var(--muted))",
        accent: "hsl(var(--accent))",
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        danger: "hsl(var(--danger))"
      },
      boxShadow: {
        panel: "0 8px 30px rgba(0, 0, 0, 0.08)",
      },
      borderRadius: {
        xl: "1rem",
      },
      fontFamily: {
        sans: ["Manrope", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      keyframes: {
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
        blob1: {
          "0%, 100%": { transform: "translate(0,0) scale(1)" },
          "33%": { transform: "translate(60px,-40px) scale(1.08)" },
          "66%": { transform: "translate(-30px,25px) scale(0.96)" },
        },
        blob2: {
          "0%, 100%": { transform: "translate(0,0) scale(1)" },
          "40%": { transform: "translate(-50px,30px) scale(1.12)" },
          "70%": { transform: "translate(35px,-20px) scale(0.94)" },
        },
        blob3: {
          "0%, 100%": { transform: "translate(0,0) scale(1)" },
          "25%": { transform: "translate(30px,50px) scale(1.05)" },
          "75%": { transform: "translate(-40px,-30px) scale(0.98)" },
        },
        blob4: {
          "0%, 100%": { transform: "translate(0,0) scale(1)" },
          "50%": { transform: "translate(-60px,-40px) scale(1.1)" },
        },
        floatDot: {
          "0%, 100%": { transform: "translateY(0)", opacity: "0.35" },
          "50%": { transform: "translateY(-18px)", opacity: "0.75" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
      animation: {
        blink: "blink 0.9s step-start infinite",
        blob1: "blob1 12s ease-in-out infinite",
        blob2: "blob2 14s ease-in-out infinite",
        blob3: "blob3 10s ease-in-out infinite",
        blob4: "blob4 16s ease-in-out infinite",
        floatDot: "floatDot var(--dot-dur, 8s) ease-in-out infinite var(--dot-delay, 0s)",
        marquee: "marquee 30s linear infinite",
      },
    },
  },
  plugins: [typography],
};

export default config;
