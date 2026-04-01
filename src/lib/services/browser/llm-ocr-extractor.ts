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
