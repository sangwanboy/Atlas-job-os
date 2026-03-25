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

export class ScraperService {
  private static venvPath = path.join(process.cwd(), ".venv-scraper");
  private static pythonExe = process.platform === "win32" 
    ? path.join(this.venvPath, "Scripts", "python.exe")
    : path.join(this.venvPath, "bin", "python");
  private static workerPath = path.join(process.cwd(), "src/lib/services/scraper/worker.py");

  /**
   * Scrapes a URL using the Crawl4AI worker.
   */
  static async scrape(url: string): Promise<ScrapeResult> {
    return new Promise((resolve) => {
      console.log(`[ScraperService] Initiating Crawl4AI for: ${url}`);
      
      const child = spawn(this.pythonExe, [this.workerPath, url]);
      
      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("close", (code) => {
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
          // The last line should be our JSON output
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
