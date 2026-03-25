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
    <div className="flex h-[calc(100vh-4rem)] w-full flex-col items-center justify-center p-4">
      <div className="group relative w-full max-w-2xl overflow-hidden rounded-3xl border border-white/20 bg-white/5 p-8 backdrop-blur-3xl transition-all hover:bg-white/10">
        <div className="absolute -inset-x-20 -top-20 -z-10 h-40 w-full rounded-full bg-cyan-500/10 blur-[100px] transition-all group-hover:bg-cyan-500/20" />
        <div className="absolute right-0 top-0 -z-10 h-64 w-64 rounded-full bg-purple-500/10 blur-[120px] transition-all group-hover:bg-purple-500/20" />
        
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-6">
            <div className="relative flex h-24 w-24 items-center justify-center rounded-2xl border-4 border-white/10 bg-gradient-to-br from-cyan-400/20 to-blue-600/20 shadow-xl backdrop-blur-md">
              <span className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-br from-cyan-300 to-blue-500">
                {session.user.name?.[0] || session.user.email?.[0] || "?"}
              </span>
              {isAdmin && (
                <div className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full bg-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.6)]">
                  <Shield className="h-4 w-4 text-white" />
                </div>
              )}
            </div>
            
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold tracking-tight text-slate-800 dark:text-white">
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

        <div className="mt-12 grid grid-cols-2 gap-4">
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
