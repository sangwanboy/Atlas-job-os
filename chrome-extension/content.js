/**
 * Atlas Job OS — Content Script
 * Runs in the page context on every tab. When Atlas navigates the extension
 * to a job listing page, this script auto-scrapes the full description and
 * skills, then sends the result to the background service worker.
 * No executeScript needed — the DOM is directly accessible here.
 */

chrome.runtime.sendMessage({ type: "content_ready", url: window.location.href }).catch(() => {});

// ─── Job Listing Detection ────────────────────────────────────────────────────

function isJobListingPage(url) {
  if (!url) return false;
  // LinkedIn job detail
  if (/linkedin\.com\/jobs\/view\//.test(url)) return true;
  // Indeed job detail
  if (/indeed\.(com|co\.uk)\/viewjob/.test(url)) return true;
  if (/indeed\.(com|co\.uk)\/rc\/clk/.test(url)) return true;
  // Reed job detail: /jobs/[slug]/[numeric-id]
  if (/reed\.co\.uk\/jobs\/[^/?#]+\/\d+/.test(url)) return true;
  // TotalJobs job detail
  if (/totaljobs\.com\/job\//.test(url)) return true;
  // Adzuna job detail
  if (/adzuna\.(co\.uk|com)\/jobs\/(details|land)\//.test(url)) return true;
  // CV-Library job detail
  if (/cv-library\.co\.uk\/job\//.test(url)) return true;
  // Glassdoor job detail
  if (/glassdoor\.(com|co\.uk)\/(job-listing|partner\/jobListing)/.test(url)) return true;
  return false;
}

// ─── Scraper ──────────────────────────────────────────────────────────────────

function scrapeJobDetail() {
  const url = window.location.href;

  function getText(selectors) {
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        const t = el?.innerText?.trim();
        if (t && t.length > 1) return t;
      } catch {}
    }
    return "";
  }

  let title = "", company = "", location = "", salary = "", jobType = "", datePosted = "", description = "";

  // ── Title (generic — most sites have <h1>) ──
  title = getText(["h1.job-title", "h1.jobsearch-JobInfoHeader-title", "h1[class*='title']", "h1"]);

  if (url.includes("linkedin.com")) {
    title       = getText([".job-details-jobs-unified-top-card__job-title", ".jobs-unified-top-card__job-title h1", "h1.t-24"]) || title;
    company     = getText([".job-details-jobs-unified-top-card__company-name a", ".jobs-unified-top-card__company-name a", ".topcard__org-name-link"]);
    location    = getText([".job-details-jobs-unified-top-card__bullet", ".jobs-unified-top-card__bullet", ".topcard__flavor--bullet"]);
    salary      = getText([".jobs-unified-top-card__job-insight--salary span", ".compensation__salary"]);
    jobType     = getText([".jobs-unified-top-card__workplace-type", ".job-details-jobs-unified-top-card__workplace-type"]);
    datePosted  = getText([".jobs-unified-top-card__posted-date"]);
    description = getText([".jobs-description-content__text--stretch", ".jobs-description__content .jobs-box__html-content", "#job-details"]);

  } else if (url.includes("indeed.com") || url.includes("indeed.co.uk")) {
    title       = getText(["h1[data-testid='jobsearch-JobInfoHeader-title'] span", "h1.jobsearch-JobInfoHeader-title"]) || title;
    company     = getText(["[data-testid='inlineHeader-companyName'] a", ".jobsearch-CompanyInfoWithoutHeaderImage .companyName"]);
    location    = getText(["[data-testid='job-location']", ".jobsearch-JobInfoHeader-subtitle div"]);
    salary      = getText(["#salaryInfoAndJobType span", ".attribute_snippet", "[data-testid='attribute_snippet_testid']"]);
    jobType     = getText(["[data-testid='jobMetadataHeader-jobtype']"]);
    description = getText(["#jobDescriptionText", ".jobsearch-jobDescriptionText"]);

  } else if (url.includes("reed.co.uk")) {
    title       = getText(["[data-qa='job-title']", "h1.job-header__title", "h1[itemprop='title']", "h1"]) || title;
    const _postedBy = getText(["[data-qa='job-posted-by']"]);
    company = _postedBy ? _postedBy.replace(/^(today|yesterday|\d+\s+\w+\s+ago|just now|posted)[\s:,]+by\s+/i, "").trim() : getText(["[data-qa='company-name-link']", ".col-company-header h2 a", ".employer-name a", "span[itemprop='name']"]);
    location    = getText(["[data-qa='job-metadata-location']", "[data-qa='locationLabel']", ".job-header__location"]);
    salary      = getText(["[data-qa='job-metadata-salary']", "[data-qa='salaryLabel']", ".salary span", "[itemprop='baseSalary']"]);
    jobType     = getText(["[data-qa='job-metadata']"]).split(/\n|,/).find(s => /full.?time|part.?time|contract|temp|perm|freelance/i.test(s))?.trim() || getText(["[data-qa='jobTypeLabel']", ".contract-type"]);
    datePosted  = getText(["[data-qa='datePostedLabel']", ".date-posted"]);
    description = getText(["[data-qa='job-description']", "[itemprop='description']", "#job-description", ".description"]);

  } else if (url.includes("totaljobs.com")) {
    company     = getText(["[data-at='metadata-company-name']", ".job-header__company a"]);
    location    = getText(["[data-at='metadata-location']", ".job-header__location"]);
    salary      = getText(["[data-at='metadata-salary']", ".job-header__salary"]);
    jobType     = getText(["[data-at='metadata-work-type']"]);
    description = getText(["[data-at='section-text-jobDescription-content']", "[data-at='job-ad-content']", ".job-description"]);

  } else if (url.includes("adzuna")) {
    company     = getText(["[class*='CompanyName']", ".job-ad-display__company"]);
    location    = getText(["[class*='Location']", ".job-ad-display__location"]);
    salary      = getText(["[class*='Salary']", ".job-ad-display__salary"]);
    description = getText(["[class*='Description']", ".job-ad-display__body", "section.adp-body"]);

  } else if (url.includes("cv-library.co.uk")) {
    title       = getText(["h1.job__title", "h1"]) || title;
    company     = getText(["article a[href*='/list-jobs/']", "h2.search-filters__title"]);
    // Location/jobType/salary come from DT+DD pairs
    document.querySelectorAll("dt").forEach(dt => {
      const text = dt.innerText?.trim().toLowerCase();
      const dd = dt.nextElementSibling;
      if (!dd || dd.tagName !== "DD") return;
      const val = dd.innerText?.trim();
      if (text.includes("location") && !location) location = val;
      else if (text.includes("salary") && !salary) salary = val;
      else if (text.includes("type") && !jobType) jobType = val;
    });
    description = getText([".job__description", "#job-description", ".job-description__content"]);

  } else if (url.includes("glassdoor.com")) {
    company     = getText(["[data-test='employer-name']", ".EmployerProfile_compactEmployerName__9MGcV"]);
    location    = getText(["[data-test='emp-location']"]);
    salary      = getText(["[data-test='salary-estimate']", "[class*='SalaryEstimate']"]);
    description = getText(["[class*='JobDetails_jobDescription']", "[data-test='jobDescription']"]);

  } else {
    company     = getText(["[class*='company']", "[class*='employer']"]);
    location    = getText(["[class*='location']", "[class*='city']"]);
    salary      = getText(["[class*='salary']", "[class*='compensation']"]);
    description = getText(["[class*='description']", "[id*='description']", "article", "main"]);
  }

  // Cap description at 8000 chars (full detail for LLM cleaning)
  if (description.length > 8000) description = description.slice(0, 8000) + "…";

  // Fallback: extract structured fields from description text when DOM selectors miss them
  if (description) {
    if (!salary) {
      // "Pay: From £12.71 per hour" or "Salary: £25,000 - £30,000 per annum"
      const m = description.match(/(?:pay|salary|wage|compensation|rate)[:\s]+(?:from\s+)?(?:£|GBP)\s*[\d,]+(?:\.\d{2})?(?:\s*[-–to]+\s*(?:£|GBP)?\s*[\d,]+(?:\.\d{2})?)?(?:\s*(?:per|p\.?|\/)\s*(?:hour|annum|year|day|week|month|pa|hr))?/i)
        || description.match(/(?:£|GBP)\s*[\d,]+(?:\.\d{2})?(?:\s*[-–to]+\s*(?:£|GBP)?\s*[\d,]+(?:\.\d{2})?)?(?:\s*(?:per|p\.?|\/)\s*(?:hour|annum|year|day|week|month|pa|hr))/i)
        || description.match(/[\d,]+(?:\.\d{2})?\s*(?:per|p\.?|\/)\s*(?:hour|annum|year|day|week|month)/i);
      if (m) {
        // Clean the label prefix for display
        salary = m[0].replace(/^(?:pay|salary|wage|compensation|rate)[:\s]+/i, "").trim();
      }
    }
    if (!jobType) {
      // "Job Types: Full-time, Part-time" or just "Full-time" in text
      const labelled = description.match(/(?:job\s*type|contract\s*type|employment\s*type)s?[:\s]+([^\n.]{3,40})/i);
      if (labelled) {
        jobType = labelled[1].trim();
      } else {
        const m = description.match(/\b(full[- ]?time|part[- ]?time|contract|temporary|permanent|freelance|internship|apprenticeship|fixed[- ]?term|zero[- ]?hours|casual)\b/i);
        if (m) jobType = m[0].trim();
      }
    }
    if (!datePosted) {
      const m = description.match(/(?:posted|published|listed|date)[:\s]*(\d{1,2}[\s/.-]\w{3,9}[\s/.-]\d{2,4})/i)
        || description.match(/(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})/i);
      if (m) datePosted = (m[1] || m[0]).trim();
    }
    if (!company) {
      const m = description.match(/(?:company|employer|organisation|organization)[:\s]+([A-Z][\w\s&.,'-]{2,40})/i);
      if (m) company = m[1].trim();
    }
    if (!location) {
      const m = description.match(/(?:location|based in|office in|work location)[:\s]+([A-Z][\w\s,'-]{2,40})/i);
      if (m) location = m[1].trim();
    }
  }

  const skills = extractSkillsFromText(description);

  return { title, company, location, salary, jobType, datePosted, description, skills, url };
}

// ─── Skills Extractor ────────────────────────────────────────────────────────

function extractSkillsFromText(text) {
  if (!text || text.length < 20) return [];
  const SKILL_PATTERNS = [
    // Tech: languages, frameworks, cloud, databases, ML, tools
    /\b(JavaScript|TypeScript|Python|Java|C\+\+|C#|Go|Rust|Ruby|PHP|Swift|Kotlin|Scala|MATLAB)\b/gi,
    /\b(React|Next\.?js|Vue\.?js|Angular|Node\.?js|Express|Django|Flask|FastAPI|Spring|Laravel|\.NET|Rails|Svelte|Nuxt)\b/gi,
    /\b(AWS|Azure|GCP|Docker|Kubernetes|Terraform|Ansible|Jenkins|GitHub Actions|Vercel|Heroku)\b/gi,
    /\b(PostgreSQL|MySQL|MongoDB|Redis|Elasticsearch|DynamoDB|SQLite|Cassandra|Supabase|Prisma)\b/gi,
    /\b(TensorFlow|PyTorch|scikit-learn|Pandas|NumPy|Spark|Kafka|Airflow|dbt|Tableau|Power BI)\b/gi,
    /\b(Git|GraphQL|REST|API|Agile|Scrum|TDD|microservices|DevOps|Linux|Bash|SQL)\b/gi,
    // General professional skills
    /\b(communication|teamwork|leadership|problem[- ]solving|time management|customer service|project management|negotiation|presentation|critical thinking)\b/gi,
    // Business & operations
    /\b(Excel|Microsoft Office|Word|PowerPoint|Salesforce|SAP|CRM|ERP|JIRA|Confluence|Slack|Figma|Photoshop|AutoCAD|Revit)\b/gi,
    // Finance, healthcare, hospitality, trades
    /\b(food safety|food hygiene|HACCP|health and safety|first aid|manual handling|DBS|CRB|COSHH|risk assessment|infection control)\b/gi,
    /\b(accounting|bookkeeping|payroll|budgeting|forecasting|audit|compliance|GDPR|data protection|procurement)\b/gi,
    /\b(nursing|care planning|safeguarding|medication|clinical|physiotherapy|counselling|social work|teaching|tutoring)\b/gi,
    /\b(driving licence|forklift|CSCS|SMSTS|SSSTS|NVQ|HNC|HND|degree|certification|diploma|apprenticeship)\b/gi,
  ];
  const found = new Set();
  for (const pattern of SKILL_PATTERNS) {
    for (const m of text.matchAll(pattern)) found.add(m[0].trim());
  }
  return [...found].slice(0, 25);
}

// ─── Show More / Expand Button Clicker ───────────────────────────────────────

async function clickExpandButtons() {
  const url = window.location.href;

  // Site-specific expand selectors (highest priority)
  const siteSelectors = [];
  if (url.includes("linkedin.com")) {
    siteSelectors.push(
      "button.jobs-description__footer-button",
      ".jobs-description__footer button",
      "button[aria-label*='more']",
      "button[aria-label*='Show more']",
    );
  } else if (url.includes("indeed.com") || url.includes("indeed.co.uk")) {
    siteSelectors.push(
      "#descriptionToggle",
      "button[data-testid='jobsearch-ShowMoreText-button']",
      "button[data-testid*='show-more']",
    );
  } else if (url.includes("glassdoor.com")) {
    siteSelectors.push(
      "button[data-test='job-description-toggle']",
      "[class*='showMore'] button",
      "[class*='JobDetails_showMore'] button",
    );
  } else if (url.includes("reed.co.uk")) {
    siteSelectors.push(".btn-show-more", "button.expand-description");
  } else if (url.includes("totaljobs.com")) {
    siteSelectors.push(
      "[data-at='job-description-toggle']",
      "button[class*='expand']",
    );
  }

  // Generic text-based selectors as fallback
  const genericSelectors = [
    "button[class*='show-more']",
    "button[class*='showMore']",
    "button[class*='see-more']",
    "button[class*='seeMore']",
    "button[class*='read-more']",
    "button[class*='readMore']",
    "a[class*='show-more']",
    "[data-testid*='show-more']",
    "[data-testid*='expand']",
  ];

  let clicked = false;

  // Try site-specific first
  for (const sel of [...siteSelectors, ...genericSelectors]) {
    try {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) {
        el.click();
        clicked = true;
      }
    } catch {}
  }

  // Text-based scan as final fallback
  if (!clicked) {
    const textPatterns = ["show more", "see more", "read more", "view more", "show full description", "expand"];
    const candidates = document.querySelectorAll("button, a[role='button'], span[role='button'], [tabindex='0']");
    for (const el of candidates) {
      const text = el.innerText?.toLowerCase().trim();
      if (text && textPatterns.some(p => text === p || text.startsWith(p + " "))) {
        if (el.offsetParent !== null) {
          el.click();
          clicked = true;
          break;
        }
      }
    }
  }

  if (clicked) {
    // Wait for DOM to update after expand animation
    await new Promise(r => setTimeout(r, 900));
  }

  return clicked;
}

// ─── Auto-Scrape on Job Listing Pages ────────────────────────────────────────

if (isJobListingPage(window.location.href)) {
  // Wait for JS-rendered content, click expand buttons, then scrape
  const doScrape = async () => {
    try {
      await clickExpandButtons();
      const data = scrapeJobDetail();
      chrome.runtime.sendMessage({
        type: "job_detail_scraped",
        url: window.location.href,
        data,
      }).catch(() => {});
    } catch (e) {
      // Silently ignore — page may not be ready
    }
  };

  if (document.readyState === "complete" || document.readyState === "interactive") {
    setTimeout(doScrape, 1200); // wait for JS-rendered content
  } else {
    window.addEventListener("load", () => setTimeout(doScrape, 1200));
  }
}
