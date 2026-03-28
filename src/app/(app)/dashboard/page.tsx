import Link from "next/link";
import dynamic from "next/dynamic";
import { OverviewKpis } from "@/components/dashboard/overview-kpis";

const WeeklyTrendChart = dynamic(
  () => import("@/components/dashboard/weekly-trend-chart").then((m) => m.WeeklyTrendChart),
  { loading: () => <div className="panel h-64 animate-pulse" /> },
);

export default function DashboardPage() {
  return (
    <div className="flex h-full flex-col overflow-hidden px-3 pt-4 sm:px-4 md:px-6">
      <section className="flex-none pb-4 sm:pb-6">
        <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">Dashboard</h2>
        <p className="mt-1 hidden text-sm text-muted sm:block">
          Control tower for job intelligence, outreach queue health, and agent-guided next actions.
        </p>
      </section>

      <div className="flex-1 overflow-y-auto min-h-0 space-y-4 pb-6 custom-scrollbar sm:space-y-6">
        <OverviewKpis />

        <section className="grid gap-6 xl:grid-cols-[2fr_1fr]">
          <WeeklyTrendChart />
          <div className="panel p-5">
            <h3 className="text-lg font-bold">Today&apos;s Action Queue</h3>
            <ul className="mt-4 space-y-3 text-sm">
              <li className="rounded-xl border border-white/60 bg-white/75 p-3">
                <p>Follow up with 3 recruiters from last week.</p>
                <Link href="/outreach" className="btn-secondary mt-2 inline-block">
                  Open Follow-ups
                </Link>
              </li>
              <li className="rounded-xl border border-white/60 bg-white/75 p-3">
                <p>Review 5 high-priority roles scored over 75.</p>
                <Link href="/jobs" className="btn-secondary mt-2 inline-block">
                  Review Jobs
                </Link>
              </li>
              <li className="rounded-xl border border-white/60 bg-white/75 p-3">
                <p>Ask Atlas to draft two personalized outreach messages.</p>
                <Link href="/agents/workspace" className="btn-secondary mt-2 inline-block">
                  Open Agent Workspace
                </Link>
              </li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
