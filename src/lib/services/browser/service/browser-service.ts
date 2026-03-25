import { EventEmitter } from "node:events";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import { getBrowserRuntimeConfig } from "../config/browser-config";
import { BrowserServiceError, toBrowserServiceError } from "../errors/browser-errors";
import { browserActionLogger, BrowserActionLogger } from "../logger/browser-action-logger";
import {
  browserSessionManager,
  BrowserSessionManager,
} from "../session-manager/browser-session-manager";
import type {
  BrowserActionResult,
  BrowserConfirmationHook,
  BrowserCreateSessionInput,
  BrowserToolName,
  BrowserLaunchInput,
  BrowserOpenPageInput,
  BrowserNavigateInput,
  BrowserClickInput,
  BrowserTypeInput,
  BrowserScrollInput,
  BrowserExtractTextInput,
  BrowserExtractJobsInput,
  LinkedInFilters,
  BrowserEnrichJobsInput,
  BrowserScreenshotInput,
  BrowserCloseSessionInput,
  BrowserRuntimeConfig,
  BrowserSessionSnapshot,
  BrowserObserverEvent,
  BrowserSessionStatus,
} from "../types/browser-types";

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function isRetriable(error: BrowserServiceError): boolean {
  if (error.retriable) {
    return true;
  }

  const nonRetriableCodes = new Set([
    "VALIDATION_FAILED",
    "SESSION_NOT_FOUND",
    "PAGE_NOT_FOUND",
    "DOMAIN_BLOCKED",
    "ACTION_LIMIT_REACHED",
    "CONFIRMATION_REJECTED",
  ]);

  return !nonRetriableCodes.has(error.code);
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new BrowserServiceError({
          code: "ACTION_FAILED",
          message: `Browser action timed out after ${timeoutMs}ms`,
          retriable: true,
        }),
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation, timeoutPromise]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export class BrowserService extends EventEmitter {
  private browser: Browser | null = null;
  private scraplingCache = new Map<string, any[]>();

  constructor(
    private readonly config: BrowserRuntimeConfig = getBrowserRuntimeConfig(),
    private readonly sessionManager: BrowserSessionManager = browserSessionManager,
    private readonly actionLogger: BrowserActionLogger = browserActionLogger,
    private readonly confirmationHook: BrowserConfirmationHook = async () => true,
  ) {
    super();
  }

  private emitObserverEvent(event: Omit<BrowserObserverEvent, "timestamp">) {
    const fullEvent: BrowserObserverEvent = {
      ...event,
      timestamp: new Date().toISOString(),
    };
    console.log(`[BrowserService] Emitting observation: ${fullEvent.type} for SID: ${fullEvent.sessionId}`);
    this.emit("observation", fullEvent);
  }

  // --- Human-Like Stealth Helpers ---
  
  private async humanDelay(min = 800, max = 2500) {
    const delay = Math.floor(Math.random() * (max - min + 1) + min);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  private async mouseJiggle(page: any) {
    try {
      const { width, height } = page.viewportSize() || { width: 1280, height: 800 };
      const x = Math.floor(Math.random() * width);
      const y = Math.floor(Math.random() * height);
      await page.mouse.move(x, y, { steps: 5 });
    } catch {}
  }

  private async smoothScroll(page: any, distance: number) {
    const steps = 5;
    const stepSize = distance / steps;
    for (let i = 0; i < steps; i++) {
      await page.mouse.wheel(0, stepSize);
      await this.humanDelay(100, 300);
    }
  }

  private async captureObserverScreenshot(sessionId: string, pageId?: string, actionName?: string) {
    try {
      const result = await this.screenshot({
        sessionId,
        pageId,
        fileName: `observer-${sessionId}-${Date.now()}.png`,
        fullPage: false // Efficient capture for live view
      });
      if (result.status === "ok" && result.data) {
        this.sessionManager.setLastScreenshot(sessionId, result.data.filePath);
        this.emitObserverEvent({
          sessionId,
          type: "media",
          action: actionName,
          screenshot: result.data.filePath,
        } as any);
      }
    } catch (err) {
      console.warn(`[BrowserService] Observer screenshot failed:`, err);
    }
  }

  async getPageContent(sessionId: string, pageId?: string): Promise<string> {
    const session = this.sessionManager.getSession(sessionId);
    let page: any;
    
    if (pageId) {
      page = this.sessionManager.getPage(sessionId, pageId).page;
    } else {
      const pageIds = Array.from(session.pages.keys());
      if (pageIds.length === 0) {
        throw new Error(`No pages found in session ${sessionId}`);
      }
      page = session.pages.get(pageIds[0]);
    }
    
    if (!page) {
      throw new Error(`Page not found for session ${sessionId}`);
    }
    return await page.content();
  }

  async launchBrowser(
    input: BrowserLaunchInput = {},
  ): Promise<BrowserActionResult<{ browserReady: boolean; browserName: string }>> {
    return this.executeAction("browser_launch_browser", undefined, async () => {
      if (!this.browser) {
        const headless = input.headless ?? this.config.headless;
        this.browser = await chromium.launch({
          headless,
          slowMo: this.config.slowMo,
          args: [
            "--disable-blink-features=AutomationControlled",
            "--no-sandbox",
            "--disable-setuid-sandbox",
          ],
        });
        console.log(`[BrowserService] Browser launched (headless: ${headless}, mode: ${this.config.mode})`);
      }

      return {
        browserReady: true,
        browserName: "chromium",
      };
    });
  }

  async createSession(
    input: BrowserCreateSessionInput,
  ): Promise<BrowserActionResult<{ sessionId: string; createdAt: string; actionCount: number; maxActions: number }>> {
    return this.executeAction("browser_create_session", undefined, async () => {
      await this.ensureBrowserReady();

      const userAgents = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
      ];
      const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];

      const context = await this.getBrowser().newContext({
        userAgent: randomUA,
        viewport: { 
          width: 1280 + Math.floor(Math.random() * 100), 
          height: 800 + Math.floor(Math.random() * 100) 
        },
        deviceScaleFactor: Math.random() > 0.5 ? 1 : 2,
        hasTouch: Math.random() > 0.8,
        colorScheme: Math.random() > 0.5 ? "dark" : "light",
        locale: "en-GB",
        timezoneId: "Europe/London",
      });

      // Advanced Stealth Layer (Learning from Scrapling/Playwright Stealth)
      await context.addInitScript(() => {
        // 1. Mask WebDriver
        Object.defineProperty(navigator, "webdriver", { get: () => undefined });

        // 2. Mock Chrome Runtime
        // @ts-ignore
        window.chrome = {
          runtime: {},
          loadTimes: () => {},
          csi: () => {},
          app: {}
        };

        // 3. Fake Permissions
        const originalQuery = window.navigator.permissions.query;
        // @ts-ignore
        window.navigator.permissions.query = (parameters) => (
          parameters.name === 'notifications' ?
            Promise.resolve({ state: Notification.permission }) :
            originalQuery(parameters)
        );

        // 4. Randomized Hardware
        Object.defineProperty(navigator, "languages", { get: () => ["en-GB", "en-US", "en"] });
        Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8 });
        Object.defineProperty(navigator, "deviceMemory", { get: () => 16 });

        // 5. Mock Plugins
        Object.defineProperty(navigator, "plugins", {
          get: () => [
            { name: "Chrome PDF Viewer", filename: "internal-pdf-viewer", description: "Portable Document Format" },
            { name: "Chromium PDF Viewer", filename: "internal-pdf-viewer", description: "Portable Document Format" },
            { name: "Microsoft Edge PDF Viewer", filename: "internal-pdf-viewer", description: "Portable Document Format" }
          ]
        });

        // 6. Canvas Stealth (Subtle noise injection)
        const originalGetContext = HTMLCanvasElement.prototype.getContext;
        (HTMLCanvasElement.prototype as any).getContext = function(type: string, attributes: any) {
          const context = originalGetContext.call(this, type, attributes);
          if (type === '2d' && context) {
            const originalFillText = (context as CanvasRenderingContext2D).fillText;
            (context as any).fillText = function() {
              return originalFillText.apply(this, arguments as any);
            };
          }
          return context;
        };
      });

      const snapshot = this.sessionManager.createSession({
        context,
        maxActions: input.maxActions ?? 50,
        userId: input.userId,
        metadata: {
          ...input.metadata,
          userAgent: randomUA,
          stealth: "active",
          mode: this.config.mode,
        },
      });

      this.emitObserverEvent({
        sessionId: snapshot.sessionId,
        type: "status",
        status: "active",
        detail: "Session initialized"
      });

      if (this.config.enableTracing) {
        await context.tracing.start({ 
          screenshots: true, 
          snapshots: true, 
          sources: true,
          title: `Session ${snapshot.sessionId}` 
        });
      }

      this.emitObserverEvent({
        sessionId: snapshot.sessionId,
        type: "status",
        status: "active",
        detail: "Session initialized and tracing started"
      });

      return {
        sessionId: snapshot.sessionId,
        createdAt: snapshot.createdAt,
        actionCount: snapshot.actionCount,
        maxActions: snapshot.maxActions,
      };
    });
  }

  async openPage(
    input: BrowserOpenPageInput,
  ): Promise<BrowserActionResult<{ sessionId: string; pageId: string; url: string }>> {
    return this.executeSessionAction("browser_open_page", input.sessionId, async () => {
      const session = this.sessionManager.getSession(input.sessionId);
      const page = await session.context.newPage();
      const pageId = this.sessionManager.attachPage(input.sessionId, page);

      await page.goto("about:blank", {
        waitUntil: "domcontentloaded",
        timeout: this.config.defaultTimeoutMs,
      });

      return {
        sessionId: input.sessionId,
        pageId,
        url: page.url(),
      };
    });
  }

  private buildLinkedInUrl(query: string, location: string, filters?: LinkedInFilters): string {
    const url = new URL("https://www.linkedin.com/jobs/search/");
    url.searchParams.set("keywords", query);
    url.searchParams.set("location", location);
    
    if (filters) {
      if (filters.timePosted) {
        const timeMap = { "past-24h": "r86400", "past-week": "r604800", "past-month": "r2592000" };
        url.searchParams.set("f_TPR", timeMap[filters.timePosted as keyof typeof timeMap]);
      }
      if (filters.jobType && filters.jobType.length > 0) {
        const typeMap: Record<string, string> = { 
          "full-time": "F", "part-time": "P", "contract": "C", 
          "internship": "I", "temporary": "T",
          "F": "F", "P": "P", "C": "C", "I": "I", "T": "T"
        };
        const types = filters.jobType.map((t: string) => typeMap[t] || t).join(",");
        url.searchParams.set("f_JT", types);
      }
      if (filters.remote && filters.remote.length > 0) {
        const remoteMap: Record<string, string> = { "on-site": "1", "remote": "2", "hybrid": "3", "1": "1", "2": "2", "3": "3" };
        const types = filters.remote.map((r: string) => remoteMap[r as keyof typeof remoteMap] || r).join(",");
        url.searchParams.set("f_WT", types);
      }
      if (filters.experienceLevel && filters.experienceLevel.length > 0) {
        const expMap: Record<string, string> = {
          "internship": "1", "entry": "2", "associate": "3", 
          "mid-senior": "4", "director": "5", "executive": "6",
          "1": "1", "2": "2", "3": "3", "4": "4", "5": "5", "6": "6"
        };
        const levels = filters.experienceLevel.map((l: string) => expMap[l] || l).join(",");
        url.searchParams.set("f_E", levels);
      }
    }
    return url.toString();
  }

  private async humanizedDelay(min = 300, max = 1000) {
    const delay = Math.floor(Math.random() * (max - min + 1) + min);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  private async detectProtection(sessionId: string, page: any): Promise<BrowserSessionStatus> {
    const url = page.url();
    const title = await page.title();
    
    const isBlocked = 
      url.includes("google.com/sorry") || 
      url.includes("consent.google.com") ||
      url.includes("linkedin.com/checkpoint") ||
      title.toLowerCase().includes("robot") || 
      title.toLowerCase().includes("captcha") ||
      title.toLowerCase().includes("verify you are human") ||
      title.toLowerCase().includes("access denied") ||
      title.includes("Before you continue");

    if (isBlocked) {
      this.sessionManager.updateStatus(sessionId, "protected");
      this.emitObserverEvent({
        sessionId,
        type: "protect",
        status: "protected",
        url,
        title,
        detail: `Security/Consent wall detected at ${url}`
      });
      return "protected";
    }

    this.sessionManager.updateStatus(sessionId, "active");
    return "active";
  }

  private updateSessionHistory(sessionId: string, tool: string, status: "ok" | "error", url?: string, detail?: string) {
    this.sessionManager.addHistory(sessionId, { tool, status, url, detail });
    this.emitObserverEvent({
      sessionId,
      type: "action",
      action: tool,
      status: status === "ok" ? "active" : "error",
      url,
      detail: detail || `${tool} executed with status ${status}`
    });
  }

  async navigate(
    input: BrowserNavigateInput,
  ): Promise<BrowserActionResult<{ sessionId: string; pageId: string; url: string; title: string; usedScrapling?: boolean }>> {
    return this.executeSessionAction("browser_navigate", input.sessionId, async () => {
      this.assertUrlAllowed(input.url);
      await this.requireConfirmation("browser_navigate", input.sessionId, "Navigate to a new URL", input.url);

      const resolved = await this.getOrCreatePage(input.sessionId, input.pageId);
      
      this.emitObserverEvent({
        sessionId: input.sessionId,
        type: "status",
        status: "active",
        detail: `Navigating to ${input.url}...`
      });

      await this.humanizedDelay(300, 800);

      let usedScrapling = false;
      let title = "";

      const shouldScrape = input.useScrapling !== false;
      const isJobBoard = /linkedin|indeed|google|jobs|career|greenhouse|lever/i.test(input.url);

      if (shouldScrape) {
          console.log(`[BrowserService] Navigating to ${input.url} via Scrapling (Universal Mode)`);
          const scraplingResult = await this.runScrapling(input.url, isJobBoard ? "job" : "auto");
          
          if (scraplingResult.status === "ok" && !scraplingResult.is_blocked) {
              await resolved.page.setContent(scraplingResult.content);
              usedScrapling = true;
              title = scraplingResult.title || "Loaded via Scrapling";
              
              if (scraplingResult.jobs && scraplingResult.jobs.length > 0) {
                  this.scraplingCache.set(resolved.pageId, scraplingResult.jobs);
              }
          }
      }

      if (!usedScrapling) {
        await this.captureObserverScreenshot(input.sessionId, resolved.pageId, "navigate_start");
        await resolved.page.goto(input.url, {
          waitUntil: "domcontentloaded",
          timeout: this.config.defaultTimeoutMs,
        });
        await this.captureObserverScreenshot(input.sessionId, resolved.pageId, "navigate_end");
        title = await resolved.page.title();
      }

      const status = await this.detectProtection(input.sessionId, resolved.page);
      this.updateSessionHistory(input.sessionId, "browser_navigate", "ok", input.url, status === "protected" ? "Security wall detected" : undefined);
      await this.captureObserverScreenshot(input.sessionId, resolved.pageId, "browser_navigate");

      await this.humanizedDelay(500, 1500);

      return {
        sessionId: input.sessionId,
        pageId: resolved.pageId,
        url: resolved.page.url(),
        title,
        usedScrapling
      };
    });
  }

  private async runScrapling(input: string, mode: "auto" | "job" = "auto", contextUrl?: string): Promise<{ status: string; content: string; title: string; jobs: any[]; is_blocked: boolean }> {
    const { exec } = await import("node:child_process");
    const { writeFile, unlink } = await import("node:fs/promises");
    const scriptPath = path.join(process.cwd(), "src/lib/services/browser/service/scrapling_worker.py");
    
    let target = input;
    let isHtml = input.trim().startsWith("<") || input.trim().startsWith("<!doctype");
    let tempPath = "";

    if (isHtml) {
      tempPath = path.join(process.cwd(), `temp_scrape_${Date.now()}.html`);
      await writeFile(tempPath, input);
      target = tempPath;
    }

    return new Promise((resolve) => {
      const urlArg = contextUrl ? `"${contextUrl}"` : `""`;
      exec(`python "${scriptPath}" "${target}" "${mode}" ${urlArg}`, async (error, stdout, stderr) => {
        if (tempPath) await unlink(tempPath).catch(() => {});
        
        if (error) {
          console.error(`[BrowserService] Scrapling Error:`, stderr);
          resolve({ status: "error", content: "", title: "", jobs: [], is_blocked: true });
          return;
        }
        try {
          const jsonMatch = stdout.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            resolve(JSON.parse(jsonMatch[0]));
          } else {
            resolve({ status: "error", content: "", title: "", jobs: [], is_blocked: true });
          }
        } catch (e) {
          resolve({ status: "error", content: "", title: "", jobs: [], is_blocked: true });
        }
      });
    });
  }

  async click(input: BrowserClickInput): Promise<BrowserActionResult<{ sessionId: string; pageId: string; selector: string }>> {
    return this.executeSessionAction("browser_click", input.sessionId, async () => {
      await this.requireConfirmation("browser_click", input.sessionId, "Click selector", input.selector);
      const resolved = this.sessionManager.getPage(input.sessionId, input.pageId);
      await this.humanizedDelay(200, 600);
      await this.captureObserverScreenshot(input.sessionId, resolved.pageId, "click_start");
      await resolved.page.locator(input.selector).first().click({ timeout: this.config.defaultTimeoutMs });
      await this.captureObserverScreenshot(input.sessionId, resolved.pageId, "click_end");
      this.updateSessionHistory(input.sessionId, "browser_click", "ok", undefined, `Clicked ${input.selector}`);
      return { sessionId: input.sessionId, pageId: resolved.pageId, selector: input.selector };
    });
  }

  async type(input: BrowserTypeInput): Promise<BrowserActionResult<{ sessionId: string; pageId: string; selector: string; typedLength: number }>> {
    return this.executeSessionAction("browser_type", input.sessionId, async () => {
      await this.requireConfirmation("browser_type", input.sessionId, "Type text into selector", input.selector);
      const resolved = this.sessionManager.getPage(input.sessionId, input.pageId);
      const locator = resolved.page.locator(input.selector).first();
      await this.humanizedDelay(100, 300);
      await this.captureObserverScreenshot(input.sessionId, resolved.pageId, "type_start");
      if (input.clearFirst ?? true) {
        await locator.fill(input.text, { timeout: this.config.defaultTimeoutMs });
      } else {
        await locator.type(input.text, { timeout: this.config.defaultTimeoutMs });
      }
      await this.captureObserverScreenshot(input.sessionId, resolved.pageId, "type_end");
      this.updateSessionHistory(input.sessionId, "browser_type", "ok", undefined, `Typed into ${input.selector}`);
      return { sessionId: input.sessionId, pageId: resolved.pageId, selector: input.selector, typedLength: input.text.length };
    });
  }

  async scroll(input: BrowserScrollInput): Promise<BrowserActionResult<{ sessionId: string; pageId: string; x: number; y: number }>> {
    return this.executeSessionAction("browser_scroll", input.sessionId, async () => {
      const resolved = this.sessionManager.getPage(input.sessionId, input.pageId);
      const x = input.x ?? 0;
      const y = input.y ?? 500;
      await this.captureObserverScreenshot(input.sessionId, resolved.pageId, "scroll_start");
      await resolved.page.evaluate(([dx, dy]) => { window.scrollBy(dx, dy); }, [x, y]);
      await this.captureObserverScreenshot(input.sessionId, resolved.pageId, "scroll_end");
      this.updateSessionHistory(input.sessionId, "browser_scroll", "ok", undefined, `Scrolled by [${x}, ${y}]`);
      return { sessionId: input.sessionId, pageId: resolved.pageId, x, y };
    });
  }

  async extractText(
    input: BrowserExtractTextInput,
  ): Promise<BrowserActionResult<{ sessionId: string; pageId: string; text: string; length: number }>> {
    return this.executeSessionAction("browser_extract_text", input.sessionId, async () => {
      const resolved = this.sessionManager.getPage(input.sessionId, input.pageId);
      const maxLength = input.maxLength ?? 8_000;
      const text = input.selector
        ? await resolved.page.locator(input.selector).first().innerText({ timeout: this.config.defaultTimeoutMs })
        : await resolved.page.locator("body").first().innerText({ timeout: this.config.defaultTimeoutMs });
      const normalizedText = text.trim().slice(0, maxLength);
      this.updateSessionHistory(input.sessionId, "browser_extract_text", "ok", undefined, `Extracted ${normalizedText.length} chars`);
      return { sessionId: input.sessionId, pageId: resolved.pageId, text: normalizedText, length: normalizedText.length };
    });
  }

  async extractJobs(
    input: BrowserExtractJobsInput,
  ): Promise<any> {
    return this.executeSessionAction("browser_extract_jobs", input.sessionId, async () => {
      const resolved = this.sessionManager.getPage(input.sessionId, input.pageId);
      const currentUrl = resolved.page.url();
      const isLinkedIn = currentUrl.includes("linkedin.com");

      // 1. Behavioral Stealth: Jiggle and Scroll to trigger hydration/loaders
      await this.mouseJiggle(resolved.page);
      await this.smoothScroll(resolved.page, 400);
      await this.humanizedDelay(1500, 3000);

      // 2. URL Correction if needed (LinkedIn specific)
      if (input.searchTerm && isLinkedIn && (currentUrl.includes("undefined") || !currentUrl.includes("keywords="))) {
        const query = input.searchTerm;
        const location = input.location || "London";
        const filteredUrl = this.buildLinkedInUrl(query, location, input.linkedinFilters);
        console.log(`[BrowserService] Correcting invalid LinkedIn URL to: ${filteredUrl}`);
        await resolved.page.goto(filteredUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
      }

      // 3. Live DOM Extraction
      const html = await resolved.page.content();
      const scraplingResult = await this.runScrapling(html, "job", currentUrl);
      const rawJobs = scraplingResult.status === "ok" ? scraplingResult.jobs : [];
      
      const jobs = rawJobs.map((job: any) => ({
        ...job,
        id: Buffer.from(`${job.title}-${job.company}-${job.location}`).toString("base64"),
        link: job.url || "", 
        source: "Agent Search", 
        description: `${job.location}, ${job.date_posted || 'recently'}`
      }));

      this.updateSessionHistory(input.sessionId, "browser_extract_jobs", "ok", undefined, `Extracted ${jobs.length} jobs via Live DOM`);
      await this.captureObserverScreenshot(input.sessionId, resolved.pageId, "browser_extract_jobs");

      return {
        sessionId: input.sessionId,
        pageId: resolved.pageId,
        url: currentUrl,
        jobs,
        count: jobs.length
      };
    });
  }

  private async internalEnrichJobs(
    sessionId: string,
    pageId: string | undefined,
    jobs: Array<{ url: string; title?: string; company?: string; location?: string; salary?: string }>,
  ): Promise<{ sessionId: string; pageId: string; jobs: any[] }> {
    const resolved = this.sessionManager.getPage(sessionId, pageId);
    const enrichedJobs: any[] = [];
    const jobsToProcess = jobs.slice(0, 10);

    for (const job of jobsToProcess) {
      try {
        await resolved.page.goto(job.url, { waitUntil: "domcontentloaded", timeout: 15000 });
        await resolved.page.waitForSelector(".description__text, .show-more-less-html__snippet, .job-description, .artdeco-card, .jobs-description", { timeout: 5000 }).catch(() => {});

        const details = await resolved.page.evaluate(() => {
          const descSelectors = [".description__text--rich", ".show-more-less-html__snippet", ".job-description", ".jobs-description__container", ".jobs-box__html-content"];
          let description = "";
          for (const sel of descSelectors) {
            const el = document.querySelector(sel);
            if (el && el.textContent?.trim().length && el.textContent.trim().length > 50) {
              description = el.textContent.trim();
              if (description.length > 200) break; 
            }
          }
          return { description: description.slice(0, 4000) };
        });

        enrichedJobs.push({
          ...job,
          description: details.description || "No full description could be extracted.",
          id: Buffer.from(`${job.title}-${job.company}-${job.location}`).toString("base64")
        });
      } catch (err) {
        enrichedJobs.push({ ...job, description: "Deep extraction timed out. Metadata preserved." });
      }
    }

    return { sessionId, pageId: resolved.pageId, jobs: enrichedJobs };
  }

  async enrichJobs(input: BrowserEnrichJobsInput): Promise<BrowserActionResult<{ sessionId: string; pageId: string; jobs: Array<any> }>> {
    return this.executeSessionAction("browser_enrich_jobs", input.sessionId, async () => {
      return this.internalEnrichJobs(input.sessionId, input.pageId, input.jobs);
    });
  }

  async screenshot(input: BrowserScreenshotInput): Promise<BrowserActionResult<{ sessionId: string; pageId: string; filePath: string }>> {
    return this.executeSessionAction("browser_screenshot", input.sessionId, async () => {
      const resolved = this.sessionManager.getPage(input.sessionId, input.pageId);
      await mkdir(this.config.screenshotDir, { recursive: true });
      const fileName = sanitizeFileName(input.fileName || `${input.sessionId}-${Date.now()}.png`);
      const filePath = path.join(this.config.screenshotDir, fileName);
      await resolved.page.screenshot({ path: filePath, fullPage: input.fullPage ?? true, timeout: this.config.defaultTimeoutMs });
      return { sessionId: input.sessionId, pageId: resolved.pageId, filePath };
    });
  }

  async closeSession(input: BrowserCloseSessionInput): Promise<BrowserActionResult<{ sessionId: string; closed: boolean }>> {
    return this.executeAction("browser_close_session", input.sessionId, async () => {
      const closed = await this.sessionManager.closeSession(input.sessionId);
      return { sessionId: input.sessionId, closed };
    });
  }

  async resumeSession(input: { sessionId: string }): Promise<BrowserActionResult<{ sessionId: string; status: BrowserSessionStatus }>> {
    return this.executeAction("browser_resume", input.sessionId, async () => {
      const snapshot = this.sessionManager.updateStatus(input.sessionId, "active");
      this.updateSessionHistory(input.sessionId, "browser_resume", "ok", undefined, "Session resumed by user");
      return {
        sessionId: input.sessionId,
        status: snapshot.status
      };
    });
  }

  listSessions(): BrowserSessionSnapshot[] {
    return this.sessionManager.listSessions();
  }

  async shutdownBrowser(): Promise<void> {
    if (!this.browser) {
      return;
    }

    for (const session of this.sessionManager.listSessions()) {
      await this.sessionManager.closeSession(session.sessionId);
    }

    await this.browser.close();
    this.browser = null;
  }

  private async ensureBrowserReady() {
    if (!this.browser) {
      await this.launchBrowser({});
    }
  }

  private getBrowser(): Browser {
    if (!this.browser) {
      throw new BrowserServiceError({
        code: "BROWSER_NOT_READY",
        message: "Browser is not launched",
      });
    }
    return this.browser;
  }

  private async executeSessionAction<TData>(
    tool: BrowserToolName,
    sessionId: string,
    operation: (snapshot: BrowserSessionSnapshot) => Promise<TData>,
  ): Promise<BrowserActionResult<TData>> {
    let snapshot: BrowserSessionSnapshot;
    try {
      snapshot = this.sessionManager.incrementAction(sessionId);
    } catch (error) {
      // Auto-create session if it doesn't exist (so browser_navigate works without prior create_session)
      const parsed = toBrowserServiceError(error);
      if (parsed.code === "SESSION_NOT_FOUND" || parsed.code === "BROWSER_NOT_READY") {
        console.log(`[BrowserService] Auto-creating session "${sessionId}" for tool ${tool}`);
        await this.ensureBrowserReady();
        const context = await this.getBrowser().newContext();
        this.sessionManager.createSession({
          sessionId,
          context,
          maxActions: this.config.maxActionsPerSession,
        });
        snapshot = this.sessionManager.incrementAction(sessionId);
      } else {
        throw error;
      }
    }
    return this.executeAction(tool, sessionId, () => operation(snapshot), snapshot);
  }

  private async executeAction<TData>(
    tool: BrowserToolName,
    sessionId: string | undefined,
    operation: () => Promise<TData>,
    snapshot?: BrowserSessionSnapshot,
  ): Promise<BrowserActionResult<TData>> {
    const started = Date.now();
    const retries = this.config.actionRetryCount;
    let attempt = 0;

    while (attempt <= retries) {
      attempt += 1;

      try {
        const data = await withTimeout(operation(), this.config.defaultTimeoutMs);
        const durationMs = Date.now() - started;
        const result: BrowserActionResult<TData> = {
          status: "ok",
          tool,
          timestamp: new Date().toISOString(),
          sessionId,
          data,
          metadata: {
            attempt,
            retries,
            durationMs,
            actionCount: snapshot?.actionCount,
            maxActions: snapshot?.maxActions,
          },
        };

        this.actionLogger.log({
          tool,
          status: "ok",
          timestamp: result.timestamp,
          sessionId,
          durationMs,
          attempt,
          retries,
        });

        return result;
      } catch (error) {
        const parsed = toBrowserServiceError(error);
        const durationMs = Date.now() - started;

        if (attempt <= retries && isRetriable(parsed)) {
          continue;
        }

        const result: BrowserActionResult<TData> = {
          status: "error",
          tool,
          timestamp: new Date().toISOString(),
          sessionId,
          error: {
            code: parsed.code,
            message: parsed.message,
            retriable: parsed.retriable,
            details: parsed.details,
          },
          metadata: {
            attempt,
            retries,
            durationMs,
            actionCount: snapshot?.actionCount,
            maxActions: snapshot?.maxActions,
          },
        };

        this.actionLogger.log({
          tool,
          status: "error",
          timestamp: result.timestamp,
          sessionId,
          durationMs,
          attempt,
          retries,
          details: {
            errorCode: parsed.code,
            errorMessage: parsed.message,
          },
        });

        return result;
      }
    }

    return {
      status: "error",
      tool,
      timestamp: new Date().toISOString(),
      sessionId,
      error: {
        code: "ACTION_FAILED",
        message: "Action exhausted retry attempts",
        retriable: false,
      },
      metadata: {
        attempt,
        retries,
        durationMs: Date.now() - started,
        actionCount: snapshot?.actionCount,
        maxActions: snapshot?.maxActions,
      },
    };
  }

  private assertUrlAllowed(url: string) {
    if (!this.config.enforceDomainAllowlist) {
      return;
    }

    let hostname = "";
    try {
      hostname = new URL(url).hostname.toLowerCase();
    } catch {
      throw new BrowserServiceError({
        code: "DOMAIN_BLOCKED",
        message: `Invalid URL: ${url}`,
      });
    }

    const localhostHosts = new Set(["localhost", "127.0.0.1", "::1"]);
    if (localhostHosts.has(hostname)) {
      return;
    }

    const allowed = this.config.allowedDomains.some((domain) => {
      const normalized = domain.toLowerCase();
      if (normalized.startsWith("*.")) {
        const base = normalized.slice(2);
        return hostname === base || hostname.endsWith(`.${base}`);
      }
      return hostname === normalized;
    });

    if (!allowed) {
      throw new BrowserServiceError({
        code: "DOMAIN_BLOCKED",
        message: `Domain blocked by allowlist policy: ${hostname}`,
        details: {
          allowedDomains: this.config.allowedDomains,
          attemptedUrl: url,
        },
      });
    }
  }

  private async requireConfirmation(tool: BrowserToolName, sessionId: string, reason: string, target?: string) {
    if (!this.config.confirmationRequiredActions.includes(tool)) {
      return;
    }

    const approved = await this.confirmationHook({
      tool,
      sessionId,
      reason,
      target,
    });

    if (!approved) {
      throw new BrowserServiceError({
        code: "CONFIRMATION_REJECTED",
        message: `Action ${tool} rejected by confirmation hook`,
        retriable: false,
      });
    }
  }

  private async getOrCreatePage(sessionId: string, pageId?: string) {
    try {
      return this.sessionManager.getPage(sessionId, pageId);
    } catch (error) {
      const parsed = toBrowserServiceError(error);
      
      // If session doesn't exist, create it first
      let session;
      try {
        session = this.sessionManager.getSession(sessionId);
      } catch (e) {
        await this.ensureBrowserReady();
        const context = await this.getBrowser().newContext();
        this.sessionManager.createSession({
          sessionId, // Use the requested ID
          context,
          maxActions: this.config.maxActionsPerSession,
        });
        session = this.sessionManager.getSession(sessionId);
      }

      const page = await session.context.newPage();
      const createdPageId = this.sessionManager.attachPage(sessionId, page);
      return { page, pageId: createdPageId };
    }
  }
}

export const browserService = new BrowserService();
