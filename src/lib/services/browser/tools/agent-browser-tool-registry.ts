import { browserService, BrowserService } from "../service/browser-service";
import { validateBrowserToolInput } from "../validation/browser-validation";
import type {
  BrowserActionResult,
  BrowserToolName,
  BrowserExtractJobsInput,
  BrowserEnrichJobsInput,
} from "../types/browser-types";

export class AgentBrowserToolRegistry {
  constructor(private readonly service: BrowserService = browserService) {}

  async execute(
    tool: BrowserToolName,
    rawInput: unknown,
  ): Promise<BrowserActionResult> {
    switch (tool) {
      case "browser_launch_browser":
        return this.service.launchBrowser(validateBrowserToolInput("browser_launch_browser", rawInput));
      case "browser_create_session":
        return this.service.createSession(validateBrowserToolInput("browser_create_session", rawInput));
      case "browser_open_session":
        return this.service.createSession(validateBrowserToolInput("browser_open_session", rawInput));
      case "browser_open_page":
        return this.service.openPage(validateBrowserToolInput("browser_open_page", rawInput));
      case "browser_navigate":
        return this.service.navigate(validateBrowserToolInput("browser_navigate", rawInput));
      case "browser_click":
        return this.service.click(validateBrowserToolInput("browser_click", rawInput));
      case "browser_type":
        return this.service.type(validateBrowserToolInput("browser_type", rawInput));
      case "browser_scroll":
        return this.service.scroll(validateBrowserToolInput("browser_scroll", rawInput));
      case "browser_extract_text":
        return this.service.extractText(validateBrowserToolInput("browser_extract_text", rawInput));
      case "browser_extract_jobs":
        return this.service.extractJobs(validateBrowserToolInput("browser_extract_jobs", rawInput) as BrowserExtractJobsInput);
      case "browser_enrich_jobs":
        return this.service.enrichJobs(validateBrowserToolInput("browser_enrich_jobs", rawInput) as BrowserEnrichJobsInput);
      case "browser_screenshot":
        return this.service.screenshot(validateBrowserToolInput("browser_screenshot", rawInput));
      case "browser_close_session":
        return this.service.closeSession(validateBrowserToolInput("browser_close_session", rawInput));
      case "browser_resume":
        return this.service.resumeSession(validateBrowserToolInput("browser_resume", rawInput));
      default: {
        const neverTool: never = tool;
        throw new Error(`Unsupported browser tool: ${String(neverTool)}`);
      }
    }
  }

  browser_open_session(input: unknown) {
    return this.execute("browser_open_session", input);
  }

  browser_navigate(input: unknown) {
    return this.execute("browser_navigate", input);
  }

  browser_click(input: unknown) {
    return this.execute("browser_click", input);
  }

  browser_type(input: unknown) {
    return this.execute("browser_type", input);
  }

  browser_extract_text(input: unknown) {
    return this.execute("browser_extract_text", input);
  }

  browser_extract_jobs(input: unknown) {
    return this.execute("browser_extract_jobs", input);
  }

  browser_screenshot(input: unknown) {
    return this.execute("browser_screenshot", input);
  }

  browser_close_session(input: unknown) {
    return this.execute("browser_close_session", input);
  }

  browser_resume(input: unknown) {
    return this.execute("browser_resume", input);
  }
}

export const agentBrowserToolRegistry = new AgentBrowserToolRegistry();
