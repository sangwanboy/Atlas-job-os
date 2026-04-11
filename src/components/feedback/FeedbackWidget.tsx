"use client";

import { useState, useEffect, useRef } from "react";
import { Bug, Lightbulb, MessageCircle, X, Send, Loader2, CheckCircle2 } from "lucide-react";

type FeedbackType = "bug" | "suggestion" | "other";

const TYPES: {
  value: FeedbackType;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  active: string;
  hover: string;
} [] = [
  {
    value: "bug",
    label: "Bug",
    Icon: Bug,
    active: "bg-red-50 dark:bg-red-500/15 border-red-400 dark:border-red-500 text-red-700 dark:text-red-400",
    hover: "hover:border-red-300 dark:hover:border-red-600 hover:text-red-600 dark:hover:text-red-400",
  },
  {
    value: "suggestion",
    label: "Idea",
    Icon: Lightbulb,
    active: "bg-violet-50 dark:bg-violet-500/15 border-violet-400 dark:border-violet-500 text-violet-700 dark:text-violet-400",
    hover: "hover:border-violet-300 dark:hover:border-violet-600 hover:text-violet-600 dark:hover:text-violet-400",
  },
  {
    value: "other",
    label: "Other",
    Icon: MessageCircle,
    active: "bg-sky-50 dark:bg-sky-500/15 border-sky-400 dark:border-sky-500 text-sky-700 dark:text-sky-400",
    hover: "hover:border-sky-300 dark:hover:border-sky-600 hover:text-sky-600 dark:hover:text-sky-400",
  },
];

const MIN_CHARS = 10;
const MAX_CHARS = 600;

interface FeedbackWidgetProps {
  externalOpen?: boolean;
  onClose?: () => void;
}

export function FeedbackWidget({ externalOpen, onClose }: FeedbackWidgetProps = {}) {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false); // controls animation

  // Sync with external open state
  useEffect(() => {
    if (externalOpen !== undefined) setOpen(externalOpen);
  }, [externalOpen]);
  const [type, setType] = useState<FeedbackType>("bug");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setMounted(true); }, []);

  // Animate modal in
  useEffect(() => {
    if (open) {
      setVisible(false);
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
      setTimeout(() => textareaRef.current?.focus(), 150);
    }
  }, [open]);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  const resetForm = () => {
    setType("bug");
    setDescription("");
    setError("");
    setSuccess(false);
  };

  const handleClose = () => {
    setVisible(false);
    setTimeout(() => { setOpen(false); onClose?.(); resetForm(); }, 250);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = description.trim();
    if (trimmed.length < MIN_CHARS) {
      setError(`At least ${MIN_CHARS} characters needed.`);
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          description: trimmed,
          page: window.location.pathname,
          userAgent: navigator.userAgent,
        }),
      });
      if (!res.ok) throw new Error();
      setSuccess(true);
      setTimeout(handleClose, 2200);
    } catch {
      setError("Something went wrong — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const charCount = description.length;
  const remaining = MAX_CHARS - charCount;
  const tooShort = charCount > 0 && charCount < MIN_CHARS;
  const selectedType = TYPES.find((t) => t.value === type)!;

  return (
    <>
      <style>{`
        @keyframes fb-bounce {
          0%,100% { transform: translateY(0); }
          40%      { transform: translateY(-7px); }
          70%      { transform: translateY(-3px); }
        }
        .fb-bounce { animation: fb-bounce 0.7s ease 0.8s 1 both; }

        @keyframes fb-check {
          from { stroke-dashoffset: 48; }
          to   { stroke-dashoffset: 0; }
        }
        .fb-check-path {
          stroke-dasharray: 48;
          stroke-dashoffset: 48;
          animation: fb-check 0.5s ease 0.1s forwards;
        }
      `}</style>

      {/* ── Backdrop + Modal ── */}
      {open && (
        <div
          className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center px-0 sm:px-4 transition-all duration-250 ${
            visible ? "bg-black/40 backdrop-blur-[3px]" : "bg-black/0 backdrop-blur-none"
          }`}
          onClick={(e) => e.target === e.currentTarget && handleClose()}
        >
          <div
            className={`
              w-full sm:max-w-[420px]
              bg-white dark:bg-slate-900
              rounded-t-3xl sm:rounded-2xl
              shadow-2xl shadow-black/20
              border border-slate-200/80 dark:border-white/10
              overflow-hidden
              transition-all duration-250 ease-out
              ${visible
                ? "translate-y-0 opacity-100 scale-100"
                : "translate-y-6 opacity-0 scale-[0.97] sm:scale-[0.96]"
              }
            `}
          >
            {/* Gradient header bar */}
            <div className="h-1 w-full bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500" />

            <div className="p-5 sm:p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white leading-none">
                    Share feedback
                  </h2>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                    Help us make Atlas better
                  </p>
                </div>
                <button
                  onClick={handleClose}
                  aria-label="Close"
                  className="rounded-full p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200
                    hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* ── Success state ── */}
              {success ? (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <div className="rounded-full bg-emerald-50 dark:bg-emerald-500/15 p-3">
                    <svg className="h-10 w-10" viewBox="0 0 48 48" fill="none">
                      <circle cx="24" cy="24" r="22" stroke="#10b981" strokeWidth="3" opacity="0.25" />
                      <path
                        className="fb-check-path"
                        d="M13 25l8 8 14-16"
                        stroke="#10b981"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <p className="font-semibold text-slate-800 dark:text-slate-100">Thanks — got it! 🙌</p>
                  <p className="text-sm text-slate-400 dark:text-slate-500">We review every submission.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} noValidate>

                  {/* Type selector */}
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {TYPES.map((t) => {
                      const Icon = t.Icon;
                      const isActive = type === t.value;
                      return (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => { setType(t.value); setError(""); }}
                          className={`
                            flex flex-col items-center gap-1.5 rounded-xl border py-3 px-2
                            text-xs font-semibold transition-all duration-150
                            ${isActive
                              ? t.active
                              : `bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10
                                 text-slate-500 dark:text-slate-400 ${t.hover}`
                            }
                          `}
                        >
                          <Icon className="h-4 w-4" />
                          {t.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Textarea */}
                  <div className="relative mb-1">
                    <textarea
                      ref={textareaRef}
                      value={description}
                      onChange={(e) => {
                        if (e.target.value.length <= MAX_CHARS) setDescription(e.target.value);
                        if (error) setError("");
                      }}
                      placeholder={
                        type === "bug"
                          ? "What went wrong? What did you expect to happen?"
                          : type === "suggestion"
                          ? "What feature or improvement would help you most?"
                          : "What's on your mind?"
                      }
                      rows={4}
                      className={`
                        w-full rounded-xl border px-3.5 py-3 text-sm resize-none
                        bg-slate-50 dark:bg-white/5
                        text-slate-900 dark:text-white
                        placeholder-slate-400 dark:placeholder-slate-500
                        focus:outline-none focus:ring-2 transition-shadow
                        ${tooShort || error
                          ? "border-red-300 dark:border-red-500/50 focus:ring-red-300 dark:focus:ring-red-500/40"
                          : "border-slate-200 dark:border-white/10 focus:ring-violet-400/60 dark:focus:ring-violet-500/40"
                        }
                      `}
                    />
                  </div>

                  {/* Char count + error row */}
                  <div className="flex items-center justify-between mb-4 min-h-[18px]">
                    {error || tooShort ? (
                      <p className="text-[11px] text-red-500 dark:text-red-400">
                        {error || `${MIN_CHARS - charCount} more character${MIN_CHARS - charCount !== 1 ? "s" : ""} needed`}
                      </p>
                    ) : (
                      <span />
                    )}
                    <span className={`text-[11px] tabular-nums ml-auto ${
                      remaining < 50
                        ? "text-red-400 dark:text-red-500"
                        : remaining < 150
                        ? "text-amber-500 dark:text-amber-400"
                        : "text-slate-300 dark:text-slate-600"
                    }`}>
                      {remaining}
                    </span>
                  </div>

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={submitting || charCount < MIN_CHARS}
                    className={`
                      w-full flex items-center justify-center gap-2
                      rounded-xl py-2.5 text-sm font-semibold text-white
                      transition-all duration-200
                      ${submitting || charCount < MIN_CHARS
                        ? "opacity-50 cursor-not-allowed bg-gradient-to-r from-indigo-400 to-violet-500"
                        : "bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-violet-500/20 hover:shadow-lg hover:shadow-violet-500/30 active:scale-[0.98]"
                      }
                    `}
                  >
                    {submitting ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
                    ) : (
                      <><Send className="h-3.5 w-3.5" /> Send feedback</>
                    )}
                  </button>

                  <p className="mt-3 text-center text-[10px] text-slate-300 dark:text-slate-600">
                    Your email is attached automatically so we can follow up.
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
