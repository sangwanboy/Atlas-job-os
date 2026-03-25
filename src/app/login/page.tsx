"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    await signIn("credentials", {
      password,
      callbackUrl: "/",
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 text-slate-100">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl">
        <h1 className="mb-6 text-center text-2xl font-bold tracking-tight text-white">
          AI JOB OS <span className="text-cyan-400">Access</span>
        </h1>
        <div className="space-y-4">
          <button
            onClick={() => signIn("github", { callbackUrl: "/" })}
            className="w-full rounded-xl bg-white/10 px-4 py-3 font-semibold text-white transition hover:bg-white/20"
          >
            Continue with GitHub
          </button>
          <div className="relative my-6 flex items-center justify-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10"></div>
            </div>
            <span className="relative bg-transparent px-4 text-xs uppercase tracking-widest text-slate-400 backdrop-blur-xl">Or Admin Access</span>
          </div>
          <form onSubmit={handleAdminLogin} className="space-y-3">
            <input
              type="password"
              placeholder="Admin Key"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white placeholder:text-slate-500 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
            />
            <button
              type="submit"
              className="w-full rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-3 font-bold text-white shadow-lg transition-all hover:bg-cyan-500 hover:shadow-cyan-500/25"
            >
              Unlock Admin Mode
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
