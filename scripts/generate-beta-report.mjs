/**
 * Atlas Job OS — Beta Testing Report Generator
 * Run: node scripts/generate-beta-report.mjs
 * Output: beta-testing-report.docx in project root
 */

import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow,
  TableCell, WidthType, AlignmentType, BorderStyle, ShadingType,
  PageBreak, TableOfContents, StyleLevel, convertInchesToTwip, Header,
  Footer, PageNumber, NumberFormat
} from "docx";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "Atlas-Job-OS-Beta-Testing-Report.docx");

// ─── Colour Palette ──────────────────────────────────────────────────────────
const C = {
  primary:  "1E3A5F",  // deep navy
  accent:   "2563EB",  // brand blue
  green:    "16A34A",
  amber:    "D97706",
  red:      "DC2626",
  lightBg:  "F0F4FF",
  white:    "FFFFFF",
  text:     "1F2937",
  muted:    "6B7280",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const h = (text, level = HeadingLevel.HEADING_1, color = C.primary) =>
  new Paragraph({
    text,
    heading: level,
    spacing: { before: 300, after: 120 },
    run: { color },
  });

const p = (text, { bold = false, color = C.text, size = 22 } = {}) =>
  new Paragraph({
    children: [new TextRun({ text, bold, color, size, font: "Calibri" })],
    spacing: { after: 120 },
  });

const bullet = (text, indent = 0) =>
  new Paragraph({
    children: [new TextRun({ text, size: 22, font: "Calibri", color: C.text })],
    bullet: { level: indent },
    spacing: { after: 80 },
  });

const kv = (key, val, valColor = C.text) =>
  new Paragraph({
    children: [
      new TextRun({ text: `${key}: `, bold: true, size: 22, font: "Calibri", color: C.primary }),
      new TextRun({ text: val, size: 22, font: "Calibri", color: valColor }),
    ],
    spacing: { after: 100 },
  });

const divider = () =>
  new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: "D1D5DB" } },
    spacing: { after: 200 },
  });

const statusBadge = (status) => {
  const map = {
    PASS:    { text: "✓ PASS",    color: C.green },
    FAIL:    { text: "✗ FAIL",    color: C.red   },
    WARN:    { text: "⚠ WARN",    color: C.amber },
    SKIP:    { text: "— SKIP",   color: C.muted },
    PENDING: { text: "⏳ PENDING", color: C.muted },
  };
  return map[status] ?? { text: status, color: C.muted };
};

const testRow = (id, feature, scenario, status, notes = "") => {
  const { text, color } = statusBadge(status);
  const cellStyle = (bg = C.white) => ({
    shading: { type: ShadingType.CLEAR, fill: bg },
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
  });
  return new TableRow({
    children: [
      new TableCell({ ...cellStyle(), children: [new Paragraph({ children: [new TextRun({ text: id, size: 20, font: "Calibri", color: C.muted })] })] }),
      new TableCell({ ...cellStyle(), children: [new Paragraph({ children: [new TextRun({ text: feature, size: 20, bold: true, font: "Calibri" })] })] }),
      new TableCell({ ...cellStyle(), children: [new Paragraph({ children: [new TextRun({ text: scenario, size: 20, font: "Calibri" })] })] }),
      new TableCell({ ...cellStyle(), children: [new Paragraph({ children: [new TextRun({ text, size: 20, bold: true, font: "Calibri", color })] })] }),
      new TableCell({ ...cellStyle(), children: [new Paragraph({ children: [new TextRun({ text: notes, size: 18, font: "Calibri", color: C.muted, italics: true })] })] }),
    ],
  });
};

const tableHeader = () =>
  new TableRow({
    tableHeader: true,
    children: ["ID", "Feature", "Scenario", "Status", "Notes / Bug"].map(h =>
      new TableCell({
        shading: { type: ShadingType.CLEAR, fill: C.primary },
        margins: { top: 100, bottom: 100, left: 100, right: 100 },
        children: [new Paragraph({ children: [new TextRun({ text: h, size: 20, bold: true, color: C.white, font: "Calibri" })] })],
      })
    ),
  });

const table = (rows) =>
  new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [tableHeader(), ...rows],
    borders: {
      top:    { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
      left:   { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
      right:  { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
      insideH:{ style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
      insideV:{ style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
    },
  });

// ─── Cover Page ───────────────────────────────────────────────────────────────
const coverPage = [
  new Paragraph({ spacing: { after: 2400 } }), // push title down
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "ATLAS JOB OS", size: 72, bold: true, font: "Calibri", color: C.primary })],
    spacing: { after: 200 },
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Beta Testing Report", size: 48, font: "Calibri", color: C.accent })],
    spacing: { after: 200 },
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Comprehensive QA & Feature Validation", size: 28, font: "Calibri", color: C.muted, italics: true })],
    spacing: { after: 600 },
  }),
  divider(),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: `Report Date: ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}`, size: 24, font: "Calibri", color: C.text })],
    spacing: { after: 100 },
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Platform: Cloud SaaS (Next.js 15 + Chrome Extension MV3)", size: 24, font: "Calibri", color: C.text })],
    spacing: { after: 100 },
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Tester: Beta QA Team", size: 24, font: "Calibri", color: C.text })],
    spacing: { after: 100 },
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Version: 1.0.0-beta", size: 24, font: "Calibri", color: C.text })],
  }),
  new Paragraph({ children: [new PageBreak()] }),
];

// ─── Executive Summary ────────────────────────────────────────────────────────
const executiveSummary = [
  h("1. Executive Summary"),
  p("Atlas Job OS is an AI-powered job application management platform that combines intelligent job discovery, resume analysis, and automated application workflows. This report documents the results of a comprehensive beta testing cycle covering all major user-facing features, security posture, and platform stability."),
  new Paragraph({ spacing: { after: 160 } }),
  h("Key Metrics", HeadingLevel.HEADING_2),
  table([
    testRow("KM-01", "Total Test Cases",       "Across all modules",           "PENDING", "Populated after live testing"),
    testRow("KM-02", "Pass Rate",               "End-to-end scenarios",         "PENDING", ""),
    testRow("KM-03", "Critical Bugs Found",     "P0 / P1 severity",             "PENDING", ""),
    testRow("KM-04", "Security Issues",         "Auth / data isolation",        "PENDING", ""),
    testRow("KM-05", "Performance Baseline",    "Dashboard TTI < 3s",           "PENDING", ""),
  ]),
  new Paragraph({ spacing: { after: 200 } }),
  h("Overall Verdict", HeadingLevel.HEADING_2),
  p("⏳ Testing in progress — this section will be updated with Pass/Fail/Conditional verdict upon completion of all test suites."),
  new Paragraph({ children: [new PageBreak()] }),
];

// ─── Test Environment ─────────────────────────────────────────────────────────
const testEnvironment = [
  h("2. Test Environment"),
  kv("Browser",         "Microsoft Edge (Chromium) with Atlas Extension MV3"),
  kv("OS",              "Windows 11 Home"),
  kv("Next.js",         "15 (App Router, Turbopack)"),
  kv("Database",        "PostgreSQL via Prisma ORM"),
  kv("Cache / Queue",   "Redis + BullMQ"),
  kv("AI Backend",      "Gemini 2.0 Flash (Vertex AI) + fallback chain"),
  kv("Scraping",        "Chrome Extension content scripts — no Playwright"),
  kv("Auth",            "NextAuth.js (JWT sessions)"),
  kv("Error Tracking",  "Sentry (DSN configured via env)"),
  kv("Base URL",        "http://localhost:3000 (dev) / production domain"),
  new Paragraph({ spacing: { after: 200 } }),
  h("Test Accounts", HeadingLevel.HEADING_2),
  table([
    testRow("ENV-01", "Admin account",   "Full access, feedback viewer",  "PENDING", ""),
    testRow("ENV-02", "Beta user A",     "New user, no CV uploaded",      "PENDING", ""),
    testRow("ENV-03", "Beta user B",     "Returning user, jobs imported",  "PENDING", ""),
  ]),
  new Paragraph({ children: [new PageBreak()] }),
];

// ─── Auth & Onboarding ────────────────────────────────────────────────────────
const authTests = [
  h("3. Authentication & Onboarding"),
  table([
    testRow("AUTH-01", "Login Page",         "Valid credentials → dashboard redirect",          "PENDING"),
    testRow("AUTH-02", "Login Page",         "Invalid credentials → error message shown",       "PENDING"),
    testRow("AUTH-03", "Login Page",         "Empty fields → validation before submit",         "PENDING"),
    testRow("AUTH-04", "Login Page",         "Session persists on page reload",                 "PENDING"),
    testRow("AUTH-05", "Login Page",         "Dark mode renders correctly",                     "PENDING"),
    testRow("AUTH-06", "Register Page",      "New account creation flow",                       "PENDING"),
    testRow("AUTH-07", "Register Page",      "Duplicate email rejected",                        "PENDING"),
    testRow("AUTH-08", "Session",            "Logout clears session, redirects to /login",      "PENDING"),
    testRow("AUTH-09", "Protected Routes",   "Unauthenticated access → /login redirect",        "PENDING"),
    testRow("AUTH-10", "Rate Limiting",      "10+ failed logins → rate limited response",       "PENDING"),
  ]),
  new Paragraph({ children: [new PageBreak()] }),
];

// ─── Dashboard ────────────────────────────────────────────────────────────────
const dashboardTests = [
  h("4. Dashboard"),
  table([
    testRow("DASH-01", "KPI Cards",           "All 4 KPIs render (pipeline/saved/applied/interviews)", "PENDING"),
    testRow("DASH-02", "KPI Cards",           "Zero state (new user) renders without errors",           "PENDING"),
    testRow("DASH-03", "Weekly Trend Chart",  "Chart renders with data",                               "PENDING"),
    testRow("DASH-04", "Weekly Trend Chart",  "Chart renders empty state gracefully",                  "PENDING"),
    testRow("DASH-05", "Quick Actions",       "All quick action buttons navigate correctly",           "PENDING"),
    testRow("DASH-06", "Dark Mode",           "Full dashboard dark mode — no white flashes",           "PENDING"),
    testRow("DASH-07", "Responsiveness",      "Mobile viewport (375px) — no overflow",                "PENDING"),
    testRow("DASH-08", "Loading States",      "Skeleton loaders shown before data arrives",            "PENDING"),
  ]),
  new Paragraph({ children: [new PageBreak()] }),
];

// ─── Agent Workspace ──────────────────────────────────────────────────────────
const agentTests = [
  h("5. Agent Workspace (AI Chat)"),
  table([
    testRow("AGENT-01", "Chat UI",             "Page loads, input box focused",                          "PENDING"),
    testRow("AGENT-02", "Job Search",          '"find me 3 software engineer jobs in London"',            "PENDING"),
    testRow("AGENT-03", "Job Search",          "Results appear as preview cards",                        "PENDING"),
    testRow("AGENT-04", "Preview Cards",       "Score badge, salary, job type, date all visible",        "PENDING"),
    testRow("AGENT-05", "Import Job",          "Import single job → appears in pipeline",                "PENDING"),
    testRow("AGENT-06", "Import All",          "Import All → all jobs added with description/skills",    "PENDING"),
    testRow("AGENT-07", "Description P1",      "Imported job has full description (not empty)",          "PENDING"),
    testRow("AGENT-08", "Skills P1",           "Imported job has skills array (not empty)",              "PENDING"),
    testRow("AGENT-09", "Dismiss Preview",     "X button closes preview box",                            "PENDING"),
    testRow("AGENT-10", "Pipeline Query",      '"show me my pipeline" returns real job data',            "PENDING"),
    testRow("AGENT-11", "CV Scoring",          "Jobs scored against CV when profile exists",             "PENDING"),
    testRow("AGENT-12", "Enrich Pipeline",     '"enrich my pipeline jobs" triggers detail scrape',       "PENDING"),
    testRow("AGENT-13", "Multi-turn",          "Follow-up question maintains context",                   "PENDING"),
    testRow("AGENT-14", "Error Handling",      "Extension disconnected → clear user message",            "PENDING"),
    testRow("AGENT-15", "Starter Chips",       "All starter prompt chips work",                          "PENDING"),
  ]),
  new Paragraph({ children: [new PageBreak()] }),
];

// ─── Job Pipeline ─────────────────────────────────────────────────────────────
const pipelineTests = [
  h("6. Job Pipeline & Jobs Table"),
  table([
    testRow("PIPE-01", "Jobs Table",           "Table renders with jobs",                               "PENDING"),
    testRow("PIPE-02", "Jobs Table",           "Empty state renders without errors",                    "PENDING"),
    testRow("PIPE-03", "Status Filter",        "Filter by Saved/Applied/Interview/Rejected",            "PENDING"),
    testRow("PIPE-04", "Search",               "Search by job title or company",                        "PENDING"),
    testRow("PIPE-05", "Sort",                 "Sort by date/score/salary",                             "PENDING"),
    testRow("PIPE-06", "Row Click",            "Opens job review drawer",                               "PENDING"),
    testRow("PIPE-07", "Review Drawer",        "All fields visible: title, company, description, skills","PENDING"),
    testRow("PIPE-08", "Status Update",        "Change job status from drawer",                         "PENDING"),
    testRow("PIPE-09", "Notes",                "Add/edit notes in drawer",                              "PENDING"),
    testRow("PIPE-10", "Re-fetch Details",     "Re-fetch button scrapes fresh description/skills",      "PENDING"),
    testRow("PIPE-11", "Re-fetch — no URL",    "Re-fetch button hidden when no sourceUrl",              "PENDING"),
    testRow("PIPE-12", "Delete Job",           "Remove job from pipeline",                              "PENDING"),
    testRow("PIPE-13", "CV Score Badge",       "Score badge visible on rows where score exists",        "PENDING"),
    testRow("PIPE-14", "Salary Badge",         "Salary shown when extracted",                           "PENDING"),
    testRow("PIPE-15", "Dark Mode",            "Drawer + table dark mode correct",                      "PENDING"),
  ]),
  new Paragraph({ children: [new PageBreak()] }),
];

// ─── My CV ────────────────────────────────────────────────────────────────────
const cvTests = [
  h("7. My CV"),
  table([
    testRow("CV-01",  "CV Page",              "Page loads without errors",                              "PENDING"),
    testRow("CV-02",  "Upload",               "PDF upload succeeds",                                    "PENDING"),
    testRow("CV-03",  "Parse",                "AI extracts skills/experience from PDF",                 "PENDING"),
    testRow("CV-04",  "Profile Display",      "Parsed profile renders correctly",                       "PENDING"),
    testRow("CV-05",  "Edit",                 "Manual profile edits saved",                             "PENDING"),
    testRow("CV-06",  "CV Score Integration", "Jobs scored against uploaded CV",                        "PENDING"),
    testRow("CV-07",  "Empty State",          "Upload prompt shown when no CV",                         "PENDING"),
  ]),
  new Paragraph({ children: [new PageBreak()] }),
];

// ─── Settings ─────────────────────────────────────────────────────────────────
const settingsTests = [
  h("8. Settings"),
  table([
    testRow("SET-01", "LLM Settings",         "Page loads, current model shown",                        "PENDING"),
    testRow("SET-02", "Model Switch",         "Change AI model → saved and confirmed",                  "PENDING"),
    testRow("SET-03", "Profile Settings",     "Update name/email",                                      "PENDING"),
    testRow("SET-04", "API Keys",             "Gemini/OpenAI key input masked",                         "PENDING"),
    testRow("SET-05", "Dark Mode Toggle",     "Theme persists across page reload",                      "PENDING"),
  ]),
  new Paragraph({ children: [new PageBreak()] }),
];

// ─── Analytics ────────────────────────────────────────────────────────────────
const analyticsTests = [
  h("9. Analytics"),
  table([
    testRow("ANA-01", "Funnel Chart",          "Application funnel renders",                             "PENDING"),
    testRow("ANA-02", "Sources Chart",         "Job sources breakdown renders",                          "PENDING"),
    testRow("ANA-03", "Empty State",           "Charts graceful when no data",                           "PENDING"),
    testRow("ANA-04", "Data Accuracy",         "Funnel counts match jobs table",                         "PENDING"),
  ]),
  new Paragraph({ children: [new PageBreak()] }),
];

// ─── Chrome Extension ─────────────────────────────────────────────────────────
const extensionTests = [
  h("10. Chrome Extension"),
  table([
    testRow("EXT-01", "Connection Status",    "Extension shows connected to Atlas",                     "PENDING"),
    testRow("EXT-02", "Keep-Alive",           "Stays connected after 5 min idle",                       "PENDING"),
    testRow("EXT-03", "Content Script",       "Landing on LinkedIn job page auto-scrapes",               "PENDING"),
    testRow("EXT-04", "Content Script",       "Landing on Reed job page auto-scrapes",                  "PENDING"),
    testRow("EXT-05", "scrapeJobListing",     "Command navigates + returns detail < 10s",               "PENDING"),
    testRow("EXT-06", "Cookie Banners",       "GDPR banners auto-dismissed",                            "PENDING"),
    testRow("EXT-07", "Parallel Tabs",        "3 concurrent detail scrapes complete without errors",    "PENDING"),
    testRow("EXT-08", "Reconnect",            "Extension reconnects after browser-server restart",      "PENDING"),
  ]),
  new Paragraph({ children: [new PageBreak()] }),
];

// ─── Outreach ─────────────────────────────────────────────────────────────────
const outreachTests = [
  h("11. Outreach"),
  table([
    testRow("OUT-01", "Outreach Page",        "Page loads without errors",                              "PENDING"),
    testRow("OUT-02", "Draft Email",          "AI drafts outreach email for a job",                     "PENDING"),
    testRow("OUT-03", "Templates",            "Saved templates shown and selectable",                   "PENDING"),
    testRow("OUT-04", "Send",                 "Email send flow (or mock) completes",                    "PENDING"),
  ]),
  new Paragraph({ children: [new PageBreak()] }),
];

// ─── Admin Panel ──────────────────────────────────────────────────────────────
const adminTests = [
  h("12. Admin Panel"),
  table([
    testRow("ADM-01", "Users Page",           "Lists all users with metadata",                          "PENDING"),
    testRow("ADM-02", "Feedback Viewer",      "Beta feedback entries visible",                          "PENDING"),
    testRow("ADM-03", "Access Control",       "Non-admin user cannot access /admin/*",                  "PENDING"),
    testRow("ADM-04", "Health Endpoint",      "GET /api/health returns all-green JSON",                 "PENDING"),
  ]),
  new Paragraph({ children: [new PageBreak()] }),
];

// ─── Security ─────────────────────────────────────────────────────────────────
const securityTests = [
  h("13. Security & Data Isolation"),
  table([
    testRow("SEC-01", "User Isolation",       "User A cannot access User B jobs",                       "PENDING"),
    testRow("SEC-02", "IDOR",                 "GET /api/jobs/[other-user-id] → 403/404",                "PENDING"),
    testRow("SEC-03", "Auth Guard",           "All API routes reject unauthenticated requests",          "PENDING"),
    testRow("SEC-04", "Input Validation",     "SQL injection patterns rejected",                        "PENDING"),
    testRow("SEC-05", "XSS",                  "Script tags in job notes sanitised",                     "PENDING"),
    testRow("SEC-06", "Rate Limiting",        "Rapid API calls throttled correctly",                    "PENDING"),
    testRow("SEC-07", "Session Fixation",     "Session token rotated on login",                         "PENDING"),
  ]),
  new Paragraph({ children: [new PageBreak()] }),
];

// ─── Performance ─────────────────────────────────────────────────────────────
const perfTests = [
  h("14. Performance"),
  table([
    testRow("PERF-01", "Dashboard TTI",       "Time to interactive < 3s on cold load",                  "PENDING"),
    testRow("PERF-02", "Jobs Table (50 rows)","Renders without jank",                                   "PENDING"),
    testRow("PERF-03", "AI Chat Response",    "First token appears < 5s",                               "PENDING"),
    testRow("PERF-04", "Job Search",          "Full search + 3 enriched results < 30s",                 "PENDING"),
    testRow("PERF-05", "Memory Leak",         "No heap growth after 10 chat turns",                     "PENDING"),
  ]),
  new Paragraph({ children: [new PageBreak()] }),
];

// ─── Bugs & Issues Log ────────────────────────────────────────────────────────
const bugsLog = [
  h("15. Bugs & Issues Log"),
  p("All defects found during testing are logged below with severity, reproduction steps, and status."),
  new Paragraph({ spacing: { after: 160 } }),
  table([
    testRow("BUG-ID", "Severity", "Description", "Status", "Repro Steps"),
    // Rows populated during live testing
  ]),
  new Paragraph({ spacing: { after: 200 } }),
  p("[ Bugs will be appended here as discovered during live testing. ]", { color: C.muted }),
  new Paragraph({ children: [new PageBreak()] }),
];

// ─── Recommendations ──────────────────────────────────────────────────────────
const recommendations = [
  h("16. Recommendations & Next Steps"),
  h("Immediate (Pre-Launch Blockers)", HeadingLevel.HEADING_2),
  bullet("[ To be filled after testing — list P0/P1 bugs ]"),
  new Paragraph({ spacing: { after: 160 } }),
  h("Short-Term (Post-Launch)", HeadingLevel.HEADING_2),
  bullet("Add automated E2E test suite (Playwright or Cypress) for critical flows"),
  bullet("Set up Sentry DSN in production environment for live error capture"),
  bullet("Implement proper logging for extension ↔ bridge WebSocket events"),
  bullet("Add retry logic in BullMQ workers for transient scraping failures"),
  new Paragraph({ spacing: { after: 160 } }),
  h("Medium-Term", HeadingLevel.HEADING_2),
  bullet("LinkedIn/Reed CSS selector maintenance strategy (selectors drift)"),
  bullet("Job deduplication across multiple search runs"),
  bullet("Token budget alerts for high-usage AI sessions"),
  bullet("Mobile-first responsive polish pass"),
];

// ─── Assemble Document ────────────────────────────────────────────────────────
const doc = new Document({
  creator: "Atlas Job OS QA",
  title: "Atlas Job OS Beta Testing Report",
  description: "Comprehensive QA and feature validation for the Atlas Job OS beta release",
  styles: {
    default: {
      document: {
        run: { font: "Calibri", size: 22 },
      },
      heading1: {
        run: { font: "Calibri", size: 36, bold: true, color: C.primary },
        paragraph: { spacing: { before: 400, after: 160 } },
      },
      heading2: {
        run: { font: "Calibri", size: 28, bold: true, color: C.accent },
        paragraph: { spacing: { before: 280, after: 120 } },
      },
      heading3: {
        run: { font: "Calibri", size: 24, bold: true, color: C.text },
        paragraph: { spacing: { before: 200, after: 80 } },
      },
    },
  },
  sections: [
    {
      children: [
        ...coverPage,
        ...executiveSummary,
        ...testEnvironment,
        ...authTests,
        ...dashboardTests,
        ...agentTests,
        ...pipelineTests,
        ...cvTests,
        ...settingsTests,
        ...analyticsTests,
        ...extensionTests,
        ...outreachTests,
        ...adminTests,
        ...securityTests,
        ...perfTests,
        ...bugsLog,
        ...recommendations,
      ],
    },
  ],
});

const buf = await Packer.toBuffer(doc);
writeFileSync(OUT, buf);
console.log("✓ Report written to:", OUT);
