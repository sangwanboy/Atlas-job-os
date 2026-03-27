import { JobsTable } from "@/components/jobs/jobs-table";

export default function JobsPage() {
  return (
    <div className="flex h-full flex-col overflow-hidden px-3 pt-4 sm:px-4 md:px-6">
      <section className="flex-none pb-4 sm:pb-6">
        <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">Jobs</h2>
        <p className="mt-1 hidden text-sm text-muted sm:block">
          Unified job pipeline across alerts, recruiter emails, CSV imports, and manual entries.
        </p>
      </section>
      <div className="flex-1 overflow-auto min-h-0 -mx-3 px-3 sm:mx-0 sm:px-0">
        <JobsTable />
      </div>
    </div>
  );
}
