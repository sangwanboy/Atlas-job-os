/**
 * Atlas Job OS — Chrome Extension Background Service Worker
 * Connects to local WebSocket bridge on ws://localhost:3002
 * Receives commands from Atlas and controls a dedicated Atlas-managed tab.
 */

const BRIDGE_URL = "ws://localhost:3002";
const RECONNECT_DELAY_MS = 3000;

let ws = null;
const atlasTabs = new Map(); // tabKey -> tabId  (one tab per platform for parallel search)
let reconnectTimer = null;

/**
 * Retry wrapper for chrome.scripting.executeScript.
 * The "Frame with ID 0 was removed" error occurs when the tab navigates
 * (redirect, SPA route change) between our navigate call and the script injection.
 * We wait for the tab to settle again, then retry up to maxRetries times.
 */
async function safeExecuteScript(tabId, scriptOptions, maxRetries = 3) {
  let lastErr;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        // Tab frame was replaced — wait for it to finish loading before retrying
        await waitForTabLoad(tabId, 15000).catch(() => {});
        await sleep(300 + attempt * 300);
      }
      const results = await chrome.scripting.executeScript({ target: { tabId }, ...scriptOptions });
      return results;
    } catch (err) {
      lastErr = err;
      const msg = err?.message || String(err);
      const isFrameError = /frame.*removed|no frame with id|target closed|detached/i.test(msg);
      if (!isFrameError) throw err; // Non-frame error — don't retry
      console.warn(`[Atlas] safeExecuteScript attempt ${attempt + 1} frame error, retrying:`, msg);
    }
  }
  throw lastErr;
}

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
        const tab = await chrome.tabs.create({ url: params.url || "about:blank", active: false, ...(win?.id ? { windowId: win.id } : {}) });
        const key = params.tabKey || "default";
        atlasTabs.set(key, tab.id);
        await waitForTabLoad(tab.id);
        reply(id, "ok", { tabId: tab.id });
        break;
      }

      case "closeTab": {
        const key = params.tabKey || "default";
        const tid = atlasTabs.get(key);
        if (tid) {
          await chrome.tabs.remove(tid).catch(() => {});
          atlasTabs.delete(key);
        }
        reply(id, "ok", {});
        break;
      }

      case "navigate": {
        const key = params.tabKey || "default";
        const tabId = await ensureNamedTab(key, params.url);
        await chrome.tabs.update(tabId, { url: params.url, active: false });
        await waitForTabLoad(tabId);
        // Some sites (Reed, LinkedIn) do a client-side redirect after the initial load.
        // Wait briefly and if the tab is still loading, wait for it again to avoid
        // "Frame with ID 0 was removed" on the next executeScript call.
        await sleep(400);
        const tabState = await chrome.tabs.get(tabId).catch(() => null);
        if (tabState && tabState.status === "loading") {
          await waitForTabLoad(tabId, 15000).catch(() => {});
          await sleep(300);
        }
        // Clear any stuck viewport override left by a previous screenshot
        await chrome.debugger.attach({ tabId }, "1.3").catch(() => {});
        await chrome.debugger.sendCommand({ tabId }, "Emulation.clearDeviceMetricsOverride").catch(() => {});
        await chrome.debugger.detach({ tabId }).catch(() => {});
        // Auto-accept cookie banners after load
        await acceptCookieBanners(tabId);
        // Human-like: random micro-pause
        await sleep(200 + Math.random() * 300);
        reply(id, "ok", { url: params.url });
        break;
      }

      case "screenshot": {
        const key = params.tabKey || "default";
        const tabId = atlasTabs.get(key);
        if (!tabId) { reply(id, "error", null, "No Atlas tab open for key: " + key); break; }
        const png = await captureFullPage(tabId);
        reply(id, "ok", { png });
        break;
      }

      case "click": {
        const key = params.tabKey || "default";
        const tabId = atlasTabs.get(key);
        if (!tabId) { reply(id, "error", null, "No Atlas tab open for key: " + key); break; }
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
        const key = params.tabKey || "default";
        const tabId = atlasTabs.get(key);
        if (!tabId) { reply(id, "error", null, "No Atlas tab open for key: " + key); break; }
        await chrome.scripting.executeScript({
          target: { tabId },
          func: (y) => window.scrollBy({ top: y, behavior: "smooth" }),
          args: [params.y || 500],
        });
        reply(id, "ok", {});
        break;
      }

      case "type": {
        const key = params.tabKey || "default";
        const tabId = atlasTabs.get(key);
        if (!tabId) { reply(id, "error", null, "No Atlas tab open for key: " + key); break; }
        await chrome.scripting.executeScript({
          target: { tabId },
          func: (selector, text) => {
            const el = document.querySelector(selector);
            if (el) {
              el.focus();
              // Type character-by-character with small delays for human-like input
              const chars = [...text];
              let i = 0;
              const typeNext = () => {
                if (i >= chars.length) return;
                el.value += chars[i++];
                el.dispatchEvent(new Event("input", { bubbles: true }));
                setTimeout(typeNext, 40 + Math.random() * 80);
              };
              typeNext();
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
        const key = params.tabKey || "default";
        const tabId = atlasTabs.get(key);
        if (!tabId) { reply(id, "error", null, "No Atlas tab open for key: " + key); break; }
        const [result] = await safeExecuteScript(tabId, { func: scrapeJobCards });
        reply(id, "ok", { cards: result.result || [] });
        break;
      }

      case "getJobDetail": {
        const key = params.tabKey || "default";
        const tabId = atlasTabs.get(key);
        if (!tabId) { reply(id, "error", null, "No Atlas tab open for key: " + key); break; }
        const [result] = await safeExecuteScript(tabId, { func: scrapeJobDetail });
        reply(id, "ok", { detail: result.result || {} });
        break;
      }

      case "getLinks": {
        const key = params.tabKey || "default";
        const tabId = atlasTabs.get(key);
        if (!tabId) { reply(id, "error", null, "No Atlas tab open for key: " + key); break; }
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
        reply(id, "ok", { pong: true, tabCount: atlasTabs.size });
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

  // Helper: try multiple selectors, return first match
  function qs(el, ...sels) {
    for (const s of sels) { try { const r = el.querySelector(s); if (r) return r; } catch {} }
    return null;
  }

  if (url.includes("linkedin.com")) {
    // Use broad set of selectors — LinkedIn rewrites class names regularly
    document.querySelectorAll(
      "li.jobs-search-results__list-item, [data-occludable-job-id], .job-card-container, [data-job-id]"
    ).forEach(el => {
      const titleEl = qs(el,
        "a.job-card-list__title--link",
        ".job-card-list__title",
        ".job-card-container__link strong",
        "a[href*='/jobs/view/'] strong",
        "strong"
      );
      const companyEl = qs(el,
        ".job-card-container__primary-description",
        ".job-card-container__company-name",
        ".artdeco-entity-lockup__subtitle",
        ".job-card-list__subtitle"
      );
      const locationEl = qs(el,
        ".job-card-container__metadata-item",
        ".job-card-container__metadata-wrapper li",
        ".artdeco-entity-lockup__caption"
      );
      const linkEl = qs(el,
        "a.job-card-list__title--link",
        "a.job-card-container__link",
        "a[href*='/jobs/view/']"
      );
      const title = titleEl?.innerText?.trim();
      let jobUrl = linkEl?.href;
      if (jobUrl && !jobUrl.startsWith("http")) jobUrl = "https://www.linkedin.com" + jobUrl;
      if (title && jobUrl) cards.push({ title, company: companyEl?.innerText?.trim() || "", location: locationEl?.innerText?.trim() || "", url: jobUrl });
    });

  } else if (url.includes("indeed.com") || url.includes("indeed.co.uk")) {
    document.querySelectorAll(".job_seen_beacon, .tapItem, [data-jk]").forEach(el => {
      const titleEl = qs(el, ".jobTitle span[title]", ".jobTitle a span", "h2.jobTitle span", "[class*='jobTitle'] span");
      const companyEl = qs(el, ".companyName", "[data-testid='company-name']", "[class*='companyName']");
      const locationEl = qs(el, ".companyLocation", "[data-testid='text-location']");
      const linkEl = qs(el, "a[data-jk]", "h2.jobTitle a", "a[href*='/viewjob']");
      const title = titleEl?.innerText?.trim();
      let jobUrl = linkEl?.href;
      if (jobUrl && !jobUrl.startsWith("http")) jobUrl = "https://www.indeed.com" + jobUrl;
      if (title && jobUrl) cards.push({ title, company: companyEl?.innerText?.trim() || "", location: locationEl?.innerText?.trim() || "", url: jobUrl });
    });

  } else if (url.includes("reed.co.uk")) {
    // Reed job detail URLs have the form: /jobs/[slug]/[numeric-id]
    // Reject saved-jobs, search results, category, and generic listing pages.
    const isReedJobDetail = (u) => /\/jobs\/[^/?#]+\/\d+/.test(u);
    const REED_JUNK_PATTERNS = [/\/saved-jobs/, /\/jobs\/saved/, /\/jobs\/?$/, /\/jobs\/search/, /\/jobs\?/, /\/jobs\/[^/]+\/?$/];
    const isReedJunk = (u) => !isReedJobDetail(u) || REED_JUNK_PATTERNS.some(p => p.test(u));

    const seen = new Set();
    document.querySelectorAll(
      "article[data-qa='job-card'], [data-qa='jobResult'], .job-result, article[class*='job'], li[class*='job']"
    ).forEach(el => {
      const titleEl = qs(el, "[data-qa='job-card-title']", "h2[data-qa='job-card-title'] a", ".job-result__title a", "h2 a", "h3 a");
      const companyEl = qs(el, "[data-qa='job-card-recruiter']", "[data-qa='job-card-school']", ".job-result__details--company", "[class*='company']");
      const locationEl = qs(el, "[data-qa='job-card-location']", ".job-result__details--location", "[class*='location']");
      const linkEl = qs(el, "a[data-qa='job-card-title']", ".job-result__title a", "h2 a", "h3 a", "a[href*='/jobs/']");
      const title = titleEl?.innerText?.trim();
      let jobUrl = linkEl?.href;
      if (jobUrl && !jobUrl.startsWith("http")) jobUrl = "https://www.reed.co.uk" + jobUrl;
      if (title && jobUrl && !seen.has(jobUrl) && !isReedJunk(jobUrl)) {
        seen.add(jobUrl);
        cards.push({ title, company: companyEl?.innerText?.trim() || "", location: locationEl?.innerText?.trim() || "", url: jobUrl });
      }
    });
    // Fallback: only grab links that are real Reed job detail pages (slug + numeric ID)
    if (cards.length === 0) {
      const seen2 = new Set();
      document.querySelectorAll("a[href*='/jobs/']").forEach(a => {
        const txt = a.innerText?.trim();
        let href = a.href;
        if (href && !href.startsWith("http")) href = "https://www.reed.co.uk" + href;
        if (txt && txt.length > 5 && txt.length < 120 && !seen2.has(href) && isReedJobDetail(href)) {
          seen2.add(href);
          cards.push({ title: txt, company: "", location: "", url: href });
        }
      });
    }

  } else if (url.includes("totaljobs.com")) {
    // TotalJobs uses React with hashed/dynamic class names — rely on data-* and href patterns
    const seen = new Set();
    document.querySelectorAll(
      "[data-at='job-item'], article[data-job-id], [data-testid='job-item'], article.job, [class*='job-item'], [class*='JobItem']"
    ).forEach(el => {
      const titleEl = qs(el,
        "a[data-at='job-item-title']",
        "h2 a", "h3 a",
        "a[href*='/job/']",
        "[class*='title'] a",
        "a[class*='Title']"
      );
      const companyEl = qs(el,
        "[data-at='job-item-company-name']",
        "[class*='employer']", "[class*='Employer']",
        "[class*='company']", "[class*='Company']"
      );
      const locationEl = qs(el,
        "[data-at='job-item-location']",
        "[class*='location']", "[class*='Location']"
      );
      const title = titleEl?.innerText?.trim();
      const jobUrl = titleEl?.href || qs(el, "a[href*='/job/']")?.href;
      if (title && jobUrl && !seen.has(jobUrl)) {
        seen.add(jobUrl);
        cards.push({ title, company: companyEl?.innerText?.trim() || "", location: locationEl?.innerText?.trim() || "", url: jobUrl });
      }
    });
    // Extra fallback: grab any <a> linking to /job/ with a visible text heading
    if (cards.length === 0) {
      const seen2 = new Set();
      document.querySelectorAll("a[href*='/job/']").forEach(a => {
        const txt = a.innerText?.trim();
        if (txt && txt.length > 5 && txt.length < 120 && !seen2.has(a.href)) {
          seen2.add(a.href);
          cards.push({ title: txt, company: "", location: "", url: a.href });
        }
      });
    }

  } else if (url.includes("adzuna.co.uk") || url.includes("adzuna.com")) {
    const seen = new Set();
    document.querySelectorAll(
      "[class*='Result_result'], article[class*='Result'], [data-aid], [class*='JobAd'], article"
    ).forEach(el => {
      const titleEl = qs(el,
        "[class*='jobAd_title']", "[class*='JobAd_title']",
        "h2 a", "h3 a",
        "a[href*='/details/']",
        "[class*='title'] a", "a[class*='Title']"
      );
      const companyEl = qs(el, "[class*='company']", "[class*='Company']", "[class*='employer']");
      const locationEl = qs(el, "[class*='location']", "[class*='Location']");
      const title = titleEl?.innerText?.trim();
      const jobUrl = titleEl?.href || qs(el, "a[href*='/details/']")?.href;
      if (title && jobUrl && !seen.has(jobUrl)) {
        seen.add(jobUrl);
        cards.push({ title, company: companyEl?.innerText?.trim() || "", location: locationEl?.innerText?.trim() || "", url: jobUrl });
      }
    });
    // Fallback: any link to /details/
    if (cards.length === 0) {
      const seen2 = new Set();
      document.querySelectorAll("a[href*='/details/']").forEach(a => {
        const txt = a.innerText?.trim();
        if (txt && txt.length > 5 && txt.length < 120 && !seen2.has(a.href)) {
          seen2.add(a.href);
          cards.push({ title: txt, company: "", location: "", url: a.href });
        }
      });
    }

  } else if (url.includes("cv-library.co.uk")) {
    const seen = new Set();
    document.querySelectorAll(
      ".job-item, [class*='job-listing'], article[data-id], [data-job-id], [class*='Job_'], li[class*='job']"
    ).forEach(el => {
      const titleEl = qs(el,
        "a.job-listing__title",
        "h2 a", "h3 a",
        "a[href*='/job/']",
        "[class*='title'] a"
      );
      const companyEl = qs(el, ".job-listing__company-name", "[class*='company']", "[class*='Company']");
      const locationEl = qs(el, ".job-listing__location", "[class*='location']");
      const title = titleEl?.innerText?.trim();
      const jobUrl = titleEl?.href || qs(el, "a[href*='/job/']")?.href;
      if (title && jobUrl && !seen.has(jobUrl)) {
        seen.add(jobUrl);
        cards.push({ title, company: companyEl?.innerText?.trim() || "", location: locationEl?.innerText?.trim() || "", url: jobUrl });
      }
    });
    // Fallback: any link to /job/
    if (cards.length === 0) {
      const seen2 = new Set();
      document.querySelectorAll("a[href*='/job/']").forEach(a => {
        const txt = a.innerText?.trim();
        if (txt && txt.length > 5 && txt.length < 120 && !seen2.has(a.href)) {
          seen2.add(a.href);
          cards.push({ title: txt, company: "", location: "", url: a.href });
        }
      });
    }

  } else if (url.includes("glassdoor.com")) {
    document.querySelectorAll("[data-test='jobListing'], .JobsList_jobListItem__wjTHv, li[data-jobid]").forEach(el => {
      const titleEl = qs(el, "[data-test='job-title']", ".JobCard_jobTitle__GLyJ1", "a[class*='JobCard_trackingLink']");
      const companyEl = qs(el, "[data-test='employer-name']", ".EmployerProfile_compactEmployerName__9MGcV");
      const locationEl = qs(el, "[data-test='emp-location']", ".JobCard_location__Ds1fM");
      const linkEl = qs(el, "a[data-test='job-title']", "a.JobCard_trackingLink__GrRYn", "a[href*='/partner/jobListing']");
      const title = titleEl?.innerText?.trim();
      const jobUrl = linkEl?.href;
      if (title && jobUrl) cards.push({ title, company: companyEl?.innerText?.trim() || "", location: locationEl?.innerText?.trim() || "", url: jobUrl });
    });

  } else {
    // Generic fallback with broader selectors + dedup by URL
    const seen = new Set();
    document.querySelectorAll(
      "article, li[class*='job'], [class*='job-card'], [class*='jobCard'], [class*='job-item'], [class*='jobItem'], [data-job-id]"
    ).forEach(el => {
      const titleEl = qs(el, "h2 a", "h3 a", "a[class*='title']", "a[href]");
      const companyEl = qs(el, "[class*='company']", "[class*='employer']", "[class*='org']");
      const title = titleEl?.innerText?.trim();
      const jobUrl = titleEl?.href;
      if (title && jobUrl && !seen.has(jobUrl)) {
        seen.add(jobUrl);
        cards.push({ title, company: companyEl?.innerText?.trim() || "", location: "", url: jobUrl });
      }
    });
  }

  return cards;
}

// ─── Job Detail Scraper (injected into detail page) ─────────────────────────

function scrapeJobDetail() {
  const url = window.location.href;
  const getText = (selectors) => {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      const t = el?.innerText?.trim();
      if (t && t.length > 1) return t;
    }
    return "";
  };

  let company = "", salary = "", jobType = "", description = "";

  if (url.includes("linkedin.com")) {
    company    = getText([".jobs-unified-top-card__company-name a", ".job-details-jobs-unified-top-card__company-name a", ".topcard__org-name-link"]);
    salary     = getText([".jobs-unified-top-card__job-insight--salary span", ".compensation__salary", ".jobs-details-top-card__job-info span"]);
    jobType    = getText([".jobs-unified-top-card__workplace-type", ".job-details-jobs-unified-top-card__workplace-type"]);
    description = getText([".jobs-description-content__text--stretch", ".jobs-description__content .jobs-box__html-content", "#job-details"]);

  } else if (url.includes("indeed.com")) {
    company    = getText(["[data-testid='inlineHeader-companyName'] a", ".jobsearch-CompanyInfoWithoutHeaderImage .companyName", ".icl-u-lg-mr--sm"]);
    salary     = getText(["#salaryInfoAndJobType span", ".attribute_snippet", "[data-testid='attribute_snippet_testid']"]);
    jobType    = getText(["[data-testid='jobMetadataHeader-jobtype']", ".jobMetadataHeader-jobtype"]);
    description = getText(["#jobDescriptionText", ".jobsearch-jobDescriptionText"]);

  } else if (url.includes("reed.co.uk")) {
    company    = getText([".col-company-header h2 a", ".employer-name a", "span[itemprop='name']"]);
    salary     = getText(["[data-qa='salaryLabel']", ".salary span", "[itemprop='baseSalary']"]);
    jobType    = getText(["[data-qa='jobTypeLabel']", ".contract-type"]);
    description = getText(["[itemprop='description']", "#job-description", ".description"]);

  } else if (url.includes("totaljobs.com")) {
    company    = getText([".job-header__company a", ".company-name a"]);
    salary     = getText([".job-header__salary", ".salary"]);
    jobType    = getText([".job-header__type"]);
    description = getText([".job-description", "#job-description"]);

  } else if (url.includes("adzuna.co.uk")) {
    company    = getText(["[class*='CompanyName']", ".job-ad-display__company"]);
    salary     = getText(["[class*='Salary']", ".job-ad-display__salary"]);
    description = getText(["[class*='Description']", ".job-ad-display__body", "section.adp-body"]);

  } else if (url.includes("cv-library.co.uk")) {
    company    = getText([".job-header__company", ".company-name"]);
    salary     = getText([".job-header__salary", ".salary"]);
    description = getText(["#job-description", ".job-description__content"]);

  } else {
    // Generic fallback — grab any sizeable block of text
    company    = getText(["[class*='company']", "[class*='employer']", "[class*='organisation']"]);
    salary     = getText(["[class*='salary']", "[class*='compensation']", "[class*='pay']"]);
    description = getText(["[class*='description']", "[id*='description']", "article", "main"]);
  }

  // Trim description to 2000 chars to avoid huge payloads
  if (description.length > 2000) description = description.slice(0, 2000) + "…";

  return { company, salary, jobType, description, url };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function ensureNamedTab(tabKey, url) {
  const existing = atlasTabs.get(tabKey);
  if (existing) {
    try {
      await chrome.tabs.get(existing);
      return existing;
    } catch {
      atlasTabs.delete(tabKey);
    }
  }
  const [win] = await chrome.windows.getAll({ windowTypes: ["normal"] });
  const windowId = win?.id;
  // Open as background tab so it doesn't steal focus from the user
  const tab = await chrome.tabs.create({ url: url || "about:blank", active: false, ...(windowId ? { windowId } : {}) });
  atlasTabs.set(tabKey, tab.id);
  await waitForTabLoad(tab.id);
  return tab.id;
}

// Auto-dismiss cookie/GDPR banners using common selector patterns
async function acceptCookieBanners(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const acceptSelectors = [
          // Generic accept patterns
          'button[id*="accept"]', 'button[class*="accept"]',
          'button[id*="cookie"]', 'button[class*="cookie"]',
          'button[id*="consent"]', 'button[class*="consent"]',
          'button[id*="agree"]', 'button[class*="agree"]',
          // Text-based matching
          ...Array.from(document.querySelectorAll('button, a[role="button"]')).filter(el => {
            const t = el.innerText?.toLowerCase().trim();
            return t && (t === 'accept' || t === 'accept all' || t === 'accept cookies' ||
                         t === 'agree' || t === 'i agree' || t === 'got it' ||
                         t === 'ok' || t === 'allow all' || t === 'allow cookies' ||
                         t === 'accept & continue');
          }),
          // Site-specific
          '#onetrust-accept-btn-handler',
          '.js-accept-cookies',
          '[data-testid="cookie-accept"]',
          '[aria-label*="Accept"]',
          '.cc-btn.cc-allow',
          '#accept-cookie-notification',
        ];
        for (const sel of acceptSelectors) {
          try {
            const el = typeof sel === 'string' ? document.querySelector(sel) : sel;
            if (el && el.offsetParent !== null) { // only click visible elements
              el.click();
              return true;
            }
          } catch {}
        }
        return false;
      },
    });
  } catch {
    // Ignore — cookie banner acceptance is best-effort
  }
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

  // Reset viewport override so the tab returns to its natural window size (prevents black bars)
  await chrome.debugger.sendCommand({ tabId }, "Emulation.clearDeviceMetricsOverride").catch(() => {});
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
