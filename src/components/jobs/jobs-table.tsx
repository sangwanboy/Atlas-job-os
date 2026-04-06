"use client";

import * as React from "react";
import {
  type SortingState,
  type VisibilityState,
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useSearchParams } from "next/navigation";
import type { JobRow } from "@/types/domain";
import { JobReviewDrawer } from "./job-review-drawer";

const columnHelper = createColumnHelper<JobRow>();

/* ── persistent cache so back-navigation is instant (Bug 4) ── */
let cachedJobs: JobRow[] | null = null;

export function JobsTable() {
  const searchParams = useSearchParams();
  const qParam = searchParams?.get("q") || "";

  const [rows, setRows] = React.useState<JobRow[]>(cachedJobs ?? []);
  const [isLoading, setIsLoading] = React.useState(cachedJobs === null);
  const [isSearching, setIsSearching] = React.useState(false);
  const [syncMessage, setSyncMessage] = React.useState<string>("");
  const [keywords, setKeywords] = React.useState(qParam || "");
  const [location, setLocation] = React.useState("");
  const [globalFilter, setGlobalFilter] = React.useState(qParam);
  const [sorting, setSorting] = React.useState<SortingState>([{ id: "score", desc: true }]);
  const [selectedJob, setSelectedJob] = React.useState<JobRow | null>(null);
  const [isDeduplicating, setIsDeduplicating] = React.useState(false);

  /* Hide the hidden company column (Bug 13) */
  const [columnVisibility] = React.useState<VisibilityState>({ company: false });

  const refreshJobs = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/jobs", { cache: "no-store" });
      const payload = (await response.json()) as { jobs?: JobRow[]; error?: string };
      const jobs = payload.jobs ?? [];
      setRows(jobs);
      cachedJobs = jobs;
      setSyncMessage(payload.error ? payload.error : "");
    } catch {
      setSyncMessage("Unable to load jobs right now.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refreshJobs();
  }, [refreshJobs]);

  /* Bug 8: read ?q= from URL and apply to filter + keywords */
  React.useEffect(() => {
    if (qParam) {
      setGlobalFilter(qParam);
      setKeywords(qParam);
    }
  }, [qParam]);

  const setStatus = React.useCallback(async (jobId: string, status: any) => {
    try {
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        throw new Error("Failed to update status");
      }
      setSyncMessage(`Updated status to ${status}.`);
      setRows((current) => current.map((row) => (row.id === jobId ? { ...row, status } : row)));
      setTimeout(() => setSyncMessage(""), 3000);
    } catch {
      setSyncMessage("Error updating job status.");
    }
  }, []);

  const columns = React.useMemo(
    () => [
      columnHelper.accessor("title", {
        header: "Role",
        cell: (info) => (
          <div>
            <p className="font-semibold text-slate-800 dark:text-slate-100">{info.getValue()}</p>
            <p className="text-xs text-muted mb-2 font-medium">{info.row.original.company}</p>
            {info.row.original.skills && info.row.original.skills.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {info.row.original.skills.slice(0, 3).map((skill, idx) => (
                  <span key={idx} className="bg-slate-100/50 dark:bg-white/10 text-[10px] px-1.5 py-0.5 rounded border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 font-medium">
                    {skill}
                  </span>
                ))}
                {info.row.original.skills.length > 3 && (
                  <span className="text-[10px] text-muted self-center ml-0.5">+{info.row.original.skills.length - 3}</span>
                )}
              </div>
            )}
          </div>
        ),
      }),
      /* Bug 13: Give company column a proper header label, hide via column visibility */
      columnHelper.accessor("company", {
        header: "Company",
        enableGlobalFilter: true,
      }),
      columnHelper.accessor("location", {
        header: "Location",
        cell: (info) => (
          <div>
            <p>{info.getValue()}</p>
            <p className="text-xs text-muted">{info.row.original.workMode}</p>
          </div>
        ),
      }),
      columnHelper.accessor("salaryRange", { header: "Salary" }),
      columnHelper.accessor("score", {
        header: "Score",
        cell: (info) => <span className="font-bold text-accent">{info.getValue()}</span>,
      }),
      columnHelper.accessor("status", {
        header: "Status",
        cell: (info) => {
          const current = info.getValue();
          const statusColors: Record<string, string> = {
            NEW: "text-slate-500",
            SAVED: "text-blue-500",
            APPLIED: "text-cyan-500",
            INTERVIEW: "text-violet-500",
            OFFER: "text-green-500",
            REJECTED: "text-red-400",
            ARCHIVED: "text-slate-400",
          };
          return (
            <select
              value={current}
              onChange={(e) => void setStatus(info.row.original.id, e.target.value)}
              className={`text-xs font-semibold bg-transparent border border-white/20 dark:border-white/10 rounded-lg px-2 py-1 cursor-pointer outline-none focus:ring-1 focus:ring-cyan-400/50 ${statusColors[current] ?? "text-slate-500"}`}
            >
              {["NEW", "SAVED", "APPLIED", "INTERVIEW", "OFFER", "REJECTED", "ARCHIVED"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          );
        },
      }),
      columnHelper.accessor("priority", {
        header: "Priority",
        cell: (info) => <span className="badge bg-bg">{info.getValue()}</span>,
      }),
      columnHelper.accessor("source", { header: "Source" }),
      columnHelper.accessor("postedAt", { header: "Posted" }),
      columnHelper.display({
        id: "actions",
        header: "Actions",
        cell: (info) => (
          <div className="flex gap-2">
            {/* Apply: real anchor tag for reliable new-tab behavior */}
            <a
              href={info.row.original.sourceUrl || `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(`${info.row.original.title} ${info.row.original.company}`)}&location=${encodeURIComponent(info.row.original.location || '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary px-3 py-1 inline-block text-center no-underline"
              onMouseDown={() => void setStatus(info.row.original.id, "APPLIED")}
            >
              Apply ↗
            </a>
            {/* Bug 3: Review opens detail panel instead of navigating away */}
            <button
              type="button"
              className="btn-secondary px-3 py-1"
              onClick={() => {
                void setStatus(info.row.original.id, "SAVED");
                setSelectedJob(info.row.original);
              }}
            >
              Review
            </button>
          </div>
        ),
      }),
    ],
    [setStatus],
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
    state: { globalFilter, sorting, columnVisibility },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
  });

  const totalRows = table.getFilteredRowModel().rows.length;
  const pagination = table.getState().pagination;
  const start = totalRows === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1;
  const end = totalRows === 0 ? 0 : Math.min(totalRows, start + table.getRowModel().rows.length - 1);

  async function cleanDuplicates() {
    setIsDeduplicating(true);
    setSyncMessage("");
    try {
      const res = await fetch("/api/jobs/deduplicate", { method: "POST" });
      const data = (await res.json()) as { removed?: number; message?: string; error?: string };
      if (!res.ok) {
        setSyncMessage(data.error ?? "Deduplication failed.");
        return;
      }
      setSyncMessage(data.message ?? `Removed ${data.removed ?? 0} duplicates.`);
      cachedJobs = null; // bust cache
      await refreshJobs();
    } catch {
      setSyncMessage("Unable to run deduplication right now.");
    } finally {
      setIsDeduplicating(false);
    }
  }

  async function runLiveSearch() {
    setIsSearching(true);
    setSyncMessage("");

    try {
      const response = await fetch("/api/jobs/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords, location, resultsPerPage: 10 }),
      });

      const payload = (await response.json()) as { importedCount?: number; error?: string };
      if (!response.ok) {
        setSyncMessage(payload.error ?? "Job search failed.");
        return;
      }

      setSyncMessage(`Imported ${payload.importedCount ?? 0} live jobs into the table.`);
      await refreshJobs();
    } catch {
      setSyncMessage("Unable to run live search right now.");
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <section className="panel p-3 sm:p-4 md:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold">Jobs Intelligence Table</h3>
          <p className="hidden text-sm text-muted sm:block">Filter, prioritize, and act on your best opportunities.</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <input value={keywords} onChange={(event) => setKeywords(event.target.value)} placeholder="Keywords" className="field w-full sm:w-44" />
          <input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Location" className="field w-full sm:w-36" />
          <button type="button" className="btn-primary w-full sm:w-auto" onClick={() => void runLiveSearch()} disabled={isSearching}>
            {isSearching ? "Searching..." : "Search & Compile"}
          </button>
          <button
            type="button"
            className="btn-secondary w-full sm:w-auto flex items-center gap-1.5 disabled:opacity-50"
            onClick={() => void cleanDuplicates()}
            disabled={isDeduplicating}
            title="Remove duplicate jobs (keeps oldest entry)"
          >
            {isDeduplicating ? (
              <>
                <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                Cleaning…
              </>
            ) : (
              <>
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                </svg>
                Clean Dupes
              </>
            )}
          </button>
          <input
            value={globalFilter}
            onChange={(event) => setGlobalFilter(event.target.value)}
            placeholder="Filter table"
            className="field w-full sm:w-44"
          />
        </div>
      </div>

      {syncMessage ? <p className="mb-3 text-sm text-muted">{syncMessage}</p> : null}
      {isLoading ? <p className="mb-3 text-sm text-muted">Loading jobs...</p> : null}

      <div className="overflow-x-auto rounded-xl border border-white/60 dark:border-white/10 bg-white/70 dark:bg-white/5 -mx-1 sm:mx-0">
        <table className="w-full min-w-[800px] text-sm">
          <thead className="bg-white/80 dark:bg-white/5 text-left">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className="px-3 py-2 font-semibold text-muted">
                    {header.isPlaceholder ? null : (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1"
                        onClick={header.column.getToggleSortingHandler()}
                        aria-label={`Sort by ${header.column.columnDef.header as string}`}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === "asc" ? (
                          <span className="font-extrabold text-slate-700 dark:text-slate-300">↑</span>
                        ) : header.column.getIsSorted() === "desc" ? (
                          <span className="font-extrabold text-slate-700 dark:text-slate-300">↓</span>
                        ) : null}
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr className="border-t">
                <td colSpan={columns.length} className="px-3 py-8 text-center text-sm text-muted">
                  No jobs match your search.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="border-t">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-3 align-top">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
        <p>
          Showing {start}-{end} of {totalRows} jobs
        </p>
        <div className="flex items-center gap-2">
          <button className="btn-secondary disabled:opacity-50" onClick={() => { setSelectedJob(null); table.previousPage(); }} disabled={!table.getCanPreviousPage()}>
            Previous
          </button>
          <span>
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() || 1}
          </span>
          <button className="btn-secondary disabled:opacity-50" onClick={() => { setSelectedJob(null); table.nextPage(); }} disabled={!table.getCanNextPage()}>
            Next
          </button>
        </div>
      </div>

      {/* Review detail panel (slide-over drawer) */}
      {selectedJob && (
        <JobReviewDrawer job={selectedJob} onClose={() => setSelectedJob(null)} />
      )}
    </section>
  );
}
