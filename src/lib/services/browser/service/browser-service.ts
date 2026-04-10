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
import { callVertexMultimodal } from "../../ai/vertex-client";
import { extensionBridge } from "../extension-bridge";
import { extractJobFromScreenshot, extractJobFromText } from "../llm-ocr-extractor";
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
  BrowserAcceptCookiesInput,
  BrowserCaptureDomInput,
  BrowserCloseSessionInput,
  BrowserRuntimeConfig,
  BrowserSessionSnapshot,
  BrowserObserverEvent,
  BrowserSessionStatus,
} from "../types/browser-types";

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function deriveTabKey(url: string): string {
  const hostname = new URL(url).hostname;
  // Remove www. prefix
  const noWww = hostname.replace(/^www\./, "");
  // Remove 2-letter country code subdomains like "uk.", "us.", "de." etc
  const noCC = noWww.replace(/^[a-z]{2}\./, "");
  // Take the first label (before first dot)
  return noCC.split(".")[0];
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

  // ─── Human-Like Stealth Helpers ─────────────────────────────────────────────

  private async humanDelay(min = 800, max = 2500) {
    const delay = Math.floor(Math.random() * (max - min + 1) + min);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /** Cubic Bezier curve interpolation for natural mouse paths */
  private bezierPoint(t: number, p0: number, p1: number, p2: number, p3: number): number {
    const mt = 1 - t;
    return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
  }

  /** Move mouse along a Bezier curve from current position to (tx, ty) */
  private async bezierMouseMove(page: any, tx: number, ty: number, steps = 20) {
    try {
      const vp = page.viewportSize() || { width: 1280, height: 800 };
      // Random control points create natural arc
      const cx1 = Math.random() * vp.width;
      const cy1 = Math.random() * vp.height;
      const cx2 = Math.random() * vp.width;
      const cy2 = Math.random() * vp.height;
      const sx = Math.random() * vp.width;
      const sy = Math.random() * vp.height;

      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = Math.round(this.bezierPoint(t, sx, cx1, cx2, tx));
        const y = Math.round(this.bezierPoint(t, sy, cy1, cy2, ty));
        await page.mouse.move(x, y);
        // Variable speed: slower at start/end, faster in middle
        const speedFactor = Math.sin(Math.PI * t) + 0.1;
        await new Promise(r => setTimeout(r, Math.floor((15 + Math.random() * 10) / speedFactor)));
      }
    } catch {}
  }

  /** Move mouse to element then click — more natural than direct click */
  private async humanClick(page: any, selector: string) {
    try {
      const el = page.locator(selector).first();
      const box = await el.boundingBox().catch(() => null);
      if (box) {
        // Target a random point within the element (not always dead-center)
        const tx = box.x + box.width * (0.3 + Math.random() * 0.4);
        const ty = box.y + box.height * (0.3 + Math.random() * 0.4);
        await this.bezierMouseMove(page, tx, ty);
        await this.humanDelay(80, 200);
        await page.mouse.click(tx, ty);
      } else {
        await el.click();
      }
    } catch {
      await page.locator(selector).first().click().catch(() => {});
    }
  }

  /** Human-like scroll: variable speed, occasional pause, rare scroll-back */
  private async humanScroll(page: any, totalDistance: number) {
    let scrolled = 0;
    while (scrolled < totalDistance) {
      const chunk = Math.floor(80 + Math.random() * 160); // 80–240px per tick
      await page.mouse.wheel(0, chunk);
      scrolled += chunk;
      await new Promise(r => setTimeout(r, Math.floor(60 + Math.random() * 120)));

      // 15% chance: pause as if reading
      if (Math.random() < 0.15) await this.humanDelay(600, 1800);
      // 8% chance: slight scroll back (human overshoots sometimes)
      if (Math.random() < 0.08) {
        await page.mouse.wheel(0, -(Math.floor(30 + Math.random() * 60)));
        await this.humanDelay(200, 500);
      }
    }
  }

  /** Simulate reading time proportional to content on page */
  private async simulateReading(page: any) {
    try {
      const wordCount = await page.evaluate(() =>
        (document.body?.innerText?.split(/\s+/).length ?? 200)
      ).catch(() => 200);
      // ~200 wpm reading speed, capped between 1s and 4s
      const readMs = Math.min(4000, Math.max(1000, (wordCount / 200) * 1000 * 0.3));
      await this.humanDelay(readMs * 0.7, readMs * 1.3);
    } catch {}
  }

  /** Random micro-movement to show "attention" without navigating */
  private async idleMovement(page: any) {
    const moves = Math.floor(1 + Math.random() * 3);
    const vp = page.viewportSize() || { width: 1280, height: 800 };
    for (let i = 0; i < moves; i++) {
      const tx = Math.floor(Math.random() * vp.width);
      const ty = Math.floor(Math.random() * vp.height);
      await this.bezierMouseMove(page, tx, ty, 10);
      await this.humanDelay(300, 800);
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
        (window as any).chrome = {
          runtime: {},
          loadTimes: () => {},
          csi: () => {},
          app: {}
        };

        // 3. Fake Permissions
        const originalQuery = window.navigator.permissions.query;
        (window.navigator.permissions as any).query = (parameters: any) => (
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

        // 6. Canvas fingerprint noise
        const originalGetContext = HTMLCanvasElement.prototype.getContext;
        (HTMLCanvasElement.prototype as any).getContext = function(type: string, attributes: any) {
          const ctx = originalGetContext.call(this, type, attributes);
          if (type === '2d' && ctx) {
            const orig = (ctx as CanvasRenderingContext2D).getImageData.bind(ctx);
            (ctx as any).getImageData = function(x: number, y: number, w: number, h: number) {
              const data = orig(x, y, w, h);
              // Inject imperceptible noise
              for (let i = 0; i < data.data.length; i += 100) {
                data.data[i] ^= 1;
              }
              return data;
            };
          }
          return ctx;
        };

        // 7. WebGL vendor/renderer spoofing
        const getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(parameter: number) {
          if (parameter === 37445) return "Intel Inc.";   // UNMASKED_VENDOR_WEBGL
          if (parameter === 37446) return "Intel Iris OpenGL Engine"; // UNMASKED_RENDERER_WEBGL
          return getParameter.call(this, parameter);
        };

        // 8. AudioContext fingerprint noise
        const origCreateAnalyser = AudioContext.prototype.createAnalyser;
        AudioContext.prototype.createAnalyser = function() {
          const analyser = origCreateAnalyser.call(this);
          const orig = analyser.getFloatFrequencyData.bind(analyser);
          analyser.getFloatFrequencyData = function(array: Float32Array<ArrayBuffer>) {
            orig(array);
            for (let i = 0; i < array.length; i++) {
              array[i] += (Math.random() - 0.5) * 0.0001;
            }
          };
          return analyser;
        };

        // 9. Screen resolution — match viewport exactly (no mismatch signal)
        Object.defineProperty(screen, "width",       { get: () => window.innerWidth });
        Object.defineProperty(screen, "height",      { get: () => window.innerHeight });
        Object.defineProperty(screen, "availWidth",  { get: () => window.innerWidth });
        Object.defineProperty(screen, "availHeight", { get: () => window.innerHeight });

        // 10. Realistic connection type
        Object.defineProperty(navigator, "connection", {
          get: () => ({ effectiveType: "4g", rtt: 50, downlink: 10, saveData: false })
        });

        // 11. Conceal automation via toString checks
        const originalToString = Function.prototype.toString;
        Function.prototype.toString = function() {
          if (this === Function.prototype.toString) return "function toString() { [native code] }";
          return originalToString.call(this);
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

  private readonly BLOCKED_SIGNALS = [
    (url: string, _title: string) => url.includes("google.com/sorry"),
    (url: string, _title: string) => url.includes("consent.google.com"),
    (url: string, _title: string) => url.includes("linkedin.com/checkpoint"),
    (url: string, _title: string) => url.includes("linkedin.com/authwall"),
    (_url: string, title: string) => title.toLowerCase().includes("robot"),
    (_url: string, title: string) => title.toLowerCase().includes("captcha"),
    (_url: string, title: string) => title.toLowerCase().includes("verify you are human"),
    (_url: string, title: string) => title.toLowerCase().includes("access denied"),
    (_url: string, title: string) => title.includes("Before you continue"),
    (_url: string, title: string) => title.toLowerCase().includes("just a moment"), // Cloudflare
    (_url: string, title: string) => title.toLowerCase().includes("are you a human"),
  ];

  private async detectProtection(sessionId: string, page: any): Promise<BrowserSessionStatus> {
    const url = page.url();
    const title = await page.title().catch(() => "");

    const isBlocked = this.BLOCKED_SIGNALS.some(fn => fn(url, title));

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

  // Fallback site order when one job board blocks Atlas
  private readonly JOB_SITE_FALLBACKS: Record<string, string[]> = {
    "linkedin.com": ["indeed.com", "glassdoor.com"],
    "indeed.com":   ["linkedin.com", "glassdoor.com"],
    "glassdoor.com":["linkedin.com", "indeed.com"],
  };

  private buildFallbackUrl(blockedUrl: string, searchTerm: string, location: string): string | null {
    const blocked = Object.keys(this.JOB_SITE_FALLBACKS).find(site => blockedUrl.includes(site));
    if (!blocked) return null;
    const fallbacks = this.JOB_SITE_FALLBACKS[blocked];
    const next = fallbacks[0];
    const q = encodeURIComponent(searchTerm);
    const l = encodeURIComponent(location);
    if (next === "indeed.com")    return `https://www.indeed.com/jobs?q=${q}&l=${l}`;
    if (next === "glassdoor.com") return `https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${q}&locT=C&locId=0`;
    if (next === "linkedin.com")  return `https://www.linkedin.com/jobs/search/?keywords=${q}&location=${l}`;
    return null;
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

      await this.humanDelay(300, 800);

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
        const isJobBoard = /linkedin|indeed|glassdoor|jobs\.|careers\./i.test(input.url);
        await resolved.page.goto(input.url, {
          waitUntil: "domcontentloaded",
          timeout: isJobBoard ? 12_000 : this.config.defaultTimeoutMs,
        });
        await this.captureObserverScreenshot(input.sessionId, resolved.pageId, "navigate_end");
        title = await resolved.page.title();
      }

      const status = await this.detectProtection(input.sessionId, resolved.page);
      this.updateSessionHistory(input.sessionId, "browser_navigate", "ok", input.url, status === "protected" ? "Security wall detected" : undefined);

      // Auto-accept cookie/GDPR banners after every navigation
      if (status === "active") {
        await this.acceptCookies({ sessionId: input.sessionId, pageId: resolved.pageId }).catch(() => {});
      }

      await this.captureObserverScreenshot(input.sessionId, resolved.pageId, "browser_navigate");

      // Simulate reading the loaded page before returning
      if (status === "active") {
        await this.simulateReading(resolved.page);
        await this.idleMovement(resolved.page);
      }
      await this.humanDelay(500, 1500);

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
    const isHtml = input.trim().startsWith("<") || input.trim().startsWith("<!doctype");
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
      await this.humanDelay(200, 600);
      await this.captureObserverScreenshot(input.sessionId, resolved.pageId, "click_start");
      await this.humanClick(resolved.page, input.selector);
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

  private readonly COOKIE_SELECTORS = [
    // Generic GDPR / consent patterns
    'button[id*="accept"]',
    'button[class*="accept-all"]',
    '[aria-label*="Accept all"]',
    '[aria-label*="Accept cookies"]',
    // OneTrust (Indeed, many sites)
    '#onetrust-accept-btn-handler',
    'button.onetrust-close-btn-handler',
    // LinkedIn
    'button.artdeco-button--primary[action-type="ACCEPT"]',
    // Glassdoor
    'button[data-test="accept-btn"]',
    // CookieBot
    '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
    // Text-match fallbacks (Playwright :has-text)
    'button:has-text("Accept all")',
    'button:has-text("Accept All")',
    'button:has-text("Accept cookies")',
    'button:has-text("Allow all")',
    'button:has-text("I agree")',
    'button:has-text("Agree")',
    'button:has-text("Got it")',
  ];

  async acceptCookies(
    input: BrowserAcceptCookiesInput,
  ): Promise<BrowserActionResult<{ sessionId: string; pageId: string; accepted: boolean; selector?: string }>> {
    return this.executeSessionAction("browser_accept_cookies", input.sessionId, async () => {
      const resolved = this.sessionManager.getPage(input.sessionId, input.pageId);
      for (const selector of this.COOKIE_SELECTORS) {
        try {
          const locator = resolved.page.locator(selector).first();
          const visible = await locator.isVisible({ timeout: 1500 }).catch(() => false);
          if (visible) {
            await locator.click({ timeout: 2000 });
            await this.humanizedDelay(300, 700);
            console.log(`[BrowserService] Cookie banner accepted via: ${selector}`);
            this.updateSessionHistory(input.sessionId, "browser_accept_cookies", "ok", undefined, `Accepted via ${selector}`);
            return { sessionId: input.sessionId, pageId: resolved.pageId, accepted: true, selector };
          }
        } catch {
          // silently try next selector
        }
      }
      this.updateSessionHistory(input.sessionId, "browser_accept_cookies", "ok", undefined, "No cookie banner found");
      return { sessionId: input.sessionId, pageId: resolved.pageId, accepted: false };
    });
  }

  async captureAndExtractDom(
    input: BrowserCaptureDomInput,
  ): Promise<BrowserActionResult<{ sessionId: string; pageId: string; raw: string; extracted: Record<string, unknown> }>> {
    return this.executeSessionAction("browser_capture_dom", input.sessionId, async () => {
      const resolved = this.sessionManager.getPage(input.sessionId, input.pageId);
      const includeScreenshot = input.includeScreenshot ?? true;

      // 1. Capture DOM (trimmed to stay within LLM token budget)
      const fullHtml = await resolved.page.content();
      const trimmedHtml = fullHtml.slice(0, 50_000);

      // 2. Optionally capture screenshot as base64
      let screenshotBase64: string | null = null;
      if (includeScreenshot) {
        try {
          const buf = await resolved.page.screenshot({ fullPage: false, type: "png" });
          screenshotBase64 = buf.toString("base64");
        } catch (err) {
          console.warn("[BrowserService] captureAndExtractDom: screenshot failed, continuing without it", err);
        }
      }

      // 3. Build extraction prompt
      const extractionPrompt = input.prompt ??
        `Extract ALL job listings visible on this page. For each job return a JSON object with these fields:
title (string), company (string), location (string), salary (string or null),
jobType (string or null), datePosted (string or null), url (string or null), description (string or null).
Return ONLY a valid JSON array of job objects — no markdown, no explanation.`;

      // 4. Build multimodal parts
      const parts: Array<{ text: string } | { inline_data: { mime_type: string; data: string } }> = [];
      if (screenshotBase64) {
        parts.push({ inline_data: { mime_type: "image/png", data: screenshotBase64 } });
      }
      parts.push({ text: extractionPrompt });
      parts.push({ text: `Page HTML (for grounding):\n${trimmedHtml}` });

      // 5. Call LLM
      const llmResult = await callVertexMultimodal({ parts, responseMimeType: "application/json", temperature: 0.1 });

      let extracted: Record<string, unknown> = {};
      if (llmResult.ok && llmResult.text) {
        try {
          const parsed = JSON.parse(llmResult.text);
          extracted = Array.isArray(parsed) ? { jobs: parsed } : parsed;
        } catch {
          // LLM returned non-JSON — store raw text
          extracted = { raw_text: llmResult.text };
        }
      } else {
        console.warn("[BrowserService] captureAndExtractDom: LLM extraction failed:", llmResult.error);
      }

      this.updateSessionHistory(input.sessionId, "browser_capture_dom", "ok", undefined, `Extracted via LLM, jobs: ${Array.isArray((extracted as any).jobs) ? (extracted as any).jobs.length : "unknown"}`);
      await this.captureObserverScreenshot(input.sessionId, resolved.pageId, "browser_capture_dom");

      return { sessionId: input.sessionId, pageId: resolved.pageId, raw: trimmedHtml, extracted };
    });
  }

  async extractJobs(
    input: BrowserExtractJobsInput,
  ): Promise<any> {
    return this.executeSessionAction("browser_extract_jobs", input.sessionId, async () => {
      const resolved = this.sessionManager.getPage(input.sessionId, input.pageId);
      const currentUrl = resolved.page.url();
      const isLinkedIn = currentUrl.includes("linkedin.com");

      // ── Extension path: real Chrome browser, two-phase extraction ─────────
      const isJobBoard = /linkedin\.com|indeed\.com|glassdoor\.com/.test(currentUrl);
      if (isJobBoard && extensionBridge.isConnected()) {
        console.log("[BrowserService] Using Chrome extension for job extraction:", currentUrl);
        try {
          const extJobs = await this.extractJobsViaExtension(currentUrl, input.searchTerm, input.location);
          if (extJobs.length > 0) {
            this.updateSessionHistory(input.sessionId, "browser_extract_jobs", "ok", undefined, `Extracted ${extJobs.length} jobs via extension+OCR`);
            return {
              sessionId: input.sessionId,
              pageId: resolved.pageId,
              url: currentUrl,
              jobs: extJobs,
              count: extJobs.length,
            };
          }
        } catch (err) {
          console.warn("[BrowserService] Extension extraction failed, falling back to Playwright:", err);
        }
      }

      // 1. Behavioral Stealth: simulate human landing on page
      await this.simulateReading(resolved.page);
      await this.idleMovement(resolved.page);
      await this.humanScroll(resolved.page, 300 + Math.floor(Math.random() * 400));
      await this.humanDelay(800, 2000);

      // 2. URL Correction if needed (LinkedIn specific)
      if (input.searchTerm && isLinkedIn && (currentUrl.includes("undefined") || !currentUrl.includes("keywords="))) {
        const query = input.searchTerm;
        const location = input.location || "London";
        const filteredUrl = this.buildLinkedInUrl(query, location, input.linkedinFilters);
        console.log(`[BrowserService] Correcting invalid LinkedIn URL to: ${filteredUrl}`);
        await resolved.page.goto(filteredUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
      }

      // 3. Check if site is blocked — switch to fallback immediately
      const sessionStatus = this.sessionManager.getSession(input.sessionId).status;
      if (sessionStatus === "protected") {
        const fallbackUrl = this.buildFallbackUrl(currentUrl, input.searchTerm ?? "jobs", input.location ?? "London");
        if (fallbackUrl) {
          console.log(`[BrowserService] Site blocked at ${currentUrl} — switching to ${fallbackUrl}`);
          await resolved.page.goto(fallbackUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
          this.sessionManager.updateStatus(input.sessionId, "active");
          this.emitObserverEvent({ sessionId: input.sessionId, type: "status", status: "active", url: fallbackUrl, detail: `Switched to fallback site: ${fallbackUrl}` });
        }
      }

      // 4. Auto-accept cookie banners before extraction
      await this.acceptCookies({ sessionId: input.sessionId, pageId: resolved.pageId }).catch(() => {});

      // 4. Primary: LLM-based DOM extraction
      let rawJobs: any[] = [];
      try {
        const domResult = await this.captureAndExtractDom({ sessionId: input.sessionId, pageId: resolved.pageId, includeScreenshot: true });
        if (domResult.status === "ok" && domResult.data?.extracted) {
          const extracted = domResult.data.extracted as any;
          rawJobs = Array.isArray(extracted.jobs) ? extracted.jobs : [];
        }
      } catch (err) {
        console.warn("[BrowserService] LLM extraction failed, falling back to Scrapling:", err);
      }

      // 5. Fallback: Scrapling Python worker
      if (rawJobs.length === 0) {
        console.log("[BrowserService] Falling back to Scrapling for job extraction");
        const html = await resolved.page.content();
        const scraplingResult = await this.runScrapling(html, "job", currentUrl);
        rawJobs = scraplingResult.status === "ok" ? scraplingResult.jobs : [];
      }

      const jobs = rawJobs.map((job: any) => ({
        ...job,
        id: Buffer.from(`${job.title}-${job.company}-${job.location}`).toString("base64"),
        link: job.url || job.link || "",
        source: "Agent Search",
        description: job.description || `${job.location || ""}, ${job.datePosted || job.date_posted || "recently"}`,
      }));

      this.updateSessionHistory(input.sessionId, "browser_extract_jobs", "ok", undefined, `Extracted ${jobs.length} jobs via LLM+DOM`);
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

  private async extractJobsViaExtension(
    searchUrl: string,
    searchTerm?: string,
    location?: string,
    tabKey?: string,
  ): Promise<any[]> {
    // Derive a stable tab key from the domain — each platform gets its own Chrome tab
    const key = tabKey ?? deriveTabKey(searchUrl);
    const jitter = () => 400 + Math.round(Math.random() * 600);

    // Phase 1 — Navigate to search results, DOM scrape for job cards
    extensionBridge.resetCancel();
    // Close any stale tab for this key to ensure a fresh load (avoids hung executeScript)
    await extensionBridge.closeNamedTab(key).catch(() => {});
    console.log(`[ExtensionExtract:${key}] Phase 1: navigating to search URL`);
    await extensionBridge.navigate(searchUrl, key);

    // Human-like: random settle after page load
    await new Promise((r) => setTimeout(r, jitter()));

    // Scroll to load lazy-loaded cards (human-like random scroll amounts + intervals)
    // Scrolls are non-fatal — some sites block scrolling via CSP or debugger issues
    for (let i = 0; i < 4; i++) {
      if (extensionBridge.isCancelled()) return [];
      await extensionBridge.scroll(300 + Math.round(Math.random() * 500), key).catch(() => {});
      await new Promise((r) => setTimeout(r, jitter()));
    }

    const cards = await extensionBridge.getJobCards(key);
    console.log(`[ExtensionExtract:${key}] Phase 1: found ${cards.length} job cards`);

    if (cards.length === 0) return [];

    // Phase 2 — Parallel detail scraping: runs concurrently with other platforms' searches.
    // Each batch slot gets its own tab key so 3 listing pages load simultaneously.
    const topCards = cards.slice(0, 20);
    const enriched: any[] = [];

    console.log(`[ExtensionExtract:${key}] Phase 2: enriching ${topCards.length} jobs (reusing platform tab)`);

    // Reuse the SAME platform tab for all detail scraping — no extra tabs
    for (const card of topCards) {
      if (extensionBridge.isCancelled()) break;
      try {
        const detail = await extensionBridge.scrapeJobListing(card.url, key);

        // LLM cleanup: remove noise, fill missing fields from raw description text
        let cleaned = null;
        if (detail.description && detail.description.length > 30) {
          cleaned = await extractJobFromText(
            {
              title: card.title,
              company: detail.company || card.company,
              location: card.location,
              salary: detail.salary,
              jobType: detail.jobType,
              datePosted: detail.datePosted,
              description: detail.description,
            },
            card.url,
          ).catch(() => null);
        }

        // Prefer the final redirect URL from the scraped page (e.g. viewjob?jk=... for Indeed)
        // over the click-tracking URL from the search results card (e.g. pagead/clk)
        const finalUrl = detail.url && detail.url !== card.url && !detail.url.includes("pagead/clk") ? detail.url : card.url;
        enriched.push({
          id: Buffer.from(`${card.title}-${finalUrl}`).toString("base64"),
          title: cleaned?.title || card.title || "Untitled Role",
          company: cleaned?.company || detail.company || card.company || "",
          location: cleaned?.location || card.location || "",
          link: finalUrl,
          url: finalUrl,
          salary: cleaned?.salary || detail.salary || null,
          jobType: cleaned?.jobType || detail.jobType || null,
          datePosted: cleaned?.datePosted || detail.datePosted || null,
          description: cleaned?.description || detail.description || "",
          requirements: cleaned?.requirements || "",
          skills: detail.skills || [],
          source: "Extension+DOM",
        });
      } catch (err) {
        console.warn(`[ExtensionExtract] Phase 2 failed for ${card.url}:`, (err as Error).message);
        enriched.push({
          id: Buffer.from(`${card.title}-${card.url}`).toString("base64"),
          title: card.title || "Untitled Role",
          company: card.company || "",
          location: card.location || "",
          link: card.url,
          url: card.url,
          salary: null,
          description: "",
          skills: [],
          source: "Extension+DOM",
        });
      }
    }

    console.log(`[ExtensionExtract] Phase 2 complete: enriched ${enriched.length} jobs`);
    return enriched;
  }

  /**
   * Enrich jobs via Chrome extension — no Playwright.
   * Navigates the extension tab to each listing URL and scrapes description + skills.
   */
  async enrichJobs(input: BrowserEnrichJobsInput): Promise<BrowserActionResult<{ sessionId: string; pageId: string; jobs: Array<any> }>> {
    const t0 = Date.now();
    if (!extensionBridge.isConnected()) {
      return {
        status: "error", tool: "browser_enrich_jobs",
        timestamp: new Date().toISOString(),
        data: { sessionId: input.sessionId, pageId: input.pageId ?? "", jobs: input.jobs },
        error: { code: "EXTENSION_NOT_CONNECTED", message: "Chrome extension not connected — cannot enrich jobs", retriable: false },
        metadata: { attempt: 1, retries: 0, durationMs: Date.now() - t0 },
      };
    }

    const enrichedJobs: any[] = [];
    const jobsToProcess = input.jobs.slice(0, 20);

    for (const job of jobsToProcess) {
      if (!job.url) { enrichedJobs.push(job); continue; }
      try {
        const detail = await extensionBridge.scrapeJobListing(job.url, `enrich-${input.sessionId}`);
        const j = job as any;

        // LLM cleanup: strip noise, fill all fields from raw description
        let cleaned = null;
        if (detail.description && detail.description.length > 30) {
          cleaned = await extractJobFromText(
            {
              title: j.title,
              company: detail.company || j.company,
              location: j.location,
              salary: detail.salary || j.salary,
              jobType: detail.jobType || j.jobType,
              datePosted: detail.datePosted || j.datePosted,
              description: detail.description,
            },
            job.url,
          ).catch(() => null);
        }

        enrichedJobs.push({
          ...job,
          title: cleaned?.title || j.title || "",
          company: cleaned?.company || detail.company || j.company || "",
          location: cleaned?.location || j.location || "",
          description: cleaned?.description || detail.description || j.description || "",
          requirements: cleaned?.requirements || j.requirements || "",
          skills: detail.skills?.length ? detail.skills.join(", ") : (j.skills || ""),
          salary: cleaned?.salary || detail.salary || j.salary || "",
          jobType: cleaned?.jobType || detail.jobType || j.jobType || "",
          datePosted: cleaned?.datePosted || detail.datePosted || j.datePosted || "",
        });
      } catch {
        enrichedJobs.push(job); // keep original on failure, don't drop
      }
    }

    return {
      status: "ok", tool: "browser_enrich_jobs",
      timestamp: new Date().toISOString(),
      data: { sessionId: input.sessionId, pageId: input.pageId ?? "", jobs: enrichedJobs },
      metadata: { attempt: 1, retries: 0, durationMs: Date.now() - t0 },
    };
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

  async extensionStatus(): Promise<BrowserActionResult<{ connected: boolean; tabOpen: boolean }>> {
    const t0 = Date.now();
    const connected = extensionBridge.isConnected();
    const tabOpen = connected ? await extensionBridge.ping() : false;
    return {
      status: "ok",
      tool: "browser_extension_status",
      timestamp: new Date().toISOString(),
      data: { connected, tabOpen },
      metadata: { attempt: 1, retries: 0, durationMs: Date.now() - t0 },
    };
  }

  async enrichJobViaExtension(input: { url: string }): Promise<BrowserActionResult<{ job: any }>> {
    const t0 = Date.now();
    if (!extensionBridge.isConnected()) {
      return { status: "error", tool: "browser_extension_enrich_job", timestamp: new Date().toISOString(), data: { job: null }, error: { code: "EXTENSION_NOT_CONNECTED", message: "Chrome extension not connected", retriable: false }, metadata: { attempt: 1, retries: 0, durationMs: 0 } };
    }
    try {
      // Use DOM scraping via extension — faster and more reliable than screenshot+OCR
      const detail = await extensionBridge.scrapeJobListing(input.url);
      const job = {
        company: detail.company || "",
        location: "",
        salary: detail.salary || null,
        jobType: detail.jobType || null,
        datePosted: detail.datePosted || null,
        description: detail.description || "",
        skills: detail.skills || [],
        url: input.url,
        link: input.url,
        source: "Extension",
      };
      return { status: "ok", tool: "browser_extension_enrich_job", timestamp: new Date().toISOString(), data: { job }, metadata: { attempt: 1, retries: 0, durationMs: Date.now() - t0 } };
    } catch (err: any) {
      return { status: "error", tool: "browser_extension_enrich_job", timestamp: new Date().toISOString(), data: { job: null }, error: { code: "ENRICH_FAILED", message: err.message, retriable: true }, metadata: { attempt: 1, retries: 0, durationMs: Date.now() - t0 } };
    }
  }

  async extensionExtractJobs(input: { searchUrl: string; query?: string; location?: string }): Promise<BrowserActionResult<{ jobs: any[]; count: number; source: string }>> {
    const t0 = Date.now();
    if (!extensionBridge.isConnected()) {
      return {
        status: "error",
        tool: "browser_extension_extract_jobs",
        timestamp: new Date().toISOString(),
        data: { jobs: [], count: 0, source: "extension" },
        error: { code: "EXTENSION_NOT_CONNECTED", message: "Chrome extension not connected", retriable: false },
        metadata: { attempt: 1, retries: 0, durationMs: Date.now() - t0 },
      };
    }
    try {
      const jobs = await this.extractJobsViaExtension(input.searchUrl, input.query, input.location);
      return {
        status: "ok",
        tool: "browser_extension_extract_jobs",
        timestamp: new Date().toISOString(),
        data: { jobs, count: jobs.length, source: "extension+ocr" },
        metadata: { attempt: 1, retries: 0, durationMs: Date.now() - t0 },
      };
    } catch (err: any) {
      return {
        status: "error",
        tool: "browser_extension_extract_jobs",
        timestamp: new Date().toISOString(),
        data: { jobs: [], count: 0, source: "extension" },
        error: { code: "EXTENSION_EXTRACT_FAILED", message: err.message || String(err), retriable: true },
        metadata: { attempt: 1, retries: 0, durationMs: Date.now() - t0 },
      };
    }
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
