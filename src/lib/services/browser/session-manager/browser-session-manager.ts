import { randomUUID } from "node:crypto";
import type { BrowserContext, Page } from "playwright";
import { BrowserServiceError } from "../errors/browser-errors";
import type { BrowserSessionSnapshot, BrowserSessionStatus } from "../types/browser-types";

type BrowserSessionRecord = {
  sessionId: string;
  userId?: string;
  createdAt: string;
  lastActionAt: string;
  actionCount: number;
  maxActions: number;
  context: BrowserContext;
  pages: Map<string, Page>;
  activePageId?: string;
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

export class BrowserSessionManager {
  private readonly sessions = new Map<string, BrowserSessionRecord>();

  createSession(input: {
    context: BrowserContext;
    maxActions: number;
    userId?: string;
    metadata?: Record<string, unknown>;
    sessionId?: string;
  }): BrowserSessionSnapshot {
    const sessionId = input.sessionId || randomUUID();
    const now = new Date().toISOString();

    this.sessions.set(sessionId, {
      sessionId,
      userId: input.userId,
      createdAt: now,
      lastActionAt: now,
      actionCount: 0,
      maxActions: input.maxActions,
      context: input.context,
      pages: new Map(),
      status: "active",
      actionHistory: [],
      metadata: input.metadata,
    });

    return this.getSnapshot(sessionId);
  }

  getSession(sessionId: string): BrowserSessionRecord {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new BrowserServiceError({
        code: "SESSION_NOT_FOUND",
        message: `Browser session not found: ${sessionId}`,
      });
    }
    return session;
  }

  getSnapshot(sessionId: string): BrowserSessionSnapshot {
    const session = this.getSession(sessionId);
    return {
      sessionId: session.sessionId,
      userId: session.userId,
      createdAt: session.createdAt,
      lastActionAt: session.lastActionAt,
      actionCount: session.actionCount,
      maxActions: session.maxActions,
      activePageId: session.activePageId,
      pageIds: Array.from(session.pages.keys()),
      status: session.status,
      lastScreenshot: session.lastScreenshot,
      actionHistory: session.actionHistory,
      metadata: session.metadata,
    };
  }

  incrementAction(sessionId: string): BrowserSessionSnapshot {
    const session = this.getSession(sessionId);
    if (session.actionCount >= session.maxActions) {
      throw new BrowserServiceError({
        code: "ACTION_LIMIT_REACHED",
        message: `Max action count reached for session ${sessionId}`,
        retriable: false,
        details: {
          actionCount: session.actionCount,
          maxActions: session.maxActions,
        },
      });
    }

    session.actionCount += 1;
    session.lastActionAt = new Date().toISOString();
    return this.getSnapshot(sessionId);
  }

  attachPage(sessionId: string, page: Page, pageId = randomUUID()): string {
    const session = this.getSession(sessionId);
    session.pages.set(pageId, page);
    session.activePageId = pageId;
    return pageId;
  }

  getPage(sessionId: string, pageId?: string): { page: Page; pageId: string } {
    const session = this.getSession(sessionId);
    const resolvedPageId = pageId ?? session.activePageId;

    if (!resolvedPageId) {
      throw new BrowserServiceError({
        code: "PAGE_NOT_FOUND",
        message: `No active page found for session ${sessionId}`,
      });
    }

    const page = session.pages.get(resolvedPageId);
    if (!page) {
      throw new BrowserServiceError({
        code: "PAGE_NOT_FOUND",
        message: `Page ${resolvedPageId} not found in session ${sessionId}`,
      });
    }

    return { page, pageId: resolvedPageId };
  }

  markActivePage(sessionId: string, pageId: string) {
    const session = this.getSession(sessionId);
    if (!session.pages.has(pageId)) {
      throw new BrowserServiceError({
        code: "PAGE_NOT_FOUND",
        message: `Page ${pageId} not found in session ${sessionId}`,
      });
    }
    session.activePageId = pageId;
  }

  updateStatus(sessionId: string, status: BrowserSessionStatus): BrowserSessionSnapshot {
    const session = this.getSession(sessionId);
    session.status = status;
    session.lastActionAt = new Date().toISOString();
    return this.getSnapshot(sessionId);
  }

  setLastScreenshot(sessionId: string, filePath: string) {
    const session = this.getSession(sessionId);
    session.lastScreenshot = filePath;
  }

  addHistory(sessionId: string, entry: { tool: string; url?: string; status: "ok" | "error"; detail?: string }) {
    const session = this.getSession(sessionId);
    session.actionHistory.push({
      ...entry,
      timestamp: new Date().toISOString(),
    });
    // Keep history manageable
    if (session.actionHistory.length > 50) {
      session.actionHistory.shift();
    }
  }

  async closeSession(sessionId: string): Promise<boolean> {
    const session = this.getSession(sessionId);
    await session.context.close();
    return this.sessions.delete(sessionId);
  }

  listSessions(): BrowserSessionSnapshot[] {
    return Array.from(this.sessions.keys()).map((sessionId) => this.getSnapshot(sessionId));
  }
}

export const browserSessionManager = new BrowserSessionManager();
