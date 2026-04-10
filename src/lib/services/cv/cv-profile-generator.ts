/**
 * CV Profile Generator
 *
 * Uses Gemini to analyze extracted CV text and produce a structured user profile.
 * Writes the profile to agents/atlas/user_profile.md and cv_summary.md.
 */

import { callVertexMultimodal } from "@/lib/services/ai/vertex-client";
import { atlasState, ATLAS_FILES } from "@/lib/services/agent/atlas-state-manager";
import { continuitySyncService } from "@/lib/services/agent/continuity-sync-service";

export type ProfileGenerationResult = {
  success: boolean;
  profileSummary: string; // 2-3 sentence summary for UI display
  upgradeTips: string[];
  method: string;
};

const PROFILE_SYSTEM_PROMPT = `You are an expert career coach and CV analyst. Your task is to read a CV/resume and extract structured information to build a user profile that will be used by an AI job-search assistant named Atlas.

CRITICAL EXTRACTION RULES:
- Extract EVERY named tool, software, or technology mentioned anywhere in the CV into technicalSkills — including design tools (Adobe InDesign, Photoshop, Illustrator, After Effects, Premiere, Figma, Sketch, XD, Canva, etc.), office tools (Excel, Word, PowerPoint), coding languages, frameworks, databases, cloud platforms, and any other software.
- Do NOT omit tools just because they seem non-technical. A Graphic Designer's Adobe InDesign is as important as a Developer's Python.
- Scan the ENTIRE CV text — skills may appear in the Skills section, job descriptions, project summaries, or any other section.

Output a SINGLE JSON object with this exact structure (no markdown fences, just raw JSON):
{
  "name": "Full name of candidate",
  "email": "email@example.com or empty string if not found",
  "phone": "+44 1234 567890 or empty string if not found",
  "linkedIn": "linkedin.com/in/username or empty string if not found",
  "currentRole": "Current or most recent job title",
  "targetRoles": ["role 1", "role 2"],
  "yearsExperience": 5,
  "technicalSkills": ["skill1", "skill2", "skill3"],
  "softSkills": ["skill1", "skill2"],
  "education": "Highest qualification and institution",
  "educationEntries": [
    {
      "qualification": "MSc Engineering Business Management",
      "institution": "University of Warwick",
      "startYear": "2025",
      "endYear": "2026",
      "grade": "Distinction / First Class / 2:1 or empty if not stated"
    }
  ],
  "certifications": ["cert1", "cert2"],
  "preferredLocations": ["London", "Remote"],
  "preferredIndustries": ["Software", "FinTech"],
  "salaryExpectation": "£50-65k",
  "workPreference": "Remote / Hybrid / Onsite",
  "languagesSpoken": ["English", "Hindi"],
  "summary": "2-3 sentence summary of the candidate",
  "workExperience": [
    {
      "title": "Job Title",
      "company": "Company Name",
      "location": "City, Country",
      "startDate": "MMM YYYY",
      "endDate": "Present or MMM YYYY",
      "bullets": ["Achievement or responsibility with quantified impact where possible"]
    }
  ],
  "projects": [
    {
      "name": "Project Name",
      "description": "One-line summary of what it does",
      "technologies": ["Tech1", "Tech2"],
      "url": ""
    }
  ],
  "cvQualityScore": 7,
  "upgradeTips": [
    "Add quantified achievements (e.g., 'Reduced load time by 40%')",
    "Include a dedicated Skills section at the top",
    "Add relevant certifications (e.g., AWS, PMP)"
  ],
  "profileMarkdown": "# User Profile: [Name]\\n\\n## Overview\\n...full markdown profile..."
}

The profileMarkdown field must be a complete, well-structured markdown profile that Atlas will use as context. Include all sections.`;

async function generateProfileViaVertex(cvText: string): Promise<string> {
  const result = await callVertexMultimodal({
    parts: [
      { text: `${PROFILE_SYSTEM_PROMPT}\n\nHere is the CV text to analyze:\n\n---\n${cvText.slice(0, 15000)}\n---` },
    ],
    temperature: 0.2,
    responseMimeType: "application/json",
  });

  if (!result.ok || !result.text) throw new Error(result.error ?? "Vertex AI returned empty profile");
  return result.text;
}

export class CvProfileGenerator {
  static async generateAndSave(cvText: string, fileName: string, userId?: string): Promise<ProfileGenerationResult> {
    try {
      const rawJson = await generateProfileViaVertex(cvText);

      // Parse JSON output from Gemini
      let parsed: Record<string, unknown>;
      try {
        // Strip any residual markdown fences
        const clean = rawJson.replace(/^```json?\s*/i, "").replace(/```\s*$/, "").trim();
        parsed = JSON.parse(clean) as Record<string, unknown>;
      } catch {
        // Gemini may return partial JSON — try to extract what we can
        parsed = {
          name: "User",
          summary: cvText.slice(0, 200),
          profileMarkdown: `# User Profile\n\n${cvText.slice(0, 500)}`,
          upgradeTips: [],
        };
      }

      const profileMarkdown = (parsed.profileMarkdown as string) || buildFallbackMarkdown(parsed);
      const upgradeTips = (parsed.upgradeTips as string[]) || [];
      const summary = (parsed.summary as string) || "Profile extracted from uploaded CV.";

      // Write structured profile to user_profile.md (per-user if userId provided)
      const timestampedProfile = `${profileMarkdown}\n\n---\n*Profile last updated from CV: ${fileName} at ${new Date().toISOString()}*\n`;
      if (userId) {
        await atlasState.writeUserText(userId, ATLAS_FILES.userProfile, timestampedProfile);
      } else {
        await atlasState.writeText(ATLAS_FILES.userProfile, timestampedProfile);
      }

      // Also persist structured JSON for fast CV-match scoring (no markdown parsing needed)
      if (userId) {
        await atlasState.writeUserJson(userId, "user_profile.json", parsed);
      } else {
        await atlasState.writeJson("user_profile.json", parsed);
      }

      // Write CV upgrade tips + summary to cv_summary.md (per-user if userId provided)
      const cvSummaryMd = buildCvSummaryMarkdown(parsed, upgradeTips, fileName);
      if (userId) {
        await atlasState.writeUserText(userId, ATLAS_FILES.cvSummary, cvSummaryMd);
      } else {
        await atlasState.writeText(ATLAS_FILES.cvSummary, cvSummaryMd);
      }

      // Log to context memory (per-user)
      await continuitySyncService.logContextMemory(
        `CV profile updated from file: ${fileName}. Name: ${parsed.name || "Unknown"}. Skills: ${
          Array.isArray(parsed.technicalSkills) ? (parsed.technicalSkills as string[]).slice(0, 5).join(", ") : "N/A"
        }`,
        userId,
      );

      return {
        success: true,
        profileSummary: summary,
        upgradeTips,
        method: "gemini",
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[CvProfileGenerator] Error:", message);

      // Fallback: write a minimal stub — do NOT dump raw CV text which may be binary garbage
      try {
        const fallbackProfile = `# User Profile\n\n*Profile extraction failed for ${fileName}. Please re-process the file once Vertex AI is available.*\n\nError: ${message}`;
        if (userId) {
          await atlasState.writeUserText(userId, ATLAS_FILES.userProfile, fallbackProfile);
        } else {
          await atlasState.writeText(ATLAS_FILES.userProfile, fallbackProfile);
        }
        await continuitySyncService.logContextMemory(`CV profile (fallback) saved from: ${fileName}`, userId);
      } catch (writeErr) {
        console.error("[CvProfileGenerator] Fallback write also failed:", writeErr instanceof Error ? writeErr.message : String(writeErr));
      }

      return {
        success: false,
        profileSummary: "Profile saved (basic extraction — Gemini analysis unavailable).",
        upgradeTips: [],
        method: "fallback",
      };
    }
  }
}

function buildFallbackMarkdown(parsed: Record<string, unknown>): string {
  return [
    `# User Profile: ${parsed.name ?? "Candidate"}`,
    "",
    `## Overview`,
    parsed.summary ?? "Profile extracted from CV.",
    "",
    `## Current Role`,
    parsed.currentRole ?? "Not specified",
    "",
    `## Technical Skills`,
    Array.isArray(parsed.technicalSkills)
      ? (parsed.technicalSkills as string[]).map((s) => `- ${s}`).join("\n")
      : "Not specified",
    "",
    `## Education`,
    parsed.education ?? "Not specified",
    "",
    `## Preferred Locations`,
    Array.isArray(parsed.preferredLocations)
      ? (parsed.preferredLocations as string[]).join(", ")
      : "Not specified",
  ].join("\n");
}

function buildCvSummaryMarkdown(
  parsed: Record<string, unknown>,
  upgradeTips: string[],
  fileName: string,
): string {
  return [
    `# CV Analysis: ${parsed.name ?? "Candidate"}`,
    `*Source file: ${fileName}*`,
    `*Generated: ${new Date().toISOString()}*`,
    "",
    `## CV Quality Score`,
    `**${parsed.cvQualityScore ?? "N/A"} / 10**`,
    "",
    `## Key Strengths`,
    Array.isArray(parsed.technicalSkills)
      ? (parsed.technicalSkills as string[]).slice(0, 8).map((s) => `- ${s}`).join("\n")
      : "N/A",
    "",
    `## Upgrade Recommendations`,
    upgradeTips.length > 0
      ? upgradeTips.map((t) => `- 🔼 ${t}`).join("\n")
      : "- No specific recommendations at this time.",
    "",
    `## Career Goals`,
    `**Target roles:** ${Array.isArray(parsed.targetRoles) ? (parsed.targetRoles as string[]).join(", ") : "Not specified"}`,
    `**Preferred locations:** ${Array.isArray(parsed.preferredLocations) ? (parsed.preferredLocations as string[]).join(", ") : "Not specified"}`,
    `**Salary expectation:** ${parsed.salaryExpectation ?? "Not specified"}`,
  ].join("\n");
}
