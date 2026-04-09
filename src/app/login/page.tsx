"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Bot, Eye, EyeOff, LogIn } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams?.get("callbackUrl") || "/dashboard";
  const registered = searchParams?.get("registered");
  const waitlisted = searchParams?.get("waitlisted");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      // Check if this is a pending (waitlisted) user
      try {
        const checkRes = await fetch(`/api/register/status?email=${encodeURIComponent(email)}`);
        const checkData = await checkRes.json();
        if (checkData.status === "PENDING") {
          setError("Your account is on the waitlist. We'll email you when you're approved.");
        } else {
          setError("Invalid email or password.");
        }
      } catch {
        setError("Invalid email or password.");
      }
    } else {
      router.push(callbackUrl as any);
      router.refresh();
    }
  };

  return (
    <>
      {registered && (
        <div className="mb-6 rounded-xl border border-emerald-400/30 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Account created successfully. Sign in below.
        </div>
      )}

      {waitlisted && (
        <div className="mb-6 rounded-xl border border-amber-400/30 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          You&apos;re on the waitlist! We&apos;ll email you when your account is approved.
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-xl border border-rose-400/30 bg-rose-50 px-4 py-3 text-sm text-rose-600">
          {error}
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">
            Email
          </label>
          <input
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className="w-full rounded-xl border border-white/10 bg-white/70 dark:bg-white/[0.08] px-4 py-3 text-text placeholder:text-muted/60 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/50 transition-all"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">
            Password
          </label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full rounded-xl border border-white/10 bg-white/70 dark:bg-white/[0.08] px-4 py-3 pr-12 text-text placeholder:text-muted/60 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/50 transition-all"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-text transition-colors"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-700 px-4 py-3 font-bold text-white shadow-md shadow-cyan-500/20 transition-all hover:shadow-cyan-500/30 hover:brightness-105 disabled:opacity-50"
        >
          {loading ? (
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            <>
              <LogIn className="h-4 w-4" />
              Sign In
            </>
          )}
        </button>
      </form>
    </>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="relative w-full max-w-md">
        <div className="panel p-6 sm:p-8">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-cyan-700 shadow-lg shadow-cyan-500/20">
              <Bot className="h-7 w-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-text">
              Welcome back
            </h1>
            <p className="mt-1.5 text-sm text-muted">
              Sign in to your Job OS account
            </p>
          </div>

          <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-white/5" />}>
            <LoginForm />
          </Suspense>

          <div className="mt-6 text-center">
            <p className="text-sm text-muted">
              Don&apos;t have an account?{" "}
              <Link
                href="/register"
                className="font-semibold text-cyan-600 hover:text-cyan-500 transition-colors"
              >
                Create one
              </Link>
            </p>
          </div>

          {/* Default admin credentials — dev only, commented out for security
          {process.env.NODE_ENV === "development" && (
            <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-3 text-center text-xs text-muted">
              <p>Default admin: <span className="font-mono text-text/70">admin@jobos.local</span> / <span className="font-mono text-text/70">admin123</span></p>
            </div>
          )}
          */}
        </div>
      </div>
    </div>
  );
}
