/**
 * Atlas Job OS — Chrome Extension Bridge
 * WebSocket server on :3002 that the Chrome extension connects to.
 * Atlas sends commands; extension executes them in the real Chrome browser.
 */

import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "crypto";

export interface BridgeCommand {
  id: string;
  cmd: string;
  params: Record<string, unknown>;
}

export interface BridgeResponse {
  id: string;
  status: "ok" | "error";
  data?: unknown;
  error?: string;
}

type PendingResolver = {
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

class ExtensionBridgeService {
  private wss: WebSocketServer | null = null;
  private _cancelled = false;
  private client: WebSocket | null = null;
  private pending = new Map<string, PendingResolver>();
  private started = false;

  start(port = 3002): void {
    if (this.started) return;
    this.started = true;

    this.wss = new WebSocketServer({ port });

    this.wss.on("listening", () => {
      console.log(`🔌 Extension bridge running on ws://localhost:${port}`);
    });

    this.wss.on("connection", (socket) => {
      console.log("[ExtensionBridge] Chrome extension connected");
      this.client = socket;

      socket.on("message", (raw) => {
        let msg: BridgeResponse;
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          return;
        }

        // Registration ack — ignore
        if (!msg.id) return;

        const pending = this.pending.get(msg.id);
        if (!pending) return;

        clearTimeout(pending.timer);
        this.pending.delete(msg.id);

        if (msg.status === "ok") {
          pending.resolve(msg.data);
        } else {
          pending.reject(new Error(msg.error ?? "Extension command failed"));
        }
      });

      socket.on("close", () => {
        console.log("[ExtensionBridge] Chrome extension disconnected");
        if (this.client === socket) this.client = null;
        // Reject all pending on disconnect
        for (const [id, pending] of this.pending) {
          clearTimeout(pending.timer);
          pending.reject(new Error("Extension disconnected"));
          this.pending.delete(id);
        }
      });

      socket.on("error", (err) => {
        console.warn("[ExtensionBridge] Socket error:", err.message);
      });
    });

    this.wss.on("error", (err) => {
      console.error("[ExtensionBridge] Server error:", err.message);
    });
  }

  isConnected(): boolean {
    return this.client?.readyState === WebSocket.OPEN;
  }

  private send<T>(cmd: string, params: Record<string, unknown> = {}, timeoutMs = 20_000): Promise<T> {
    if (!this.isConnected()) {
      return Promise.reject(new Error("Extension not connected"));
    }

    const id = randomUUID();
    const msg: BridgeCommand = { id, cmd, params };

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Extension command "${cmd}" timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pending.set(id, {
        resolve: resolve as (data: unknown) => void,
        reject,
        timer,
      });

      this.client!.send(JSON.stringify(msg));
    });
  }

  // ─── Public Command API ───────────────────────────────────────────────────

  async openTab(url: string): Promise<{ tabId: number }> {
    return this.send("openTab", { url });
  }

  async closeTab(): Promise<void> {
    await this.send("closeTab", {});
  }

  async navigate(url: string, tabKey = "default"): Promise<void> {
    await this.send("navigate", { url, tabKey }, 30_000);
  }

  async screenshot(tabKey = "default"): Promise<string> {
    const result = await this.send<{ png: string }>("screenshot", { tabKey }, 30_000);
    return result.png;
  }

  async click(selector: string, tabKey = "default"): Promise<void> {
    await this.send("click", { selector, tabKey });
  }

  async scroll(y = 500, tabKey = "default"): Promise<void> {
    await this.send("scroll", { y, tabKey });
  }

  async type(selector: string, text: string, tabKey = "default"): Promise<void> {
    await this.send("type", { selector, text, tabKey });
  }

  async getLinks(pattern = "", tabKey = "default"): Promise<string[]> {
    const result = await this.send<{ links: string[] }>("getLinks", { pattern, tabKey });
    return result.links ?? [];
  }

  async getJobCards(tabKey = "default"): Promise<Array<{ title: string; company: string; location: string; url: string }>> {
    const result = await this.send<{ cards: Array<{ title: string; company: string; location: string; url: string }> }>(
      "getJobCards",
      { tabKey },
    );
    return result.cards ?? [];
  }

  async getJobDetail(tabKey = "default"): Promise<{ company: string; salary: string; jobType: string; description: string; url: string }> {
    const result = await this.send<{ detail: { company: string; salary: string; jobType: string; description: string; url: string } }>(
      "getJobDetail",
      { tabKey },
      15_000,
    );
    return result.detail ?? { company: "", salary: "", jobType: "", description: "", url: "" };
  }

  async ping(): Promise<boolean> {
    try {
      const result = await this.send<{ pong: boolean }>("ping", {}, 5_000);
      return result.pong === true;
    } catch {
      return false;
    }
  }

  isCancelled(): boolean {
    return this._cancelled;
  }

  async cancel(): Promise<void> {
    this._cancelled = true;
    try { await this.closeTab(); } catch {}
    // Reset after a moment so next search works
    setTimeout(() => { this._cancelled = false; }, 3_000);
  }

  resetCancel(): void {
    this._cancelled = false;
  }
}

export const extensionBridge = new ExtensionBridgeService();
