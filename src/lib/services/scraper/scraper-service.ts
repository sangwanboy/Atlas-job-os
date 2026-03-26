import { spawn } from "child_process";
import path from "path";

export type ScrapeResult = {
  success: boolean;
  url: string;
  markdown?: string;
  jobs?: any[];
  metadata?: any;
  error?: string;
  status_code?: number;
};

const SCRAPE_TIMEOUT_MS = 120_000; // 120 seconds — allows Phase 1 (search page) + Phase 2 (concurrent detail pages)

export class ScraperService {
  private static venvPath = path.join(process.cwd(), ".venv-scraper");
  private static pythonExe = process.platform === "win32"
    ? path.join(this.venvPath, "Scripts", "python.exe")
    : path.join(this.venvPath, "bin", "python");
  private static workerPath = path.join(process.cwd(), "src/lib/services/scraper/worker.py");

  /**
   * Scrapes a URL using the Crawl4AI worker with a timeout guard.
   */
  static async scrape(url: string): Promise<ScrapeResult> {
    return new Promise((resolve) => {
      console.log(`[ScraperService] Initiating Crawl4AI for: ${url}`);

      let resolved = false;
      let child: ReturnType<typeof spawn> | null = null;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          console.error(`[ScraperService] Timeout after ${SCRAPE_TIMEOUT_MS}ms for: ${url}`);
          try { child?.kill("SIGKILL"); } catch { /* ignore */ }
          resolve({
            success: false,
            url,
            error: `Scraper timed out after ${SCRAPE_TIMEOUT_MS / 1000}s. The target site may be blocking automated access or the Python scraper environment is not set up.`,
            status_code: 408,
          });
        }
      }, SCRAPE_TIMEOUT_MS);

      try {
        child = spawn(this.pythonExe, [this.workerPath, url]);
      } catch (err) {
        clearTimeout(timeout);
        resolved = true;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[ScraperService] Failed to spawn worker: ${msg}`);
        resolve({
          success: false,
          url,
          error: `Scraper unavailable: ${msg}. The Python scraper environment (.venv-scraper) may not be installed.`,
          status_code: 500,
        });
        return;
      }

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("error", (err) => {
        clearTimeout(timeout);
        if (!resolved) {
          resolved = true;
          console.error(`[ScraperService] Worker process error: ${err.message}`);
          resolve({
            success: false,
            url,
            error: `Scraper process error: ${err.message}. Ensure the Python environment is set up.`,
            status_code: 500,
          });
        }
      });

      child.on("close", (code) => {
        clearTimeout(timeout);
        if (resolved) return;
        resolved = true;

        if (code !== 0) {
          console.error(`[ScraperService] Worker failed with code ${code}. Stderr: ${stderr}`);
          resolve({
            success: false,
            url,
            error: `Crawl4AI worker exited with code ${code}. ${stderr.slice(0, 500)}`,
            status_code: 500
          });
          return;
        }

        try {
          const lines = stdout.trim().split("\n");
          const lastLine = lines[lines.length - 1];
          const result = JSON.parse(lastLine) as ScrapeResult;
          console.log(`[ScraperService] Crawl successful for ${url}`);
          resolve(result);
        } catch (e) {
          console.error(`[ScraperService] Failed to parse JSON output: ${stdout}`);
          resolve({
            success: false,
            url,
            error: `Output parsing failed. Raw output: ${stdout.slice(0, 500)}`,
            status_code: 500
          });
        }
      });
    });
  }
}
