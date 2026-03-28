/**
 * CV Extractor Service
 *
 * Extracts plain text from uploaded CV files using the best available method:
 * - PDF → pdf-parse (primary, local, always works) → Gemini Vision (fallback)
 * - DOCX → mammoth (primary) → Gemini Vision (fallback)
 * - DOC → Gemini Vision → ASCII fallback
 * - Images → Gemini Vision (OCR)
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { callVertexMultimodal } from "@/lib/services/ai/vertex-client";

export type ExtractionResult = {
  text: string;
  method: string;
  charCount: number;
};

const MIME_TYPES: Record<string, string> = {
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

// Use Vertex AI multimodal to extract text from PDF/images (no API key needed)
async function extractViaVertexVision(filePath: string, ext: string): Promise<ExtractionResult> {
  const fileBytes = await fs.readFile(filePath);
  const base64 = fileBytes.toString("base64");
  const mimeType = MIME_TYPES[ext] ?? "application/octet-stream";

  const result = await callVertexMultimodal({
    parts: [
      { inline_data: { mime_type: mimeType, data: base64 } },
      { text: "Extract ALL text content from this CV/resume document. Return ONLY the raw text, preserving structure (sections, bullet points, dates). Do not add commentary. If it is an image, OCR every piece of text visible." },
    ],
    temperature: 0.1,
  });

  if (!result.ok || !result.text) throw new Error(result.error ?? "Vertex Vision returned empty text");
  return { text: result.text, method: "vertex-vision", charCount: result.text.length };
}

// PDF extraction using pdf-parse (local, no API key needed)
async function extractPdfViaPdfParse(filePath: string): Promise<ExtractionResult> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string; numpages: number }>;
  const buffer = await fs.readFile(filePath);
  const data = await pdfParse(buffer);
  const text = data.text.trim();
  if (!text || text.length < 30) throw new Error(`pdf-parse extracted insufficient text (${text.length} chars)`);
  return { text, method: "pdf-parse", charCount: text.length };
}

// DOCX extraction using mammoth
async function extractDocxViaMammoth(filePath: string): Promise<ExtractionResult> {
  // Dynamic import to avoid build issues if mammoth not installed
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ path: filePath });
  const text = result.value.trim();
  if (!text) throw new Error("mammoth returned empty text");
  return { text, method: "mammoth", charCount: text.length };
}

// ASCII fallback for any format (last resort — filters PDF/binary structure)
async function extractAsciiText(filePath: string): Promise<ExtractionResult> {
  const buf = await fs.readFile(filePath);
  // Extract readable ASCII runs of length >= 4, then filter out PDF structural lines
  const runs = buf.toString("binary").match(/[\x20-\x7E\t\n\r]{4,}/g) ?? [];
  const filtered = runs.filter((line) => {
    // Skip PDF object syntax, binary header markers, font/encoding definitions
    return !/^(%PDF|%%EOF|obj$|endobj|stream|endstream|\d+ \d+ R|<<|>>|\/\w+)/.test(line.trim());
  });
  const text = filtered.join("\n").trim();
  if (text.length < 50) throw new Error(`ASCII extraction yielded insufficient readable text (${text.length} chars) — file may be corrupt or scanned-only`);
  return { text, method: "ascii-fallback", charCount: text.length };
}

export class CvExtractor {
  static async extract(filePath: string, ext: string): Promise<ExtractionResult> {
    const errors: string[] = [];

    const isImage = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"].includes(ext);
    const isPdf = ext === ".pdf";
    const isDocx = ext === ".docx";
    const isDoc = ext === ".doc";

    if (isPdf) {
      // 1. pdf-parse — local, no API, works for text-based PDFs
      try {
        return await extractPdfViaPdfParse(filePath);
      } catch (e) {
        errors.push(`pdf-parse: ${e instanceof Error ? e.message : String(e)}`);
      }
      // 2. Vertex Vision — for scanned/image PDFs or corrupt text layer
      try {
        return await extractViaVertexVision(filePath, ext);
      } catch (e) {
        errors.push(`vertex-vision PDF: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    if (isImage) {
      try {
        return await extractViaVertexVision(filePath, ext);
      } catch (e) {
        errors.push(`vertex-vision OCR: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    if (isDocx) {
      try {
        return await extractDocxViaMammoth(filePath);
      } catch (e) {
        errors.push(`mammoth: ${e instanceof Error ? e.message : String(e)}`);
      }
      try {
        return await extractViaVertexVision(filePath, ext);
      } catch (e) {
        errors.push(`vertex-vision DOCX: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    if (isDoc) {
      try {
        return await extractViaVertexVision(filePath, ext);
      } catch (e) {
        errors.push(`vertex-vision DOC: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Last resort: ASCII run extraction (filters out binary noise)
    try {
      return await extractAsciiText(filePath);
    } catch (e) {
      errors.push(`ascii: ${e instanceof Error ? e.message : String(e)}`);
    }

    throw new Error(`CV extraction failed for ${path.basename(filePath)}. Tried: ${errors.join("; ")}`);
  }
}
