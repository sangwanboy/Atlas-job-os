import { spawn } from "child_process";
import path from "path";
import fs from "fs";

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
  /** Resolve Python executable — checks cwd, then walks up to find .venv-scraper in a parent directory */
  private static resolvePythonExe(): string {
    const isWin = process.platform === "win32";
    const exeRelative = isWin ? path.join("Scripts", "python.exe") : path.join("bin", "python");

    // Candidate roots: cwd, then each parent up to filesystem root
    const candidates: string[] = [];
    let dir = process.cwd();
    for (let i = 0; i < 6; i++) {
      candidates.push(path.join(dir, ".venv-scraper"));
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }

    for (const venv of candidates) {
      const exe = path.join(venv, exeRelative);
      if (fs.existsSync(exe)) {
        console.log(`[ScraperService] Using Python at: ${exe}`);
        return exe;
      }
    }

    // Final fallback: system python
    console.warn("[ScraperService] .venv-scraper not found in any parent directory — falling back to system python");
    return isWin ? "python" : "python3";
  }

  private static get pythonExe(): string { return this.resolvePythonExe(); }
  private static get workerPath(): string {
    const rel = path.join("src", "lib", "services", "scraper", "worker.py");
    let dir = process.cwd();
    for (let i = 0; i < 6; i++) {
      const p = path.join(dir, rel);
      if (fs.existsSync(p)) return p;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return path.join(process.cwd(), rel); // fallback
  }

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
