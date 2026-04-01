import { z } from "zod";
import type { BrowserToolInputMap, BrowserToolName } from "../types/browser-types";
import { BrowserServiceError } from "../errors/browser-errors";

const launchBrowserSchema = z
  .object({
    headless: z.boolean().optional(),
  });

const createSessionSchema = z
  .object({
    sessionId: z.string().min(1).optional(),
    userId: z.string().min(1).optional(),
    metadata: z.record(z.unknown()).optional(),
    maxActions: z.number().int().positive().optional(),
  });

const openPageSchema = z
  .object({
    sessionId: z.string().min(1),
  });

const navigateSchema = z
  .object({
    sessionId: z.string().min(1),
    url: z.string().url(),
    pageId: z.string().min(1).optional(),
  });

const clickSchema = z
  .object({
    sessionId: z.string().min(1),
    selector: z.string().min(1),
    pageId: z.string().min(1).optional(),
  });

const typeSchema = z
  .object({
    sessionId: z.string().min(1),
    selector: z.string().min(1),
    text: z.string().max(20_000),
    clearFirst: z.boolean().optional(),
    pageId: z.string().min(1).optional(),
  });

const scrollSchema = z
  .object({
    sessionId: z.string().min(1),
    x: z.number().int().optional(),
    y: z.number().int().optional(),
    pageId: z.string().min(1).optional(),
  });

const extractTextSchema = z
  .object({
    sessionId: z.string().min(1),
    selector: z.string().min(1).optional(),
    maxLength: z.number().int().positive().max(100_000).optional(),
    pageId: z.string().min(1).optional(),
  });

const linkedinFiltersSchema = z.object({
  timePosted: z.enum(["past-24h", "past-week", "past-month"]).optional(),
  jobType: z.array(z.enum(["F", "P", "C", "I", "T", "full-time", "part-time", "contract", "internship", "temporary"])).optional(),
  remote: z.array(z.enum(["1", "2", "3", "on-site", "remote", "hybrid"])).optional(),
  experienceLevel: z.array(z.enum(["1", "2", "3", "4", "5", "6", "internship", "entry", "associate", "mid-senior", "director" , "executive"])).optional(),
}).optional();

const extractJobsSchema = z
  .object({
    sessionId: z.string().min(1),
    searchTerm: z.string().optional(),
    location: z.string().optional(),
    selector: z.string().min(1).optional(),
    pageId: z.string().min(1).optional(),
    enrich: z.boolean().optional(),
    linkedinFilters: linkedinFiltersSchema,
  });

const enrichJobsSchema = z
  .object({
    sessionId: z.string().min(1),
    jobs: z.array(z.object({
      url: z.string().min(1),
      title: z.string().optional(),
      company: z.string().optional(),
    })).min(1),
    pageId: z.string().min(1).optional(),
  });

const screenshotSchema = z
  .object({
    sessionId: z.string().min(1),
    fileName: z.string().min(1).max(180).optional(),
    fullPage: z.boolean().optional(),
    pageId: z.string().min(1).optional(),
  });

const closeSessionSchema = z
  .object({
    sessionId: z.string().min(1),
  });

const acceptCookiesSchema = z
  .object({
    sessionId: z.string().min(1),
    pageId: z.string().min(1).optional(),
  });

const captureDomSchema = z
  .object({
    sessionId: z.string().min(1),
    pageId: z.string().min(1).optional(),
    prompt: z.string().max(2000).optional(),
    includeScreenshot: z.boolean().optional(),
  });

const schemaMap: { [K in BrowserToolName]: z.ZodType<BrowserToolInputMap[K]> } = {
  browser_launch_browser: launchBrowserSchema,
  browser_create_session: createSessionSchema,
  browser_open_session: createSessionSchema,
  browser_open_page: openPageSchema,
  browser_navigate: navigateSchema,
  browser_click: clickSchema,
  browser_type: typeSchema,
  browser_scroll: scrollSchema,
  browser_extract_text: extractTextSchema,
  browser_extract_jobs: extractJobsSchema,
  browser_enrich_jobs: enrichJobsSchema,
  browser_screenshot: screenshotSchema,
  browser_accept_cookies: acceptCookiesSchema,
  browser_capture_dom: captureDomSchema,
  browser_close_session: closeSessionSchema,
  browser_resume: z.object({ sessionId: z.string().min(1) }),
  browser_extension_status: z.object({}),
  browser_extension_extract_jobs: z.object({
    searchUrl: z.string().url(),
    query: z.string().optional(),
    location: z.string().optional(),
  }),
  browser_extension_enrich_job: z.object({ url: z.string().url() }),
};

export function validateBrowserToolInput<K extends BrowserToolName>(
  tool: K,
  input: unknown,
): BrowserToolInputMap[K] {
  const parsed = schemaMap[tool].safeParse(input ?? {});
  if (!parsed.success) {
    throw new BrowserServiceError({
      code: "VALIDATION_FAILED",
      message: `Invalid input for ${tool}`,
      retriable: false,
      details: {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
    });
  }
  return parsed.data;
}
