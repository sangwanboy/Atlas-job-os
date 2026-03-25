export type BrowserToolName =
  | "browser_launch_browser"
  | "browser_create_session"
  | "browser_open_session"
  | "browser_open_page"
  | "browser_navigate"
  | "browser_click"
  | "browser_type"
  | "browser_scroll"
  | "browser_extract_text"
  | "browser_extract_jobs"
  | "browser_enrich_jobs"
  | "browser_screenshot"
  | "browser_close_session"
  | "browser_resume";

export type BrowserActionStatus = "ok" | "error";

export type BrowserActionError = {
  code: string;
  message: string;
  retriable: boolean;
  details?: Record<string, unknown>;
};

export type BrowserActionMetadata = {
  attempt: number;
  retries: number;
  durationMs: number;
  actionCount?: number;
  maxActions?: number;
};

export type BrowserMode = "headless" | "headed-local" | "headed-remote-observed";

export type BrowserSessionStatus = "active" | "protected" | "takeover_required" | "closed" | "error";

export type BrowserObserverEvent = {
  sessionId: string;
  type: "status" | "action" | "protect" | "media";
  action?: string;
  url?: string;
  title?: string;
  status?: BrowserSessionStatus;
  detail?: string;
  payload?: any;
  timestamp: string;
};

export type BrowserActionResult<TData = Record<string, unknown>> = {
  status: BrowserActionStatus;
  tool: BrowserToolName;
  timestamp: string;
  sessionId?: string;
  data?: TData;
  error?: BrowserActionError;
  metadata: BrowserActionMetadata;
};

export type BrowserLaunchInput = {
  headless?: boolean;
};

export type BrowserCreateSessionInput = {
  sessionId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
  maxActions?: number;
};

export type BrowserOpenPageInput = {
  sessionId: string;
};

export type BrowserNavigateInput = {
  sessionId: string;
  url: string;
  pageId?: string;
  useScrapling?: boolean;
};

export type BrowserClickInput = {
  sessionId: string;
  selector: string;
  pageId?: string;
};

export type BrowserTypeInput = {
  sessionId: string;
  selector: string;
  text: string;
  clearFirst?: boolean;
  pageId?: string;
};

export type BrowserScrollInput = {
  sessionId: string;
  x?: number;
  y?: number;
  pageId?: string;
};

export type LinkedInFilters = {
  timePosted?: "past-24h" | "past-week" | "past-month";
  jobType?: Array<"F" | "P" | "C" | "I" | "T" | "full-time" | "part-time" | "contract" | "internship" | "temporary">;
  remote?: Array<"1" | "2" | "3" | "on-site" | "remote" | "hybrid">;
  experienceLevel?: Array<"1" | "2" | "3" | "4" | "5" | "6" | "internship" | "entry" | "associate" | "mid-senior" | "director" | "executive">;
};

export type BrowserExtractJobsInput = {
  sessionId: string;
  searchTerm?: string;
  location?: string;
  selector?: string;
  pageId?: string;
  enrich?: boolean;
  linkedinFilters?: LinkedInFilters;
};

export type BrowserEnrichJobsInput = {
  sessionId: string;
  jobs: Array<{ url: string; title?: string; company?: string }>;
  pageId?: string;
};

export type BrowserExtractTextInput = {
  sessionId: string;
  selector?: string;
  maxLength?: number;
  pageId?: string;
};

export type BrowserScreenshotInput = {
  sessionId: string;
  fileName?: string;
  fullPage?: boolean;
  pageId?: string;
};

export type BrowserCloseSessionInput = {
  sessionId: string;
};

export type BrowserToolInputMap = {
  browser_launch_browser: BrowserLaunchInput;
  browser_create_session: BrowserCreateSessionInput;
  browser_open_session: BrowserCreateSessionInput;
  browser_open_page: BrowserOpenPageInput;
  browser_navigate: BrowserNavigateInput;
  browser_click: BrowserClickInput;
  browser_type: BrowserTypeInput;
  browser_scroll: BrowserScrollInput;
  browser_extract_text: BrowserExtractTextInput;
  browser_extract_jobs: BrowserExtractJobsInput;
  browser_enrich_jobs: BrowserEnrichJobsInput;
  browser_screenshot: BrowserScreenshotInput;
  browser_close_session: BrowserCloseSessionInput;
  browser_resume: { sessionId: string };
};

export type BrowserToolResultMap = {
  browser_launch_browser: { browserReady: boolean; browserName: string };
  browser_create_session: { sessionId: string; createdAt: string; actionCount: number; maxActions: number };
  browser_open_session: { sessionId: string; createdAt: string; actionCount: number; maxActions: number };
  browser_open_page: { sessionId: string; pageId: string; url: string };
  browser_navigate: { sessionId: string; pageId: string; url: string; title: string };
  browser_click: { sessionId: string; pageId: string; selector: string };
  browser_type: { sessionId: string; pageId: string; selector: string; typedLength: number };
  browser_scroll: { sessionId: string; pageId: string; x: number; y: number };
  browser_extract_text: { sessionId: string; pageId: string; text: string; length: number };
  browser_extract_jobs: { sessionId: string; pageId: string; jobs: Array<{ title?: string; company?: string; location?: string; link?: string; salary?: string; datePosted?: string; description?: string; skills?: string }> };
  browser_enrich_jobs: { sessionId: string; pageId: string; jobs: Array<{ title: string; company: string; location: string; url: string; salary?: string; description: string; skills: string }> };
  browser_screenshot: { sessionId: string; pageId: string; filePath: string };
  browser_close_session: { closed: boolean };
  browser_resume: { sessionId: string; status: BrowserSessionStatus };
};

export type BrowserSessionSnapshot = {
  sessionId: string;
  userId?: string;
  createdAt: string;
  lastActionAt: string;
  actionCount: number;
  maxActions: number;
  activePageId?: string;
  pageIds: string[];
  status: BrowserSessionStatus;
  lastScreenshot?: string;
  actionHistory: Array<{
    tool: string;
    timestamp: string;
    url?: string;
    status: "ok" | "error";
    detail?: string;
  }>;
  metadata?: Record<string, unknown>;
};

export type BrowserConfirmationRequest = {
  tool: BrowserToolName;
  sessionId?: string;
  reason: string;
  target?: string;
};

export type BrowserConfirmationHook = (request: BrowserConfirmationRequest) => Promise<boolean>;

export type BrowserRuntimeConfig = {
  mode: BrowserMode;
  headless: boolean;
  defaultTimeoutMs: number;
  slowMo: number;
  actionRetryCount: number;
  maxActionsPerSession: number;
  allowedDomains: string[];
  enforceDomainAllowlist: boolean;
  screenshotDir: string;
  confirmationRequiredActions: BrowserToolName[];
  enableTracing: boolean;
  enableVideo: boolean;
};
