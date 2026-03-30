import { spawn } from "child_process";
import path from "path";

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

// Detail scraping + optional CAPTCHA solve window — allow up to 6 minutes
const SCRAPE_TIMEOUT_MS = 360_000;

export class ScraperService {
  private static venvPath = path.join(process.cwd(), ".venv-scraper");
  private static pythonExe = process.platform === "win32"
    ? path.join(this.venvPath, "Scripts", "python.exe")
    : path.join(this.venvPath, "bin", "python");
  private static workerPath = path.join(process.cwd(), "src/lib/services/scraper/worker.py");

  /** Scrape multiple URLs with optional query for relevance filtering. */
  static async scrapeMultiple(urls: string[], query = ""): Promise<ScrapeResult> {
    if (urls.length === 0) return { success: false, error: "No URLs provided", jobs: [] };
    if (urls.length === 1) return this.scrape(urls[0], query);
    return this.runWorker(urls, urls[0], query);
  }

  /** Scrape a single URL using the human-like Playwright worker. */
  static async scrape(url: string, query = ""): Promise<ScrapeResult> {
    return this.runWorker([url], url, query);
  }

  private static runWorker(args: string[], primaryUrl: string, query = ""): Promise<ScrapeResult> {
    return new Promise((resolve) => {
      let resolved = false;
      const finish = (result: ScrapeResult) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        resolve(result);
      };

      console.log(`[ScraperService] Initiating Crawl4AI for: ${args.join(", ")}`);

      let child: ReturnType<typeof spawn>;
      try {
        const workerArgs = query
          ? [this.workerPath, "--query", query, "--headful-on-block", ...args]
          : [this.workerPath, "--headful-on-block", ...args];
        child = spawn(this.pythonExe, workerArgs);
      } catch (spawnErr) {
        const msg = spawnErr instanceof Error ? spawnErr.message : String(spawnErr);
        finish({ success: false, url: primaryUrl, error: `Failed to spawn worker: ${msg}`, status_code: 500 });
        return;
      }

      const timer = setTimeout(() => {
        try { child.kill("SIGKILL"); } catch {}
        finish({ success: false, url: primaryUrl, error: `Worker timed out after ${SCRAPE_TIMEOUT_MS / 1000}s`, status_code: 504 });
      }, SCRAPE_TIMEOUT_MS);

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (data: Buffer) => { stdout += data.toString(); });
      child.stderr?.on("data", (data: Buffer) => { stderr += data.toString(); });

      child.on("error", (err: Error) => {
        finish({ success: false, url: primaryUrl, error: `Worker spawn error: ${err.message}`, status_code: 500 });
      });

      child.on("close", (code: number | null) => {
        if (resolved) return;

        if (code !== 0) {
          console.error(`[ScraperService] Worker failed code=${code}. stderr: ${stderr.slice(0, 300)}`);
          finish({ success: false, url: primaryUrl, error: `Worker exited with code ${code}. ${stderr.slice(0, 400)}`, status_code: 500 });
          return;
        }

        try {
          const lines = stdout.trim().split("\n").filter(Boolean);
          const lastLine = lines[lines.length - 1];
          const result = JSON.parse(lastLine) as ScrapeResult;
          console.log(`[ScraperService] Crawl done — ${result.jobs?.length ?? 0} jobs`);
          finish(result);
        } catch {
          finish({ success: false, url: primaryUrl, error: `Output parse failed: ${stdout.slice(0, 300)}`, status_code: 500 });
        }
      });
    });
  }
}
