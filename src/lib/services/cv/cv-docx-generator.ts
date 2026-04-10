/**
 * CV DOCX Generator
 *
 * Generates professional UK-style CV documents from user profile data.
 * Three templates: Classic, Modern, ATS-Optimized.
 * Uses the `docx` library for programmatic DOCX creation.
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  AlignmentType,
  BorderStyle,
  WidthType,
  convertMillimetersToTwip,
  TabStopPosition,
  TabStopType,
  ShadingType,
} from "docx";
import { promises as fs } from "fs";
import path from "path";
import { atlasState, ATLAS_FILES } from "@/lib/services/agent/atlas-state-manager";

// ─── Types ───────────────────────────────────────────────────────────────────

export type CvTemplate = "classic" | "modern" | "ats";

export interface WorkExperienceEntry {
  title: string;
  company: string;
  location?: string;
  startDate: string;
  endDate: string;
  bullets: string[];
}

export interface ProjectEntry {
  name: string;
  description: string;
  technologies: string[];
  url?: string;
}

export interface EducationEntry {
  qualification: string;
  institution: string;
  startYear?: string;
  endYear?: string;
  grade?: string;
}

export interface CvData {
  name: string;
  currentRole: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedIn?: string;
  summary: string;
  technicalSkills: string[];
  softSkills: string[];
  workExperience: WorkExperienceEntry[];
  education: string;
  educationEntries: EducationEntry[];
  certifications: string[];
  projects: ProjectEntry[];
  targetRole?: string;
}

export interface CvGenerationResult {
  success: boolean;
  filename?: string;
  filePath?: string;
  downloadUrl?: string;
  sections?: string[];
  error?: string;
}

// ─── Data Loading ────────────────────────────────────────────────────────────

/**
 * Strip markdown bold/italic markers from text.
 */
function stripMarkdown(text: string): string {
  return text.replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1").trim();
}

/**
 * Parse work experience entries from the profileMarkdown field.
 * Handles multiple formats:
 *   1. "### Job Title | Company (Start - End)" with bullet points
 *   2. "- **Company (Role):** Description..." (compact list format)
 *   3. "**Title** at **Company** (Start - End)"
 */
function parseExperienceFromMarkdown(md: string): WorkExperienceEntry[] {
  const entries: WorkExperienceEntry[] = [];
  let match: RegExpExecArray | null;

  // Format 1: "### Title | Company (Date - Date)" or "### Title at Company"
  const headerRegex = /###\s+(.+?)(?:\s*\|\s*|\s+at\s+)(.+?)(?:\s*\((.+?)\s*[-–—]\s*(.+?)\))?$/gm;
  while ((match = headerRegex.exec(md)) !== null) {
    const afterHeader = md.slice(match.index + match[0].length);
    const nextSection = afterHeader.search(/\n##/);
    const block = nextSection > 0 ? afterHeader.slice(0, nextSection) : afterHeader.slice(0, 1000);
    const bullets: string[] = [];
    const bulletRegex = /^[\s]*[*\-•]\s+(.+)$/gm;
    let bm: RegExpExecArray | null;
    while ((bm = bulletRegex.exec(block)) !== null) {
      const text = stripMarkdown(bm[1]);
      if (text.length > 5) bullets.push(text);
    }
    entries.push({
      title: stripMarkdown(match[1]),
      company: stripMarkdown(match[2]).replace(/\s*\(.*$/, ""),
      startDate: match[3]?.trim() ?? "",
      endDate: match[4]?.trim() ?? "Present",
      bullets: bullets.slice(0, 5),
    });
  }

  // Format 2: "- **Company (Role):** Description..." (used in profileMarkdown)
  if (entries.length === 0) {
    const compactRegex = /[-•]\s+\*\*(.+?)\s*\((.+?)\)(?::?\*\*|:\*\*)\s*(.+)/gm;
    while ((match = compactRegex.exec(md)) !== null) {
      const company = stripMarkdown(match[1]);
      const title = stripMarkdown(match[2]);
      const description = stripMarkdown(match[3]);
      entries.push({
        title,
        company,
        startDate: "",
        endDate: "Present",
        bullets: description.length > 10 ? [description] : [],
      });
    }
  }

  // Format 3: "**Title** at **Company** (Start - End)"
  if (entries.length === 0) {
    const simpleRegex = /\*\*(.+?)\*\*\s+(?:at|@)\s+\*\*(.+?)\*\*\s*(?:\((.+?)\s*[-–—]\s*(.+?)\))?/gm;
    while ((match = simpleRegex.exec(md)) !== null) {
      entries.push({
        title: match[1].trim(),
        company: match[2].trim(),
        startDate: match[3]?.trim() ?? "",
        endDate: match[4]?.trim() ?? "Present",
        bullets: [],
      });
    }
  }

  return entries;
}

/**
 * Parse projects from markdown content.
 */
function parseProjectsFromMarkdown(md: string): ProjectEntry[] {
  const projects: ProjectEntry[] = [];
  // Match "### ProjectName" or "- **ProjectName**" patterns
  const projSection = md.match(/## (?:Key )?Projects?\s*\n([\s\S]*?)(?=\n## |\n# |$)/i);
  if (!projSection) return projects;

  // Strip all markdown from the block first, then parse "Name: Description" or "Name — Description"
  const cleanBlock = stripMarkdown(projSection[1]);
  const projRegex = /[-•]\s*([^:–—\n]+?)\s*[-–—:]\s*(.+)/gm;
  let match: RegExpExecArray | null;
  while ((match = projRegex.exec(cleanBlock)) !== null) {
    const name = match[1].trim();
    const desc = match[2].trim();
    if (name.length > 1 && desc.length > 5) {
      projects.push({ name, description: desc, technologies: [] });
    }
  }

  return projects.slice(0, 5);
}

/**
 * Load CV data from user profile files. Falls back to markdown parsing
 * when structured fields like workExperience are missing.
 */
export async function loadCvData(userId: string, targetRole?: string): Promise<CvData> {
  // Read structured JSON
  const profile = await atlasState.readUserJson<Record<string, unknown>>(
    userId,
    "user_profile.json",
    {}
  );

  // Read markdown for fallback parsing
  const profileMd = await atlasState.readUserText(userId, ATLAS_FILES.userProfile, "");

  if (!profile.name && !profileMd) {
    throw new Error("NO_PROFILE: No CV profile found. Please upload your CV first so I can extract your details.");
  }

  // Parse work experience — prefer structured JSON, fall back to markdown
  let workExperience: WorkExperienceEntry[] = [];
  if (Array.isArray(profile.workExperience) && profile.workExperience.length > 0) {
    workExperience = profile.workExperience as WorkExperienceEntry[];
  } else {
    const mdSource = (profile.profileMarkdown as string) || profileMd;
    workExperience = parseExperienceFromMarkdown(mdSource);
  }

  // Parse projects
  let projects: ProjectEntry[] = [];
  if (Array.isArray(profile.projects) && profile.projects.length > 0) {
    projects = profile.projects as ProjectEntry[];
  } else {
    const mdSource = (profile.profileMarkdown as string) || profileMd;
    projects = parseProjectsFromMarkdown(mdSource);
  }

  // Parse education entries
  let educationEntries: EducationEntry[] = [];
  if (Array.isArray(profile.educationEntries) && profile.educationEntries.length > 0) {
    educationEntries = profile.educationEntries as EducationEntry[];
  } else {
    // Fallback: parse from markdown "**Qualification**, Institution (Year-Year)"
    const mdSource = (profile.profileMarkdown as string) || profileMd;
    const eduSection = mdSource.match(/## Education\s*\n([\s\S]*?)(?=\n## |\n# |$)/i);
    if (eduSection) {
      const eduRegex = /[-•]\s+\*?\*?([^,*]+)\*?\*?,?\s*\*?\*?([^(*\n]+)\*?\*?\s*(?:\((\d{4})\s*[-–]\s*(\d{4})\))?/gm;
      let em: RegExpExecArray | null;
      while ((em = eduRegex.exec(eduSection[1])) !== null) {
        educationEntries.push({
          qualification: stripMarkdown(em[1]),
          institution: stripMarkdown(em[2]),
          startYear: em[3] ?? "",
          endYear: em[4] ?? "",
          grade: "",
        });
      }
    }
  }

  // Cap skills to top 20 technical + 5 soft for readability
  const cappedTechnical = (profile.technicalSkills as string[] ?? []).slice(0, 20);
  const cappedSoft = (profile.softSkills as string[] ?? []).slice(0, 5);

  return {
    name: (profile.name as string) ?? "User",
    currentRole: (profile.currentRole as string) ?? "",
    summary: targetRole
      ? `${(profile.summary as string) ?? ""} Seeking opportunities as ${targetRole}.`
      : (profile.summary as string) ?? "",
    technicalSkills: cappedTechnical,
    softSkills: cappedSoft,
    education: (profile.education as string) ?? "",
    educationEntries,
    certifications: (profile.certifications as string[]) ?? [],
    workExperience,
    projects,
    targetRole,
    email: (profile.email as string) ?? undefined,
    phone: (profile.phone as string) ?? undefined,
    location: Array.isArray(profile.preferredLocations)
      ? (profile.preferredLocations as string[]).join(", ")
      : undefined,
    linkedIn: (profile.linkedIn as string) ?? undefined,
  };
}

// ─── Shared Helpers ──────────────────────────────────────────────────────────

const A4_WIDTH = convertMillimetersToTwip(210);
const A4_HEIGHT = convertMillimetersToTwip(297);
const MARGIN = convertMillimetersToTwip(22);
const NARROW_MARGIN = convertMillimetersToTwip(18);

function contactLine(data: CvData): string {
  const parts: string[] = [];
  if (data.location) parts.push(data.location);
  if (data.email) parts.push(data.email);
  if (data.phone) parts.push(data.phone);
  if (data.linkedIn) parts.push(data.linkedIn);
  return parts.join("  |  ");
}

function bulletParagraph(text: string, font: string, size: number): Paragraph {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 40 },
    children: [new TextRun({ text, font, size: size * 2 })],
  });
}

// ─── Classic Template ────────────────────────────────────────────────────────

function buildClassicCv(data: CvData): Document {
  const font = "Cambria";
  const bodySize = 11;
  const children: Paragraph[] = [];

  // Name
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [
        new TextRun({
          text: data.name.toUpperCase(),
          font,
          size: 28,
          bold: true,
        }),
      ],
    })
  );

  // Current role
  if (data.currentRole) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [new TextRun({ text: data.currentRole, font, size: 22, italics: true })],
      })
    );
  }

  // Contact
  const contact = contactLine(data);
  if (contact) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [new TextRun({ text: contact, font, size: bodySize * 2 })],
      })
    );
  }

  // Section helper
  const sectionHeader = (title: string) =>
    new Paragraph({
      spacing: { before: 240, after: 80 },
      thematicBreak: true,
      children: [
        new TextRun({
          text: title.toUpperCase(),
          font,
          size: 22,
          bold: true,
        }),
      ],
    });

  // Personal Statement
  children.push(sectionHeader("Personal Statement"));
  children.push(
    new Paragraph({
      spacing: { after: 120 },
      children: [new TextRun({ text: data.summary, font, size: bodySize * 2 })],
    })
  );

  // Key Skills
  if (data.technicalSkills.length > 0) {
    children.push(sectionHeader("Key Skills"));
    const allSkills = [...data.technicalSkills, ...data.softSkills];
    // Group in rows of 3
    for (let i = 0; i < allSkills.length; i += 3) {
      const chunk = allSkills.slice(i, i + 3);
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          spacing: { after: 40 },
          children: [new TextRun({ text: chunk.join("  •  "), font, size: bodySize * 2 })],
        })
      );
    }
  }

  // Work Experience
  if (data.workExperience.length > 0) {
    children.push(sectionHeader("Professional Experience"));
    for (const exp of data.workExperience) {
      // Title and company line
      children.push(
        new Paragraph({
          spacing: { before: 120, after: 40 },
          tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
          children: [
            new TextRun({ text: exp.title, font, size: bodySize * 2, bold: true }),
            new TextRun({ text: ` — ${exp.company}`, font, size: bodySize * 2 }),
            new TextRun({ text: "\t", font }),
            new TextRun({
              text: `${exp.startDate} – ${exp.endDate}`,
              font,
              size: bodySize * 2,
              italics: true,
            }),
          ],
        })
      );
      if (exp.location) {
        children.push(
          new Paragraph({
            spacing: { after: 40 },
            children: [new TextRun({ text: exp.location, font, size: bodySize * 2, italics: true })],
          })
        );
      }
      for (const bullet of exp.bullets.slice(0, 4)) {
        children.push(bulletParagraph(bullet, font, bodySize));
      }
    }
  }

  // Education
  children.push(sectionHeader("Education"));
  if (data.educationEntries.length > 0) {
    for (const edu of data.educationEntries) {
      const datePart = edu.startYear && edu.endYear ? ` (${edu.startYear} – ${edu.endYear})` : "";
      children.push(
        new Paragraph({
          spacing: { before: 60, after: 20 },
          tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
          children: [
            new TextRun({ text: edu.qualification, font, size: bodySize * 2, bold: true }),
            new TextRun({ text: `\t${datePart}`, font, size: bodySize * 2, italics: true }),
          ],
        })
      );
      const detail = [edu.institution, edu.grade].filter(Boolean).join(" — ");
      if (detail) {
        children.push(
          new Paragraph({
            spacing: { after: 60 },
            children: [new TextRun({ text: detail, font, size: bodySize * 2 })],
          })
        );
      }
    }
  } else {
    children.push(
      new Paragraph({
        spacing: { after: 80 },
        children: [new TextRun({ text: data.education, font, size: bodySize * 2 })],
      })
    );
  }

  // Certifications
  if (data.certifications.length > 0) {
    children.push(sectionHeader("Certifications"));
    for (const cert of data.certifications) {
      children.push(bulletParagraph(cert, font, bodySize));
    }
  }

  // Projects
  if (data.projects.length > 0) {
    children.push(sectionHeader("Key Projects"));
    for (const proj of data.projects.slice(0, 3)) {
      children.push(
        new Paragraph({
          spacing: { before: 80, after: 40 },
          children: [
            new TextRun({ text: proj.name, font, size: bodySize * 2, bold: true }),
            new TextRun({ text: ` — ${proj.description}`, font, size: bodySize * 2 }),
          ],
        })
      );
      if (proj.technologies.length > 0) {
        children.push(
          new Paragraph({
            spacing: { after: 60 },
            children: [
              new TextRun({
                text: `Tech: ${proj.technologies.join(", ")}`,
                font,
                size: (bodySize - 1) * 2,
                italics: true,
              }),
            ],
          })
        );
      }
    }
  }

  return new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: A4_WIDTH, height: A4_HEIGHT },
            margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
          },
        },
        children,
      },
    ],
  });
}

// ─── Modern Template ─────────────────────────────────────────────────────────

const NAVY = "1B3A5C";

function buildModernCv(data: CvData): Document {
  const font = "Calibri";
  const bodySize = 10.5;
  const children: (Paragraph | Table)[] = [];

  // Name
  children.push(
    new Paragraph({
      spacing: { after: 40 },
      children: [
        new TextRun({
          text: data.name,
          font,
          size: 32,
          bold: true,
          color: NAVY,
        }),
      ],
    })
  );

  // Role
  if (data.currentRole) {
    children.push(
      new Paragraph({
        spacing: { after: 60 },
        children: [new TextRun({ text: data.currentRole, font, size: 24, color: "555555" })],
      })
    );
  }

  // Contact line
  const contact = contactLine(data);
  if (contact) {
    children.push(
      new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun({ text: contact, font, size: bodySize * 2, color: "666666" })],
      })
    );
  }

  // Section header with navy bottom border
  const sectionHeader = (title: string) =>
    new Paragraph({
      spacing: { before: 280, after: 120 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 4, color: NAVY },
      },
      children: [
        new TextRun({
          text: title,
          font,
          size: 24,
          bold: true,
          color: NAVY,
        }),
      ],
    });

  // Personal Statement
  children.push(sectionHeader("Personal Statement"));
  children.push(
    new Paragraph({
      spacing: { after: 160 },
      children: [new TextRun({ text: data.summary, font, size: bodySize * 2 })],
    })
  );

  // Skills as 2-column table with gray background
  if (data.technicalSkills.length > 0) {
    children.push(sectionHeader("Key Skills"));
    const allSkills = [...data.technicalSkills.slice(0, 16), ...data.softSkills.slice(0, 4)];
    const half = Math.ceil(allSkills.length / 2);
    const col1 = allSkills.slice(0, half);
    const col2 = allSkills.slice(half);
    const maxRows = Math.max(col1.length, col2.length);
    const rows: TableRow[] = [];

    for (let i = 0; i < maxRows; i++) {
      rows.push(
        new TableRow({
          children: [
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, fill: "F2F4F7" },
              children: [
                new Paragraph({
                  spacing: { before: 40, after: 40 },
                  children: [
                    new TextRun({
                      text: col1[i] ? `• ${col1[i]}` : "",
                      font,
                      size: bodySize * 2,
                    }),
                  ],
                }),
              ],
            }),
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, fill: "F2F4F7" },
              children: [
                new Paragraph({
                  spacing: { before: 40, after: 40 },
                  children: [
                    new TextRun({
                      text: col2[i] ? `• ${col2[i]}` : "",
                      font,
                      size: bodySize * 2,
                    }),
                  ],
                }),
              ],
            }),
          ],
        })
      );
    }

    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.NONE },
          bottom: { style: BorderStyle.NONE },
          left: { style: BorderStyle.NONE },
          right: { style: BorderStyle.NONE },
          insideHorizontal: { style: BorderStyle.NONE },
          insideVertical: { style: BorderStyle.NONE },
        },
        rows,
      })
    );
  }

  // Work Experience
  if (data.workExperience.length > 0) {
    children.push(sectionHeader("Professional Experience"));
    for (const exp of data.workExperience) {
      children.push(
        new Paragraph({
          spacing: { before: 160, after: 40 },
          children: [
            new TextRun({ text: exp.title, font, size: bodySize * 2, bold: true, color: NAVY }),
            new TextRun({ text: `  |  ${exp.company}`, font, size: bodySize * 2 }),
          ],
        })
      );
      children.push(
        new Paragraph({
          spacing: { after: 60 },
          children: [
            new TextRun({
              text: `${exp.startDate} – ${exp.endDate}${exp.location ? `  |  ${exp.location}` : ""}`,
              font,
              size: bodySize * 2,
              italics: true,
              color: "777777",
            }),
          ],
        })
      );
      for (const bullet of exp.bullets.slice(0, 4)) {
        children.push(bulletParagraph(bullet, font, bodySize));
      }
    }
  }

  // Education
  children.push(sectionHeader("Education"));
  if (data.educationEntries.length > 0) {
    for (const edu of data.educationEntries) {
      children.push(
        new Paragraph({
          spacing: { before: 60, after: 20 },
          children: [
            new TextRun({ text: edu.qualification, font, size: bodySize * 2, bold: true, color: NAVY }),
            new TextRun({
              text: `  |  ${edu.institution}${edu.startYear ? `  |  ${edu.startYear} – ${edu.endYear}` : ""}`,
              font,
              size: bodySize * 2,
            }),
          ],
        })
      );
      if (edu.grade) {
        children.push(
          new Paragraph({
            spacing: { after: 60 },
            children: [new TextRun({ text: edu.grade, font, size: bodySize * 2, italics: true, color: "777777" })],
          })
        );
      }
    }
  } else {
    children.push(
      new Paragraph({
        spacing: { after: 80 },
        children: [new TextRun({ text: data.education, font, size: bodySize * 2 })],
      })
    );
  }

  // Certifications
  if (data.certifications.length > 0) {
    children.push(sectionHeader("Certifications"));
    for (const cert of data.certifications) {
      children.push(bulletParagraph(cert, font, bodySize));
    }
  }

  // Projects
  if (data.projects.length > 0) {
    children.push(sectionHeader("Key Projects"));
    for (const proj of data.projects.slice(0, 3)) {
      children.push(
        new Paragraph({
          spacing: { before: 80, after: 40 },
          children: [
            new TextRun({ text: proj.name, font, size: bodySize * 2, bold: true, color: NAVY }),
            new TextRun({ text: ` — ${proj.description}`, font, size: bodySize * 2 }),
          ],
        })
      );
    }
  }

  return new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: A4_WIDTH, height: A4_HEIGHT },
            margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
          },
        },
        children,
      },
    ],
  });
}

// ─── ATS-Optimized Template ──────────────────────────────────────────────────

function buildAtsCv(data: CvData): Document {
  const font = "Arial";
  const bodySize = 11;
  const children: Paragraph[] = [];

  // Name — plain, left-aligned
  children.push(
    new Paragraph({
      spacing: { after: 40 },
      children: [new TextRun({ text: data.name, font, size: 28, bold: true })],
    })
  );

  // Contact — each on its own line for ATS parsing
  const contactParts: string[] = [];
  if (data.location) contactParts.push(data.location);
  if (data.email) contactParts.push(data.email);
  if (data.phone) contactParts.push(data.phone);
  if (data.linkedIn) contactParts.push(data.linkedIn);
  if (contactParts.length > 0) {
    children.push(
      new Paragraph({
        spacing: { after: 200 },
        children: contactParts.flatMap((p, i) => [
          ...(i > 0 ? [new TextRun({ text: "\n", font })] : []),
          new TextRun({ text: p, font, size: bodySize * 2 }),
        ]),
      })
    );
  }

  // Simple section header — bold, no decoration
  const sectionHeader = (title: string) =>
    new Paragraph({
      spacing: { before: 240, after: 80 },
      children: [new TextRun({ text: title.toUpperCase(), font, size: 22, bold: true })],
    });

  // Personal Statement
  children.push(sectionHeader("Personal Statement"));
  children.push(
    new Paragraph({
      spacing: { after: 120 },
      children: [new TextRun({ text: data.summary, font, size: bodySize * 2 })],
    })
  );

  // Skills — comma-separated plain text (no tables, no grids)
  if (data.technicalSkills.length > 0) {
    children.push(sectionHeader("Skills"));
    const allSkills = [...data.technicalSkills, ...data.softSkills];
    children.push(
      new Paragraph({
        spacing: { after: 120 },
        children: [new TextRun({ text: allSkills.join(", "), font, size: bodySize * 2 })],
      })
    );
  }

  // Work Experience
  if (data.workExperience.length > 0) {
    children.push(sectionHeader("Professional Experience"));
    for (const exp of data.workExperience) {
      children.push(
        new Paragraph({
          spacing: { before: 120, after: 20 },
          children: [
            new TextRun({ text: `${exp.title} — ${exp.company}`, font, size: bodySize * 2, bold: true }),
          ],
        })
      );
      children.push(
        new Paragraph({
          spacing: { after: 60 },
          children: [
            new TextRun({
              text: `${exp.startDate} – ${exp.endDate}${exp.location ? `, ${exp.location}` : ""}`,
              font,
              size: bodySize * 2,
            }),
          ],
        })
      );
      for (const bullet of exp.bullets.slice(0, 4)) {
        children.push(
          new Paragraph({
            spacing: { after: 40 },
            children: [new TextRun({ text: `- ${bullet}`, font, size: bodySize * 2 })],
          })
        );
      }
    }
  }

  // Education
  children.push(sectionHeader("Education"));
  if (data.educationEntries.length > 0) {
    for (const edu of data.educationEntries) {
      const datePart = edu.startYear && edu.endYear ? `, ${edu.startYear} – ${edu.endYear}` : "";
      const gradePart = edu.grade ? ` (${edu.grade})` : "";
      children.push(
        new Paragraph({
          spacing: { before: 40, after: 40 },
          children: [
            new TextRun({ text: `${edu.qualification}${gradePart}`, font, size: bodySize * 2, bold: true }),
          ],
        })
      );
      children.push(
        new Paragraph({
          spacing: { after: 60 },
          children: [new TextRun({ text: `${edu.institution}${datePart}`, font, size: bodySize * 2 })],
        })
      );
    }
  } else {
    children.push(
      new Paragraph({
        spacing: { after: 80 },
        children: [new TextRun({ text: data.education, font, size: bodySize * 2 })],
      })
    );
  }

  // Certifications
  if (data.certifications.length > 0) {
    children.push(sectionHeader("Certifications"));
    children.push(
      new Paragraph({
        spacing: { after: 80 },
        children: [new TextRun({ text: data.certifications.join(", "), font, size: bodySize * 2 })],
      })
    );
  }

  // Projects
  if (data.projects.length > 0) {
    children.push(sectionHeader("Key Projects"));
    for (const proj of data.projects.slice(0, 3)) {
      children.push(
        new Paragraph({
          spacing: { after: 40 },
          children: [
            new TextRun({ text: `${proj.name} — ${proj.description}`, font, size: bodySize * 2 }),
          ],
        })
      );
    }
  }

  return new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: A4_WIDTH, height: A4_HEIGHT },
            margin: {
              top: NARROW_MARGIN,
              bottom: NARROW_MARGIN,
              left: NARROW_MARGIN,
              right: NARROW_MARGIN,
            },
          },
        },
        children,
      },
    ],
  });
}

// ─── Template Dispatcher ─────────────────────────────────────────────────────

const TEMPLATE_BUILDERS: Record<CvTemplate, (data: CvData) => Document> = {
  classic: buildClassicCv,
  modern: buildModernCv,
  ats: buildAtsCv,
};

/**
 * Generate a DOCX CV and save it to a temp directory.
 * Returns file info for preview/confirmation — the user must approve before
 * the file is moved to permanent storage.
 */
export async function generateCvToTemp(
  userId: string,
  template: CvTemplate,
  targetRole?: string
): Promise<CvGenerationResult> {
  try {
    const data = await loadCvData(userId, targetRole);

    // Validate minimum data quality — refuse to generate empty CVs
    const placeholderNames = ["user", "test user", "test", "unknown", "name", ""];
    const insufficientFields: string[] = [];
    if (!data.name || placeholderNames.includes(data.name.toLowerCase().trim())) insufficientFields.push("full name");
    if (data.technicalSkills.length === 0) insufficientFields.push("skills");
    if (data.workExperience.length === 0) insufficientFields.push("work experience");
    if (!data.education && data.educationEntries.length === 0) insufficientFields.push("education");
    if (!data.summary || data.summary.length < 30) insufficientFields.push("personal statement / summary");
    if (insufficientFields.length >= 2) {
      return {
        success: false,
        error: `INSUFFICIENT_DATA: Your profile is missing: ${insufficientFields.join(", ")}. Please upload a complete CV first, or provide these details in chat so I can build your profile.`,
      };
    }

    const builder = TEMPLATE_BUILDERS[template];
    if (!builder) return { success: false, error: `Unknown template: ${template}` };

    const doc = builder(data);
    const buffer = await Packer.toBuffer(doc);

    // Save to temp location
    const safeName = data.name.replace(/[^a-zA-Z0-9_-]/g, "_");
    const timestamp = Date.now();
    const filename = `${safeName}_CV_${template}_${timestamp}.docx`;
    const tempDir = path.join(process.cwd(), "uploads", "cv", userId, "temp");
    await fs.mkdir(tempDir, { recursive: true });
    const filePath = path.join(tempDir, filename);
    await fs.writeFile(filePath, buffer);

    // Determine which sections were included
    const sections: string[] = ["Personal Statement"];
    if (data.technicalSkills.length > 0) sections.push("Key Skills");
    if (data.workExperience.length > 0) sections.push(`Professional Experience (${data.workExperience.length} roles)`);
    sections.push("Education");
    if (data.certifications.length > 0) sections.push("Certifications");
    if (data.projects.length > 0) sections.push(`Projects (${data.projects.length})`);

    return {
      success: true,
      filename,
      filePath,
      sections,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: msg };
  }
}

/**
 * Move a generated CV from temp to permanent storage and return download URL.
 */
export async function saveCvFromTemp(
  userId: string,
  tempFilePath: string,
  filename: string
): Promise<CvGenerationResult> {
  try {
    const generatedDir = path.join(process.cwd(), "uploads", "cv", userId, "generated");
    await fs.mkdir(generatedDir, { recursive: true });
    const destPath = path.join(generatedDir, filename);
    await fs.rename(tempFilePath, destPath);

    return {
      success: true,
      filename,
      filePath: destPath,
      downloadUrl: `/api/cv/export?file=${encodeURIComponent(filename)}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: msg };
  }
}

/**
 * Discard a temp CV file.
 */
export async function discardTempCv(tempFilePath: string): Promise<void> {
  try {
    await fs.unlink(tempFilePath);
  } catch {
    // File may already be gone
  }
}
