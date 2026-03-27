import { NextResponse } from "next/server";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const CV_DIR = path.join(process.cwd(), "uploads", "cv");

// POST /api/cv/process?name=filename — Manually re-process a CV file
export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const name = searchParams.get("name");

    if (!name) {
      return NextResponse.json({ error: "Missing ?name parameter" }, { status: 400 });
    }

    const safe = path.basename(name);
    const filePath = path.join(CV_DIR, safe);

    if (!filePath.startsWith(CV_DIR)) {
      return NextResponse.json({ error: "Invalid file name" }, { status: 400 });
    }

    try {
      await fs.access(filePath);
    } catch {
      return NextResponse.json({ error: `File not found: ${safe}` }, { status: 404 });
    }

    const ext = path.extname(safe).toLowerCase();

    const { CvExtractor } = await import("@/lib/services/cv/cv-extractor");
    const { CvProfileGenerator } = await import("@/lib/services/cv/cv-profile-generator");

    const extraction = await CvExtractor.extract(filePath, ext);

    if (extraction.text.length < 30) {
      return NextResponse.json({
        success: false,
        error: `Extracted text too short (${extraction.charCount} chars). Try a different file.`,
      }, { status: 422 });
    }

    const result = await CvProfileGenerator.generateAndSave(extraction.text, safe);

    return NextResponse.json({
      success: result.success,
      profileSummary: result.profileSummary,
      upgradeTips: result.upgradeTips,
      method: result.method,
      charCount: extraction.charCount,
      extractionMethod: extraction.method,
    });
  } catch (err) {
    console.error("[CV Process API] Error:", err);
    const message = err instanceof Error ? err.message : "Processing failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// GET /api/cv/process/status — Check if a user profile exists and when it was last updated
export async function GET() {
  try {
    const { atlasState, ATLAS_FILES } = await import("@/lib/services/agent/atlas-state-manager");
    const profile = await atlasState.readText(ATLAS_FILES.userProfile, "");
    const summary = await atlasState.readText(ATLAS_FILES.cvSummary, "");

    const hasProfile = profile.length > 100;
    const lastUpdatedMatch = profile.match(/Profile last updated from CV: .+ at (.+)\*/);
    const lastUpdated = lastUpdatedMatch?.[1] ?? null;

    return NextResponse.json({
      hasProfile,
      lastUpdated,
      profileLength: profile.length,
      hasSummary: summary.length > 0,
      profilePreview: hasProfile ? profile.slice(0, 300) + "…" : null,
    });
  } catch {
    return NextResponse.json({ hasProfile: false, lastUpdated: null });
  }
}
