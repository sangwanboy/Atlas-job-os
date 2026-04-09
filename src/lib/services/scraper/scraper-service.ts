/**
 * ScraperService — Extension-based stub
 * The Python worker (worker.py) has been removed. All scraping now happens
 * via the Chrome extension bridge (extensionBridge.scrapeJobListing).
 *
 * This stub maintains the original API surface so existing callers (queue
 * workers, API routes, scripts) continue to compile without changes.
 * Active code paths in the orchestrator have been updated to call
 * extensionBridge.scrapeJobListing() directly.
 */

export type ScrapeResult = {
  success: boolean;
  url?: string;
  site?: string;
  markdown?: string;
  jobs?: JobResult[];
  errors?: { url: string; error: string }[];
  total?: number;
  metadata?: any;
  error?: string;
  status_code?: number;
  dom_sample?: string;
};

export type JobResult = {
  title: string;
  company?: string;
  location?: string;
  salary?: string;
  date_posted?: string;
  url?: string;
  source?: string;
  description?: string;
  skills?: string;
};

export class ScraperService {
  /** @deprecated Use extensionBridge.scrapeJobListing() directly. */
  static async scrape(_url: string, _query = ""): Promise<ScrapeResult> {
    return { success: false, error: "Python worker removed — use extensionBridge.scrapeJobListing()", jobs: [] };
  }

  /** @deprecated Use extensionBridge.scrapeJobListing() directly. */
  static async scrapeMultiple(_urls: string[], _query = ""): Promise<ScrapeResult> {
    return { success: false, error: "Python worker removed — use extensionBridge.scrapeJobListing()", jobs: [] };
  }
}
