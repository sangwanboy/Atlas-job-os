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

const SCRAPE_TIMEOUT_MS = 45_000; // 45 seconds max per scrape

export class ScraperService {
  private static venvPath = path.join(process.cwd(), ".venv-scraper");
  private static pythonExe = process.platform === "win32"
    ? path.join(this.venvPath, "Scripts", "python.exe")
    : path.join(this.venvPath, "bin", "python");
  private static workerPath = path.join(process.cwd(), "src/lib/services/scraper/worker.py");

  /**
   * Scrapes a URL using the Crawl4AI worker with a hard timeout.
   */
  static async scrape(url: string): Promise<ScrapeResult> {
    return new Promise((resolve) => {
      let resolved = false;
      const finish = (result: ScrapeResult) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        resolve(result);
      };

      console.log(`[ScraperService] Initiating Crawl4AI for: ${url}`);

      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(this.pythonExe, [this.workerPath, url]);
      } catch (spawnErr) {
        const msg = spawnErr instanceof Error ? spawnErr.message : String(spawnErr);
        console.error(`[ScraperService] Failed to spawn worker: ${msg}`);
        finish({ success: false, url, error: `Failed to spawn Crawl4AI worker: ${msg}`, status_code: 500 });
        return;
      }

      // Hard timeout — kill the child process if it takes too long
      const timer = setTimeout(() => {
        console.error(`[ScraperService] Timeout after ${SCRAPE_TIMEOUT_MS}ms for: ${url}`);
        try { child.kill("SIGKILL"); } catch {}
        finish({ success: false, url, error: `Crawl4AI worker timed out after ${SCRAPE_TIMEOUT_MS / 1000}s`, status_code: 504 });
      }, SCRAPE_TIMEOUT_MS);

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("error", (err) => {
        console.error(`[ScraperService] Spawn error: ${err.message}`);
        finish({ success: false, url, error: `Worker spawn error: ${err.message}`, status_code: 500 });
      });

      child.on("close", (code) => {
        clearTimeout(timeout);
        if (resolved) return;
        resolved = true;

        if (code !== 0) {
          console.error(`[ScraperService] Worker failed with code ${code}. Stderr: ${stderr}`);
          finish({
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
          finish(result);
        } catch (e) {
          console.error(`[ScraperService] Failed to parse JSON output: ${stdout}`);
          finish({
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
