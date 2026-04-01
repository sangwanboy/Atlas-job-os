/**
 * Atlas Job OS — Chrome Extension Background Service Worker
 * Connects to local WebSocket bridge on ws://localhost:3002
 * Receives commands from Atlas and controls a dedicated Atlas-managed tab.
 */

const BRIDGE_URL = "ws://localhost:3002";
const RECONNECT_DELAY_MS = 3000;

let ws = null;
let atlasTabId = null;
let reconnectTimer = null;

// ─── WebSocket Connection ────────────────────────────────────────────────────

function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  ws = new WebSocket(BRIDGE_URL);

  ws.onopen = () => {
    console.log("[Atlas] Connected to bridge at", BRIDGE_URL);
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    ws.send(JSON.stringify({ type: "register", agent: "chrome-extension" }));
  };

  ws.onmessage = async (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }
    if (msg.cmd) await handleCommand(msg);
  };

  ws.onerror = (err) => console.warn("[Atlas] WebSocket error:", err.message ?? err);

  ws.onclose = () => {
    console.log("[Atlas] Bridge disconnected. Reconnecting in", RECONNECT_DELAY_MS, "ms...");
    ws = null;
    reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
  };
}

function reply(id, status, data, error) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ id, status, data, error }));
  }
}

// ─── Command Handler ─────────────────────────────────────────────────────────

async function handleCommand(msg) {
  const { id, cmd, params = {} } = msg;
  console.log(`[Atlas] Command: ${cmd}`, params);

  try {
    switch (cmd) {
      case "openTab": {
        const [win] = await chrome.windows.getAll({ windowTypes: ["normal"] });
        const tab = await chrome.tabs.create({ url: params.url || "about:blank", active: true, ...(win?.id ? { windowId: win.id } : {}) });
        atlasTabId = tab.id;
        await waitForTabLoad(atlasTabId);
        reply(id, "ok", { tabId: atlasTabId });
        break;
      }

      case "closeTab": {
        if (atlasTabId) {
          await chrome.tabs.remove(atlasTabId).catch(() => {});
          atlasTabId = null;
        }
        reply(id, "ok", {});
        break;
      }

      case "navigate": {
        const tabId = await ensureAtlasTab(params.url);
        await chrome.tabs.update(tabId, { url: params.url });
        await waitForTabLoad(tabId);
        reply(id, "ok", { url: params.url });
        break;
      }

      case "screenshot": {
        const tabId = atlasTabId;
        if (!tabId) { reply(id, "error", null, "No Atlas tab open"); break; }
        const png = await captureFullPage(tabId);
        reply(id, "ok", { png });
        break;
      }

      case "click": {
        const tabId = atlasTabId;
        if (!tabId) { reply(id, "error", null, "No Atlas tab open"); break; }
        await chrome.scripting.executeScript({
          target: { tabId },
          func: (selector) => {
            const el = document.querySelector(selector);
            if (el) { el.click(); return true; }
            return false;
          },
          args: [params.selector],
        });
        reply(id, "ok", {});
        break;
      }

      case "scroll": {
        const tabId = atlasTabId;
        if (!tabId) { reply(id, "error", null, "No Atlas tab open"); break; }
        await chrome.scripting.executeScript({
          target: { tabId },
          func: (y) => window.scrollBy({ top: y, behavior: "smooth" }),
          args: [params.y || 500],
        });
        reply(id, "ok", {});
        break;
      }

      case "type": {
        const tabId = atlasTabId;
        if (!tabId) { reply(id, "error", null, "No Atlas tab open"); break; }
        await chrome.scripting.executeScript({
          target: { tabId },
          func: (selector, text) => {
            const el = document.querySelector(selector);
            if (el) {
              el.focus();
              el.value = text;
              el.dispatchEvent(new Event("input", { bubbles: true }));
              el.dispatchEvent(new Event("change", { bubbles: true }));
              return true;
            }
            return false;
          },
          args: [params.selector, params.text],
        });
        reply(id, "ok", {});
        break;
      }

      case "getJobCards": {
        const tabId = atlasTabId;
        if (!tabId) { reply(id, "error", null, "No Atlas tab open"); break; }
        const [result] = await chrome.scripting.executeScript({
          target: { tabId },
          func: scrapeJobCards,
        });
        reply(id, "ok", { cards: result.result || [] });
        break;
      }

      case "getLinks": {
        const tabId = atlasTabId;
        if (!tabId) { reply(id, "error", null, "No Atlas tab open"); break; }
        const [result] = await chrome.scripting.executeScript({
          target: { tabId },
          func: (pattern) => {
            const links = Array.from(document.querySelectorAll("a[href]"))
              .map(a => a.href)
              .filter(h => h && (!pattern || h.includes(pattern)));
            return [...new Set(links)];
          },
          args: [params.pattern || ""],
        });
        reply(id, "ok", { links: result.result || [] });
        break;
      }

      case "ping":
        reply(id, "ok", { pong: true, tabId: atlasTabId });
        break;

      default:
        reply(id, "error", null, `Unknown command: ${cmd}`);
    }
  } catch (err) {
    console.error(`[Atlas] Command ${cmd} failed:`, err);
    reply(id, "error", null, err.message || String(err));
  }
}

// ─── Job Card Scraper (injected into page) ───────────────────────────────────

function scrapeJobCards() {
  const url = window.location.href;
  const cards = [];

  if (url.includes("linkedin.com")) {
    document.querySelectorAll(".job-card-container, .jobs-search-results__list-item").forEach(el => {
      const titleEl = el.querySelector(".job-card-list__title, .job-card-container__link strong");
      const locationEl = el.querySelector(".job-card-container__metadata-item, .job-card-container__metadata-wrapper");
      const linkEl = el.querySelector("a.job-card-container__link, a[href*='/jobs/view/']");
      const title = titleEl?.innerText?.trim();
      const location = locationEl?.innerText?.trim();
      let jobUrl = linkEl?.href;
      if (jobUrl && !jobUrl.startsWith("http")) jobUrl = "https://www.linkedin.com" + jobUrl;
      if (title && jobUrl) cards.push({ title, location: location || "", url: jobUrl });
    });
  } else if (url.includes("indeed.com")) {
    document.querySelectorAll(".job_seen_beacon, .tapItem").forEach(el => {
      const titleEl = el.querySelector(".jobTitle span[title], .jobTitle a span");
      const locationEl = el.querySelector(".companyLocation");
      const linkEl = el.querySelector("a[data-jk], h2.jobTitle a");
      const title = titleEl?.innerText?.trim();
      const location = locationEl?.innerText?.trim();
      let jobUrl = linkEl?.href;
      if (jobUrl && !jobUrl.startsWith("http")) jobUrl = "https://www.indeed.com" + jobUrl;
      if (title && jobUrl) cards.push({ title, location: location || "", url: jobUrl });
    });
  } else if (url.includes("glassdoor.com")) {
    document.querySelectorAll("[data-test='jobListing'], .JobsList_jobListItem__wjTHv").forEach(el => {
      const titleEl = el.querySelector("[data-test='job-title'], .JobCard_jobTitle__GLyJ1");
      const locationEl = el.querySelector("[data-test='emp-location'], .JobCard_location__Ds1fM");
      const linkEl = el.querySelector("a[data-test='job-title'], a.JobCard_trackingLink__GrRYn");
      const title = titleEl?.innerText?.trim();
      const location = locationEl?.innerText?.trim();
      let jobUrl = linkEl?.href;
      if (title && jobUrl) cards.push({ title, location: location || "", url: jobUrl });
    });
  } else {
    // Generic fallback
    document.querySelectorAll("article, .job-item, [class*='job-card'], [class*='jobCard']").forEach(el => {
      const titleEl = el.querySelector("h2, h3, [class*='title']");
      const linkEl = el.querySelector("a[href]");
      const title = titleEl?.innerText?.trim();
      const jobUrl = linkEl?.href;
      if (title && jobUrl) cards.push({ title, location: "", url: jobUrl });
    });
  }

  return cards;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function ensureAtlasTab(url) {
  if (atlasTabId) {
    try {
      await chrome.tabs.get(atlasTabId);
      return atlasTabId;
    } catch {
      atlasTabId = null;
    }
  }
  // Open in the current focused window, not a new window
  const [win] = await chrome.windows.getAll({ windowTypes: ["normal"] });
  const windowId = win?.id;
  const tab = await chrome.tabs.create({ url: url || "about:blank", active: true, ...(windowId ? { windowId } : {}) });
  atlasTabId = tab.id;
  await waitForTabLoad(atlasTabId);
  return atlasTabId;
}

function waitForTabLoad(tabId, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Tab load timeout")), timeoutMs);
    function listener(id, changeInfo) {
      if (id === tabId && changeInfo.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(resolve, 500); // brief settle time
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function captureFullPage(tabId) {
  // Use chrome.debugger for full-page screenshot
  await chrome.debugger.attach({ tabId }, "1.3").catch(() => {});

  // Get full page dimensions
  const layoutResult = await chrome.debugger.sendCommand({ tabId }, "Page.getLayoutMetrics");
  const { contentSize } = layoutResult;

  // Use 1280px fixed width to avoid black bars from narrow content
  const captureWidth = 1280;
  await chrome.debugger.sendCommand({ tabId }, "Emulation.setDeviceMetricsOverride", {
    width: captureWidth,
    height: Math.min(contentSize.height, 16000),
    deviceScaleFactor: 1,
    mobile: false,
  });

  // Capture screenshot
  const { data } = await chrome.debugger.sendCommand({ tabId }, "Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    clip: {
      x: 0, y: 0,
      width: captureWidth,
      height: Math.min(contentSize.height, 16000),
      scale: 1,
    },
  });

  await chrome.debugger.detach({ tabId }).catch(() => {});
  return data; // base64 PNG
}

// ─── Keep-alive: prevent MV3 service worker from going idle ─────────────────

chrome.alarms.create("keep-alive", { periodInMinutes: 0.4 }); // every ~25s
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "keep-alive") connect();
});

// ─── Init ────────────────────────────────────────────────────────────────────

connect();
chrome.runtime.onStartup.addListener(connect);
chrome.runtime.onInstalled.addListener(() => {
  console.log("[Atlas] Extension installed. Connecting to bridge...");
  chrome.alarms.create("keep-alive", { periodInMinutes: 0.4 });
  connect();
});
