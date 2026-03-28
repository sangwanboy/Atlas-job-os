"""
Atlas Job Scraper — Human-like browser automation
Strategy: Bezier mouse movement → DOM scan → relevance filter → detail page scrape
Bot prevention: stealth browser, rotating UA, non-linear mouse, natural timing
"""
import sys
import json
import asyncio
import io
import re
import random
import math
import argparse
import os
from urllib.parse import urlparse

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

# ── Dynamic selector overrides (Atlas self-heals these) ────────────────────────

_SELECTORS_FILE = os.path.join(os.path.dirname(__file__), "../../../agents/atlas/scraper_selectors.json")

def _load_dynamic_selectors() -> dict:
    try:
        with open(_SELECTORS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data.get("overrides", {})
    except Exception:
        return {}

DYNAMIC_SELECTORS = _load_dynamic_selectors()

# ── User Agents ────────────────────────────────────────────────────────────────

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
]

# ── Bezier curve mouse movement ────────────────────────────────────────────────

def _quad_bezier(p0, ctrl, p1, t):
    """Quadratic bezier point at parameter t."""
    x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * ctrl[0] + t ** 2 * p1[0]
    y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * ctrl[1] + t ** 2 * p1[1]
    return (x, y)


def bezier_path(start, end):
    """Generate a non-linear Bezier curve path between two points."""
    dist = math.hypot(end[0] - start[0], end[1] - start[1])
    steps = max(12, min(45, int(dist / 18)))

    # Random control point — creates organic curve shape
    ctrl_x = (start[0] + end[0]) / 2 + random.uniform(-130, 130)
    ctrl_y = (start[1] + end[1]) / 2 + random.uniform(-90, 90)

    pts = []
    for i in range(steps + 1):
        t = i / steps
        # Ease-in-out smoothstep for natural acceleration/deceleration
        t_smooth = t * t * (3.0 - 2.0 * t)
        pts.append(_quad_bezier(start, (ctrl_x, ctrl_y), end, t_smooth))
    return pts


async def human_move(page, start, end):
    """Move mouse along Bezier curve with variable speed per segment."""
    pts = bezier_path(start, end)
    for x, y in pts:
        await page.mouse.move(x, y)
        # Non-uniform delay: micro-pauses simulate real hand tremor
        await asyncio.sleep(random.uniform(0.004, 0.022))
    # Brief hover pause before next action
    await asyncio.sleep(random.uniform(0.06, 0.20))


async def human_click(page, x, y, *, from_pos=None):
    """Human-like click: move to target along Bezier curve, then click."""
    sx = from_pos[0] if from_pos else random.uniform(80, 1100)
    sy = from_pos[1] if from_pos else random.uniform(80, 650)
    # Add slight overshoot and correction for realism
    overshoot_x = x + random.uniform(-8, 8)
    overshoot_y = y + random.uniform(-6, 6)
    await human_move(page, (sx, sy), (overshoot_x, overshoot_y))
    # Micro-correction to exact target
    await page.mouse.move(x, y)
    await asyncio.sleep(random.uniform(0.04, 0.12))
    await page.mouse.click(x, y)
    await asyncio.sleep(random.uniform(0.25, 0.65))


async def human_scroll(page, total_px=None):
    """Scroll naturally with variable speed — slower start/end, faster middle."""
    if total_px is None:
        total_px = random.randint(250, 750)
    segments = random.randint(4, 9)
    for i in range(segments):
        # Ease curve: slower at edges, faster in middle
        t = i / (segments - 1) if segments > 1 else 0.5
        speed_factor = 1 + math.sin(t * math.pi) * 0.8
        chunk = int((total_px / segments) * speed_factor) + random.randint(-15, 15)
        await page.mouse.wheel(0, max(10, chunk))
        await asyncio.sleep(random.uniform(0.06, 0.16))


# ── Site detection ─────────────────────────────────────────────────────────────

def detect_site(url: str) -> str:
    host = urlparse(url).hostname or ""
    if "linkedin.com" in host:       return "linkedin"
    if "indeed.com" in host:         return "indeed"
    if "reed.co.uk" in host:         return "reed"
    if "glassdoor" in host:          return "glassdoor"
    if "totaljobs" in host:          return "totaljobs"
    if "cv-library" in host:         return "cvlibrary"
    if "adzuna" in host:             return "adzuna"
    if "monster.co.uk" in host:      return "monster"
    if "cwjobs" in host:             return "cwjobs"
    if "theguardian.com" in host:    return "guardian"
    return "generic"


# ── Relevance scoring ──────────────────────────────────────────────────────────

def score_relevance(title: str, company: str, query: str) -> float:
    """
    Quick card-level score (0.0–1.0) used only to rank candidates on the
    listing page before visiting detail pages.
    """
    if not query:
        return 1.0
    q_words = set(re.findall(r"\w+", query.lower()))
    t_words = set(re.findall(r"\w+", title.lower()))
    c_words = set(re.findall(r"\w+", company.lower()))
    matches = q_words & (t_words | c_words)
    return len(matches) / max(len(q_words), 1)


def compute_final_score(job: dict, query: str) -> float:
    """
    Multi-signal score computed after detail-page scrape.
    Returns 0.0–1.0 (frontend multiplies by 100 for display).

    Signals:
      Title match          0–35 pts
      Description density  0–25 pts
      Location match       0–15 pts
      Recency              0–15 pts
      Low competition      0–10 pts
      ─────────────────────────────
      Max                  100 pts
    """
    if not query:
        return round(random.uniform(55, 75))

    q_words = set(re.findall(r"\w+", query.lower()))
    title       = (job.get("title")       or "").lower()
    description = (job.get("description") or "").lower()
    location    = (job.get("location")    or "").lower()
    date_posted = (job.get("date_posted") or "").lower()
    applicants  = (job.get("applicants")  or "").lower()
    points = 0

    # 1. Title match (0–35) ──────────────────────────────────────────────────
    t_words = set(re.findall(r"\w+", title))
    title_hits = q_words & t_words
    title_pts = int((len(title_hits) / max(len(q_words), 1)) * 28)
    if title_hits == q_words:   # every query word in title → bonus
        title_pts += 7
    points += min(35, title_pts)

    # 2. Description keyword density (0–25) ──────────────────────────────────
    if description:
        desc_words = set(re.findall(r"\w+", description))
        desc_hits  = q_words & desc_words
        density    = len(desc_hits) / max(len(q_words), 1)
        freq       = sum(description.count(w) for w in q_words if len(w) > 3)
        points    += min(25, int(density * 17) + min(8, freq // 2))

    # 3. Location match (0–15) ───────────────────────────────────────────────
    if location:
        loc_words = set(re.findall(r"\w+", location))
        loc_hits  = q_words & loc_words
        if loc_hits:
            points += min(15, len(loc_hits) * 8)
        elif any(k in location for k in ("remote", "hybrid", "anywhere")):
            points += 6

    # 4. Recency (0–15) ──────────────────────────────────────────────────────
    if date_posted:
        dp = date_posted
        if any(x in dp for x in ("just", "today", "hour", "1 day", "2 day")):
            points += 15
        elif any(x in dp for x in ("3 day", "4 day", "5 day", "6 day")):
            points += 11
        elif re.search(r"[12] week", dp):
            points += 7
        elif "month" in dp:
            points += 3

    # 5. Competition — inverted applicant count (0–10) ───────────────────────
    nums = re.findall(r"\d+", applicants)
    if nums:
        count = int(nums[0])
        if count < 25:    points += 10
        elif count < 75:  points += 7
        elif count < 150: points += 4
        elif count < 300: points += 2
    else:
        points += 4  # unknown → neutral

    return round(max(1, min(100, points)))


# ── Per-site DOM selectors ─────────────────────────────────────────────────────

CARD_TITLE_SELS = ["h3", "h2", "a[class*='title' i]", "span[class*='title' i]",
                   "[data-qa='job-title']", "[data-testid*='title' i]"]

CARD_COMPANY_SELS = ["h4", "span[class*='company' i]", "a[class*='company' i]",
                     "[data-qa='recruiter-link']", "[data-testid*='company' i]"]

CARD_LOCATION_SELS = ["span[class*='location' i]", "div[class*='location' i]",
                      "[data-qa='job-card-location']", "[data-testid*='location' i]"]

CARD_SALARY_SELS = ["span[class*='salary' i]", "div[class*='salary' i]",
                    "[data-qa='job-card-salary']", "[data-testid*='salary' i]"]

CARD_LINK_SELS = ["a[class*='full-link' i]", "a[class*='title' i]",
                  "[data-qa='job-title']", "h2 a", "h3 a", "a[href*='/jobs/']", "a"]

CARD_ROOT_SELS = {
    "linkedin":  ["div.base-card", "div.job-search-card", "li.jobs-search-results__list-item"],
    "indeed":    ["div.job_seen_beacon", "div.tapItem", "div[data-testid='job-list-item']", "li.css-1ac2h1w"],
    "reed":      ["article.job-card", "article[data-qa='job-result']", "div[data-qa='job-card']"],
    "glassdoor": ["li.JobsList_jobListItem__JBBUV", "article[data-test='job-listing']"],
    "totaljobs": ["article.job", "div[class*='job-item' i]"],
    "adzuna":    ["article[class*='job' i]", "div[class*='job-result' i]", "div[data-aid='job-result']", "div[class*='Result']"],
    "cvlibrary": ["div.job", "li[class*='job' i]", "article[class*='job' i]", "div[data-job-id]"],
    "monster":   ["div.job-search-resultsstyle__JobCardContainer", "section[class*='card' i]", "div[class*='job-card' i]", "article[class*='job' i]"],
    "cwjobs":    ["div[class*='job-item' i]", "article[class*='job' i]", "li[class*='job' i]"],
    "guardian":  ["li[class*='job' i]", "article[class*='job' i]", "div[class*='job-list-item' i]"],
    "generic":   ["article", "div[class*='job-card' i]", "div[class*='JobCard']", "li[class*='job' i]"],
}

DETAIL_SELS = {
    "linkedin": {
        "description": [".show-more-less-html__markup", ".jobs-description__content", ".jobs-box__html-content"],
        "title":       ["h1.top-card-layout__title", "h1.jobs-unified-top-card__job-title", "h1"],
        "company":     [".topcard__org-name-link", ".jobs-unified-top-card__company-name a"],
        "location":    [".topcard__flavor--bullet", ".jobs-unified-top-card__bullet"],
        "salary":      [".compensation__salary", ".jobs-unified-top-card__job-insight"],
        "job_type":    [".job-criteria__text--criteria", ".jobs-unified-top-card__job-insight span"],
        "date_posted": ["span.posted-time-ago__text", ".jobs-unified-top-card__posted-date"],
        "applicants":  [".num-applicants__caption", ".jobs-unified-top-card__applicant-count"],
        "apply_url":   ["a.apply-button", "a[data-control-name='jobdetails_topcard_inapply']"],
    },
    "indeed": {
        "description": ["#jobDescriptionText", "div[data-testid='jobsearch-jobDescriptionText']"],
        "title":       ["h1[data-testid='jobsearch-JobInfoHeader-title']", "h1.jobsearch-JobInfoHeader-title", "h1"],
        "company":     ["div[data-testid='inlineHeader-companyName'] a", "span[itemprop='hiringOrganization']"],
        "location":    ["div[data-testid='inlineHeader-companyLocation']", "div[data-testid='job-location']"],
        "salary":      ["div#salaryInfoAndJobType", "span[data-testid='attribute_snippet_testid']"],
        "job_type":    ["div[data-testid='attribute_snippet_testid']", "span[data-testid='jobsearch-jobTypes']"],
        "date_posted": ["span[data-testid='myJobsStateDate']", "div[class*='date' i]"],
        "applicants":  ["div[data-testid='jobsearch-applicants']"],
        "apply_url":   ["a#applyButtonLinkContainer", "a[data-testid='applyButton']"],
    },
    "reed": {
        "description": ["div[data-qa='job-description']", "div.description-pane", "div[itemprop='description']"],
        "title":       ["h1[data-qa='job-title']", "h1.job-title", "h1"],
        "company":     ["a[data-qa='recruiter-link']", "span[data-qa='recruiter-name']"],
        "location":    ["span[data-qa='job-location']", "li[data-qa='job-card-location']"],
        "salary":      ["span[data-qa='salary']", "li[data-qa='job-card-salary']"],
        "job_type":    ["li[data-qa='job-card-type']", "span[data-qa='job-type']"],
        "date_posted": ["span[data-qa='posted-date']", "time"],
        "applicants":  ["span[data-qa='applicants']"],
        "apply_url":   ["a[data-qa='apply-button']", "a[data-testid='apply']"],
    },
    "generic": {
        "description": ["div[class*='description' i]", "div[class*='job-detail' i]", "section[class*='description' i]", "div[itemprop='description']"],
        "title":       ["h1"],
        "company":     ["div[class*='company' i]", "span[class*='company' i]", "a[class*='company' i]"],
        "location":    ["div[class*='location' i]", "span[class*='location' i]"],
        "salary":      ["span[class*='salary' i]", "div[class*='salary' i]"],
        "job_type":    ["span[class*='job-type' i]", "div[class*='employment-type' i]"],
        "date_posted": ["time", "span[class*='date' i]"],
        "applicants":  [],
        "apply_url":   ["a[class*='apply' i]"],
    },
}


# ── Browser factory ────────────────────────────────────────────────────────────

# Persistent profile dir — keeps cookies/sessions between scraper runs
_PROFILE_DIR = os.path.join(
    os.path.dirname(__file__), "../../../agents/atlas/browser_profile"
)
os.makedirs(_PROFILE_DIR, exist_ok=True)

_STEALTH_INIT = """
// ── Navigator / webdriver ──────────────────────────────────────────────────
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

// ── Chrome runtime (expected by bot-detectors) ─────────────────────────────
window.chrome = {
    app: { isInstalled: false },
    runtime: {
        connect: () => {}, sendMessage: () => {},
        onMessage: { addListener: () => {} },
        id: undefined,
    },
    loadTimes: function() { return {}; },
    csi: function() { return {}; },
};

// ── Plugins / mimeTypes ────────────────────────────────────────────────────
const pluginData = [
    { name: 'Chrome PDF Plugin',       filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
    { name: 'Chrome PDF Viewer',       filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
    { name: 'Native Client',           filename: 'internal-nacl-plugin', description: '' },
];
Object.defineProperty(navigator, 'plugins', {
    get: () => {
        const arr = pluginData.map(p => Object.assign(Object.create(Plugin.prototype), p));
        Object.defineProperty(arr, 'item', { value: i => arr[i] });
        Object.defineProperty(arr, 'namedItem', { value: n => arr.find(p => p.name === n) || null });
        return arr;
    }
});
Object.defineProperty(navigator, 'mimeTypes', {
    get: () => {
        const arr = [{ type: 'application/pdf', suffixes: 'pdf', description: '', enabledPlugin: navigator.plugins[0] }];
        Object.defineProperty(arr, 'item', { value: i => arr[i] });
        Object.defineProperty(arr, 'namedItem', { value: n => arr.find(m => m.type === n) || null });
        return arr;
    }
});

// ── Languages / locale ─────────────────────────────────────────────────────
Object.defineProperty(navigator, 'languages', { get: () => ['en-GB', 'en-US', 'en'] });
Object.defineProperty(navigator, 'language',  { get: () => 'en-GB' });

// ── Hardware concurrency / device memory ───────────────────────────────────
Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
try { Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 }); } catch(_) {}

// ── Platform ───────────────────────────────────────────────────────────────
Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });

// ── Permissions ────────────────────────────────────────────────────────────
const _origPerms = window.navigator.permissions.query.bind(navigator.permissions);
window.navigator.permissions.query = (params) =>
    params.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission })
        : _origPerms(params);

// ── Canvas fingerprint noise ───────────────────────────────────────────────
const _origToDataURL = HTMLCanvasElement.prototype.toDataURL;
HTMLCanvasElement.prototype.toDataURL = function(type, ...args) {
    const ctx2d = this.getContext('2d');
    if (ctx2d) {
        const id = ctx2d.getImageData(0, 0, 1, 1);
        id.data[0] = (id.data[0] + 1) % 256;
        ctx2d.putImageData(id, 0, 0);
    }
    return _origToDataURL.call(this, type, ...args);
};

// ── WebGL vendor/renderer ──────────────────────────────────────────────────
const _origGetParam = WebGLRenderingContext.prototype.getParameter;
WebGLRenderingContext.prototype.getParameter = function(param) {
    if (param === 37445) return 'Intel Inc.';
    if (param === 37446) return 'Intel Iris OpenGL Engine';
    return _origGetParam.call(this, param);
};
"""

async def launch_stealth_browser(playwright):
    """Launch a persistent browser context with comprehensive stealth settings."""
    ua = random.choice(USER_AGENTS)
    width = random.choice([1280, 1366, 1440, 1920])
    height = random.choice([720, 768, 800, 900])

    ctx = await playwright.chromium.launch_persistent_context(
        _PROFILE_DIR,
        headless=True,
        args=[
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-blink-features=AutomationControlled",
            "--disable-features=IsolateOrigins,site-per-process",
            "--disable-dev-shm-usage",
            "--disable-accelerated-2d-canvas",
            "--no-first-run",
            "--no-zygote",
            "--lang=en-GB",
            "--disable-infobars",
            "--disable-notifications",
            "--ignore-certificate-errors",
        ],
        user_agent=ua,
        viewport={"width": width, "height": height},
        locale="en-GB",
        timezone_id="Europe/London",
        extra_http_headers={
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "en-GB,en;q=0.9,en-US;q=0.7",
            "Accept-Encoding": "gzip, deflate, br",
            "DNT": "1",
            "Upgrade-Insecure-Requests": "1",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "none",
            "Sec-Fetch-User": "?1",
        },
    )
    await ctx.add_init_script(_STEALTH_INIT)

    # Apply playwright-stealth if available (deeper CDP-level evasion)
    try:
        from playwright_stealth import stealth_async
        _stealth_fn = stealth_async
    except ImportError:
        _stealth_fn = None

    return ctx, _stealth_fn


# ── DOM helpers ────────────────────────────────────────────────────────────────

async def _first_text(el, selectors):
    for sel in selectors:
        try:
            child = await el.query_selector(sel)
            if child:
                txt = (await child.inner_text() or "").strip()
                if len(txt) > 1:
                    return txt
        except Exception:
            pass
    return ""


async def _first_attr(el, selectors, attr):
    for sel in selectors:
        try:
            child = await el.query_selector(sel)
            if child:
                val = (await child.get_attribute(attr) or "").strip()
                if val and not val.startswith("javascript"):
                    return val
        except Exception:
            pass
    return ""


def _resolve_url(href: str, site: str) -> str:
    if not href or href.startswith("javascript"):
        return ""
    if href.startswith("http"):
        return href
    bases = {
        "linkedin":  "https://www.linkedin.com",
        "indeed":    "https://uk.indeed.com",
        "reed":      "https://www.reed.co.uk",
        "glassdoor": "https://www.glassdoor.co.uk",
    }
    return bases.get(site, "") + href


def _extract_skills(text: str) -> str:
    """Pull skill keywords from a job description."""
    patterns = [
        r"\b(Python|JavaScript|TypeScript|Java|C\+\+|C#|Go|Rust|PHP|Ruby|Swift|Kotlin|Scala|R)\b",
        r"\b(React|Vue\.?js|Angular|Next\.?js|Node\.?js|Django|Flask|FastAPI|Spring|Laravel|\.NET)\b",
        r"\b(AWS|Azure|GCP|Google Cloud|Docker|Kubernetes|Terraform|Ansible|CI/CD|DevOps|Jenkins)\b",
        r"\b(SQL|PostgreSQL|MySQL|MongoDB|Redis|Elasticsearch|DynamoDB|Cassandra|BigQuery)\b",
        r"\b(Git|REST|GraphQL|gRPC|Microservices|Agile|Scrum|Kanban|TDD|BDD)\b",
        r"\b(customer service|cash handling|food safety|food hygiene|health and safety|teamwork|communication|leadership)\b",
        r"\b(management|budgeting|forecasting|planning|stakeholder|project management)\b",
        r"\b(Excel|PowerPoint|Word|Tableau|Power BI|Looker|Salesforce|HubSpot|SAP)\b",
    ]
    found = []
    for pat in patterns:
        matches = re.findall(pat, text, re.IGNORECASE)
        found.extend(m if isinstance(m, str) else m[0] for m in matches)
    return ", ".join(list(dict.fromkeys(found))[:18])  # Deduped, max 18


# ── Listing page: scan job cards ───────────────────────────────────────────────

async def scan_listing_page(page, site: str, query: str) -> list:
    """
    Find all job cards on the listing page.
    Returns list of dicts with basic card info + relevance score + element ref.
    Tries site-specific selectors first, then falls back to generic selectors.
    """
    # Try dynamic (Atlas-learned) selectors first, then site-specific, then generic
    selector_sets = []
    if site in DYNAMIC_SELECTORS:
        selector_sets.append(DYNAMIC_SELECTORS[site])
    if site in CARD_ROOT_SELS:
        selector_sets.append(CARD_ROOT_SELS[site])
    selector_sets.append(CARD_ROOT_SELS["generic"])
    # Extra broad fallback patterns
    selector_sets.append(["li[class]", "div[class*='result' i]", "div[class*='listing' i]", "div[class*='card' i]"])

    cards = []
    for sel_group in selector_sets:
        for sel in sel_group:
            try:
                found = await page.query_selector_all(sel)
                if len(found) >= 3:  # Need at least 3 matches to be a real list
                    cards = found
                    break
            except Exception:
                continue
        if cards:
            break

    if not cards:
        return []

    results = []
    for card in cards[:40]:  # Cap DOM inspection at 40 cards
        try:
            title    = await _first_text(card, CARD_TITLE_SELS)
            company  = await _first_text(card, CARD_COMPANY_SELS)
            location = await _first_text(card, CARD_LOCATION_SELS)
            salary   = await _first_text(card, CARD_SALARY_SELS)
            href     = await _first_attr(card, CARD_LINK_SELS, "href")
            url      = _resolve_url(href, site)

            if not title or len(title) < 3:
                continue

            score = score_relevance(title, company, query)
            results.append({
                "title":    title,
                "company":  company,
                "location": location,
                "salary":   salary,
                "url":      url,
                "score":    score,
                "_el":      card,  # Playwright element ref for mouse hover
            })
        except Exception:
            continue

    return results


# ── Detail page: full job extraction ──────────────────────────────────────────

async def scrape_detail_page(page, url: str, site: str) -> dict:
    """
    Navigate directly to a job detail page and extract all available fields.
    No human-like delays — we already have the URL from the listing scan.
    """
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=22000)

        sels = DETAIL_SELS.get(site, DETAIL_SELS["generic"])

        async def get_text_field(field_key):
            for sel in sels.get(field_key, []):
                try:
                    el = await page.query_selector(sel)
                    if el:
                        txt = (await el.inner_text() or "").strip()
                        if txt:
                            return txt
                except Exception:
                    pass
            return ""

        async def get_href_field(field_key):
            for sel in sels.get(field_key, []):
                try:
                    el = await page.query_selector(sel)
                    if el:
                        href = (await el.get_attribute("href") or "").strip()
                        if href and not href.startswith("javascript"):
                            return href if href.startswith("http") else url
                except Exception:
                    pass
            return ""

        description = await get_text_field("description")
        title       = await get_text_field("title")
        company     = await get_text_field("company")
        location    = await get_text_field("location")
        salary      = await get_text_field("salary")
        job_type    = await get_text_field("job_type")
        date_posted = await get_text_field("date_posted")
        applicants  = await get_text_field("applicants")
        apply_url   = await get_href_field("apply_url") or url

        if not title:
            title = (await page.title() or "").split("|")[0].split("-")[0].strip()

        return {
            "title":       title,
            "company":     company,
            "location":    location,
            "salary":      salary,
            "job_type":    job_type,
            "date_posted": date_posted,
            "applicants":  applicants,
            "apply_url":   apply_url,
            "description": description[:4000],
            "skills":      _extract_skills(description),
            "url":         url,
        }
    except Exception as exc:
        return {"title": "", "company": "", "location": "", "salary": "",
                "job_type": "", "date_posted": "", "applicants": "", "apply_url": url,
                "description": "", "skills": "", "url": url, "_error": str(exc)}


# ── Main crawl orchestrator ────────────────────────────────────────────────────

async def crawl_site(url: str, query: str) -> dict:
    site = detect_site(url)

    try:
        from playwright.async_api import async_playwright
    except ImportError:
        return {
            "success": False,
            "error": "playwright not installed. Run: pip install playwright && playwright install chromium",
        }

    async with async_playwright() as pw:
        ctx, stealth_fn = await launch_stealth_browser(pw)
        try:
            page = await ctx.new_page()
            if stealth_fn:
                await stealth_fn(page)

            # ── Step 1: Open listing page ──────────────────────────────────────
            await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            await asyncio.sleep(random.uniform(2.5, 5.0))

            # Extra wait for JS-heavy sites that render cards after initial load
            if site not in ("linkedin", "indeed"):
                await asyncio.sleep(random.uniform(2.0, 3.5))

            # Natural scroll to reveal lazy-loaded cards
            for _ in range(random.randint(3, 5)):
                await human_scroll(page)
                await asyncio.sleep(random.uniform(0.8, 1.8))

            # ── Step 2: Scan DOM for job cards ─────────────────────────────────
            all_cards = await scan_listing_page(page, site, query)

            # If still empty, wait more and retry once (some sites need full render)
            if not all_cards:
                await asyncio.sleep(3.0)
                await human_scroll(page)
                all_cards = await scan_listing_page(page, site, query)

            # If still empty, emit DOM sample so Atlas can self-heal selectors
            if not all_cards:
                dom_sample = await page.evaluate("() => document.body.innerHTML.slice(0, 4000)")
                return {
                    "success": False,
                    "error": f"No job cards found on {site}",
                    "site": site,
                    "dom_sample": dom_sample,
                }

            if not all_cards:
                return {"success": False, "error": f"No job cards found in DOM on {site}", "site": site}

            # Sort by relevance; take top candidates
            all_cards.sort(key=lambda x: x["score"], reverse=True)
            # Accept all cards if no query (score = 1.0), else take top 10
            candidates = all_cards[:10]

            # ── Step 3: For each candidate, hover card then visit detail page ──
            enriched = []
            for job in candidates:
                job_url = job.get("url", "")

                # Human-like: hover the card element before navigating
                try:
                    box = await job["_el"].bounding_box()
                    if box:
                        tx = box["x"] + box["width"] * random.uniform(0.25, 0.75)
                        ty = box["y"] + box["height"] * random.uniform(0.25, 0.75)
                        await human_click(page, tx, ty)
                        await asyncio.sleep(random.uniform(0.3, 0.8))
                except Exception:
                    pass

                if job_url and job_url.startswith("http"):
                    # Visit the actual job detail page
                    detail = await scrape_detail_page(page, job_url, site)
                    enriched_job = {
                        "title":       detail["title"] or job["title"],
                        "company":     detail["company"] or job["company"],
                        "location":    detail["location"] or job["location"],
                        "salary":      detail["salary"] or job["salary"],
                        "job_type":    detail.get("job_type", ""),
                        "date_posted": detail.get("date_posted", ""),
                        "applicants":  detail.get("applicants", ""),
                        "apply_url":   detail.get("apply_url", job_url),
                        "url":         job_url,
                        "source":      site.title(),
                        "description": detail["description"],
                        "skills":      detail["skills"],
                    }
                    # Re-score using full detail data (replaces coarse card score)
                    enriched_job["score"] = compute_final_score(enriched_job, query)
                    enriched.append(enriched_job)
                    # Natural pause between jobs — looks like human reading time
                    await asyncio.sleep(random.uniform(1.8, 4.0))
                else:
                    # No detail URL: score from card data only
                    card_job = {
                        "title":       job["title"],
                        "company":     job["company"],
                        "location":    job["location"],
                        "salary":      job["salary"],
                        "url":         job_url,
                        "source":      site.title(),
                        "description": "",
                        "skills":      "",
                    }
                    card_job["score"] = compute_final_score(card_job, query)
                    enriched.append(card_job)

            if not enriched:
                return {"success": False, "error": "DOM scan found cards but could not extract any details", "site": site}

            return {
                "success": True,
                "site":    site,
                "url":     url,
                "jobs":    enriched,
                "total":   len(enriched),
                "status_code": 200,
            }
        finally:
            await ctx.close()


# ── Entry point ────────────────────────────────────────────────────────────────

async def main():
    parser = argparse.ArgumentParser(description="Atlas human-like job scraper")
    parser.add_argument("--query", default="", help="Search query for relevance scoring")
    parser.add_argument("urls", nargs="*", help="Job board URLs to scrape")
    args = parser.parse_args()

    if not args.urls:
        print(json.dumps({"success": False, "error": "No URL provided"}))
        return

    query = args.query
    urls  = args.urls

    if len(urls) == 1:
        result = await crawl_site(urls[0], query)
        print(json.dumps(result))
        return

    # Multiple URLs: sequential with natural pause between sites
    all_jobs = []
    errors   = []
    for url in urls:
        r = await crawl_site(url, query)
        if r.get("success"):
            all_jobs.extend(r.get("jobs", []))
        else:
            errors.append({"url": url, "error": r.get("error", "Unknown error")})
        if url != urls[-1]:
            await asyncio.sleep(random.uniform(2.5, 6.0))  # Human pause between sites

    # Deduplicate by title + company
    seen, unique = set(), []
    for job in all_jobs:
        key = (job.get("title", "").lower(), job.get("company", "").lower())
        if key not in seen:
            seen.add(key)
            unique.append(job)

    print(json.dumps({
        "success":     len(unique) > 0,
        "jobs":        unique,
        "errors":      errors,
        "total":       len(unique),
        "status_code": 200 if unique else 404,
    }))


if __name__ == "__main__":
    asyncio.run(main())
