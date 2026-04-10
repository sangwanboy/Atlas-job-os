import { callVertexMultimodal } from "@/lib/services/ai/vertex-client";

export type OcrJobListing = {
  title: string;
  company: string;
  location: string;
  salary?: string;
  jobType?: string;
  datePosted?: string;
  description?: string;
  requirements?: string;
  url?: string;
};

/**
 * Send raw scraped text from a job listing page to Vertex AI for cleanup.
 * Removes noise (nav text, cookie banners, etc.), fills missing fields from
 * description text, and returns a fully-structured job object.
 */
export async function extractJobFromText(
  raw: {
    title?: string;
    company?: string;
    location?: string;
    salary?: string;
    jobType?: string;
    datePosted?: string;
    description?: string;
  },
  pageUrl: string,
): Promise<OcrJobListing | null> {
  if (!raw.description || raw.description.length < 30) return null;

  const prompt = `You are a job listing data extractor. Below is raw text scraped from a job listing page at ${pageUrl}.
The text may contain noise (navigation, cookie banners, footers, ads). Extract only the job-relevant information.

Already-extracted partial fields (may be empty or wrong — verify and correct from the description):
- title: ${raw.title || "(not found)"}
- company: ${raw.company || "(not found)"}
- location: ${raw.location || "(not found)"}
- salary: ${raw.salary || "(not found)"}
- jobType: ${raw.jobType || "(not found)"}
- datePosted: ${raw.datePosted || "(not found)"}

Full scraped description text:
${raw.description.slice(0, 6000)}

Return a single JSON object with these fields (no markdown, no explanation):
{
  "title": "job title",
  "company": "company name",
  "location": "city / remote / hybrid / on-site",
  "salary": "salary range or null",
  "jobType": "full-time / part-time / contract / internship or null",
  "datePosted": "date posted or null",
  "description": "clean job description — responsibilities + requirements only, max 1200 chars, no noise",
  "requirements": "key skills and requirements as a comma-separated string"
}
Return ONLY valid JSON.`;

  const result = await callVertexMultimodal({
    parts: [{ text: prompt }],
    responseMimeType: "application/json",
    temperature: 0.1,
  });

  if (!result.ok || !result.text) {
    console.warn("[LLM Text] Extraction failed:", result.error);
    return null;
  }

  try {
    const parsed = JSON.parse(result.text) as OcrJobListing;
    parsed.url = pageUrl;
    return parsed;
  } catch (e) {
    console.warn("[LLM Text] Failed to parse JSON response:", result.text?.slice(0, 200));
    return null;
  }
}

/**
 * Send a full-page screenshot of a job listing to Vertex AI for OCR extraction.
 * Returns structured job data — no DOM parsing, no Scrapling.
 */
export async function extractJobFromScreenshot(
  screenshotBase64: string,
  pageUrl: string,
): Promise<OcrJobListing | null> {
  const result = await callVertexMultimodal({
    parts: [
      { inline_data: { mime_type: "image/png", data: screenshotBase64 } },
      {
        text: `This is a screenshot of a job listing page at ${pageUrl}.
Extract the following fields from the page and return a single JSON object (no markdown, no explanation):
{
  "title": "job title",
  "company": "company name",
  "location": "city / remote / hybrid",
  "salary": "salary range if visible, else null",
  "jobType": "full-time / part-time / contract / internship, else null",
  "datePosted": "date posted if visible, else null",
  "description": "full job description text (max 1500 chars)",
  "requirements": "key requirements / skills as comma-separated string"
}
Return ONLY valid JSON. No markdown fences.`,
      },
    ],
    responseMimeType: "application/json",
    temperature: 0.1,
  });

  if (!result.ok || !result.text) {
    console.warn("[LLM OCR] Extraction failed:", result.error);
    return null;
  }

  try {
    const parsed = JSON.parse(result.text) as OcrJobListing;
    parsed.url = pageUrl;
    return parsed;
  } catch (e) {
    console.warn("[LLM OCR] Failed to parse JSON response:", result.text?.slice(0, 200));
    return null;
  }
}
