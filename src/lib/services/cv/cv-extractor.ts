/**
 * CV Extractor Service
 *
 * Extracts plain text from uploaded CV files using the best available method:
 * - PDF, DOCX, images → Gemini API (inline_data, handles all formats natively)
 * - DOCX fallback → mammoth
 * - DOC → raw ASCII extraction
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { env } from "@/lib/config/env";

export type ExtractionResult = {
  text: string;
  method: string;
  charCount: number;
};

// MIME type map
function getMimeType(ext: string): string {
  const m: Record<string, string> = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".doc": "application/msword",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
  };
  return m[ext] ?? "application/octet-stream";
}

// Use Gemini's multimodal API to extract text from any file (PDF, DOCX, images)
async function extractViaGemini(filePath: string, ext: string): Promise<ExtractionResult> {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const fileBytes = await fs.readFile(filePath);
  const base64 = fileBytes.toString("base64");
  const mimeType = getMimeType(ext);

  const model = "gemini-2.5-flash";
  const body = {
    contents: [
      {
        parts: [
          {
            inline_data: {
              mime_type: mimeType,
              data: base64,
            },
          },
          {
            text: `Extract ALL text content from this CV/resume document. Return ONLY the raw text, preserving structure (sections, bullet points, dates). Do not add commentary. If it is an image, OCR and transcribe every piece of text you can see.`,
          },
        ],
      },
    ],
    generationConfig: { temperature: 0.1 },
  };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini extraction failed (${response.status}): ${errText.slice(0, 200)}`);
  }

  const json = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? "";

  if (!text) throw new Error("Gemini returned empty text");
  return { text, method: "gemini-multimodal", charCount: text.length };
}

// DOCX fallback using mammoth
async function extractDocxViaMammoth(filePath: string): Promise<ExtractionResult> {
  // Dynamic import to avoid build issues if mammoth not installed
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ path: filePath });
  const text = result.value.trim();
  if (!text) throw new Error("mammoth returned empty text");
  return { text, method: "mammoth", charCount: text.length };
}

// ASCII fallback for any format (last resort)
async function extractAsciiText(filePath: string): Promise<ExtractionResult> {
  const buf = await fs.readFile(filePath);
  // Extract readable ASCII runs of length >= 4
  const text = buf
    .toString("binary")
    .match(/[\x20-\x7E\t\n\r]{4,}/g)
    ?.join("\n")
    .trim() ?? "";
  if (text.length < 20) throw new Error("ASCII extraction yielded insufficient text");
  return { text, method: "ascii-fallback", charCount: text.length };
}

export class CvExtractor {
  static async extract(filePath: string, ext: string): Promise<ExtractionResult> {
    const errors: string[] = [];

    // Primary: Gemini multimodal (handles PDF, images, DOCX natively)
    // Gemini supports: PDFs, images, text. For DOCX we fallback to mammoth since Gemini doesn't handle binary DOCX as reliably.
    const isImage = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"].includes(ext);
    const isPdf = ext === ".pdf";
    const isDocx = ext === ".docx";
    const isDoc = ext === ".doc";

    if (isPdf || isImage) {
      try {
        return await extractViaGemini(filePath, ext);
      } catch (e) {
        errors.push(`Gemini: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    if (isDocx) {
      // Try mammoth first for DOCX (fastest and most accurate)
      try {
        return await extractDocxViaMammoth(filePath);
      } catch (e) {
        errors.push(`mammoth: ${e instanceof Error ? e.message : String(e)}`);
      }
      // Then try Gemini Vision on DOCX as base64
      try {
        return await extractViaGemini(filePath, ext);
      } catch (e) {
        errors.push(`Gemini DOCX: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    if (isDoc) {
      try {
        return await extractViaGemini(filePath, ext);
      } catch (e) {
        errors.push(`Gemini DOC: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Last resort ASCII extraction
    try {
      return await extractAsciiText(filePath);
    } catch (e) {
      errors.push(`ascii: ${e instanceof Error ? e.message : String(e)}`);
    }

    throw new Error(`CV extraction failed for ${path.basename(filePath)}. Tried: ${errors.join("; ")}`);
  }
}
