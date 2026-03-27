import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Shield, Sparkles, Settings } from "lucide-react";

export default async function ProfilePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const isAdmin = session.user.role === "ADMIN" || session.user.email === "admin@aijobos.local";

  return (
    <div className="flex h-[calc(100vh-3.5rem)] w-full flex-col items-center justify-center p-3 sm:h-[calc(100vh-4rem)] sm:p-4">
      <div className="group relative w-full max-w-2xl overflow-hidden rounded-2xl border border-white/20 bg-white/5 p-5 backdrop-blur-3xl transition-all hover:bg-white/10 sm:rounded-3xl sm:p-8">
        <div className="absolute -inset-x-20 -top-20 -z-10 h-40 w-full rounded-full bg-cyan-500/10 blur-[100px] transition-all group-hover:bg-cyan-500/20" />
        <div className="absolute right-0 top-0 -z-10 h-64 w-64 rounded-full bg-purple-500/10 blur-[120px] transition-all group-hover:bg-purple-500/20" />
        
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
            <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-white/10 bg-gradient-to-br from-cyan-400/20 to-blue-600/20 shadow-xl backdrop-blur-md sm:h-24 sm:w-24">
              <span className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-br from-cyan-300 to-blue-500 sm:text-4xl">
                {session.user.name?.[0] || session.user.email?.[0] || "?"}
              </span>
              {isAdmin && (
                <div className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full bg-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.6)]">
                  <Shield className="h-4 w-4 text-white" />
                </div>
              )}
            </div>
            
            <div className="space-y-1 text-center sm:text-left">
              <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start sm:gap-3">
                <h1 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-white sm:text-3xl">
                  {session.user.name || "Access User"}
                </h1>
                {isAdmin && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-0.5 text-xs font-bold uppercase tracking-widest text-cyan-400">
                    <Sparkles className="h-3 w-3" />
                    Admin
                  </span>
                )}
              </div>
              <p className="text-slate-500 dark:text-slate-400">{session.user.email}</p>
            </div>
          </div>
          
          <button className="rounded-xl border border-white/10 bg-white/5 p-3 text-slate-400 transition hover:bg-white/10 hover:text-md">
            <Settings className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-3 sm:mt-12 sm:grid-cols-2 sm:gap-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
            <h3 className="mb-1 text-sm font-medium text-slate-400">Account Role</h3>
            <p className="text-xl font-bold text-slate-800 dark:text-white capitalize">{session.user.role || "User"}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
            <h3 className="mb-1 text-sm font-medium text-slate-400">Agent Status</h3>
            <p className="text-xl font-bold text-green-500">Active & Syncing</p>
          </div>
        </div>
      </div>
    </div>
  );
}
