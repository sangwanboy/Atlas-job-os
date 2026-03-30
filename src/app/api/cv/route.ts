import { NextResponse } from "next/server";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { auth } from "@/auth";

const CV_BASE_DIR = path.join(process.cwd(), "uploads", "cv");

export type CvTag = "professional" | "part-time" | "role-specific" | "general";

function getUserCvDir(userId: string): string {
  return path.join(CV_BASE_DIR, userId);
}

function getMetadataFile(userId: string): string {
  return path.join(getUserCvDir(userId), "_metadata.json");
}

async function readMetadata(userId: string): Promise<Record<string, { tag?: CvTag; label?: string }>> {
  try {
    const raw = await fs.readFile(getMetadataFile(userId), "utf-8");
    return JSON.parse(raw) as Record<string, { tag?: CvTag; label?: string }>;
  } catch {
    return {};
  }
}

async function writeMetadata(userId: string, data: Record<string, { tag?: CvTag; label?: string }>) {
  await fs.writeFile(getMetadataFile(userId), JSON.stringify(data, null, 2), "utf-8");
}

const ALLOWED_EXTENSIONS = new Set([
  ".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp",
]);

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/bmp",
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

async function ensureUserCvDir(userId: string) {
  await fs.mkdir(getUserCvDir(userId), { recursive: true });
}

// Background: extract text from CV and update Atlas user profile
async function processCvInBackground(fileName: string, filePath: string, ext: string, userId: string): Promise<void> {
  try {
    const { CvExtractor } = await import("@/lib/services/cv/cv-extractor");
    const { CvProfileGenerator } = await import("@/lib/services/cv/cv-profile-generator");

    const extraction = await CvExtractor.extract(filePath, ext);
    if (extraction.text.length < 50) {
      console.warn(`[CV] Extracted text too short (${extraction.charCount} chars) for ${fileName}`);
      return;
    }

    await CvProfileGenerator.generateAndSave(extraction.text, fileName, userId);
    console.log(`[CV] Profile updated for user ${userId} from ${fileName} via ${extraction.method} (${extraction.charCount} chars)`);
  } catch (err) {
    console.error(`[CV] Background processing failed for ${fileName}:`, err);
  }
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user.id;

    await ensureUserCvDir(userId);
    const userCvDir = getUserCvDir(userId);
    const [entries, metadata] = await Promise.all([
      fs.readdir(userCvDir, { withFileTypes: true }),
      readMetadata(userId),
    ]);
    const files = await Promise.all(
      entries
        .filter((e) => e.isFile() && e.name !== "_metadata.json")
        .map(async (e) => {
          const filePath = path.join(userCvDir, e.name);
          const stat = await fs.stat(filePath);
          const ext = path.extname(e.name).toLowerCase();
          const meta = metadata[e.name] ?? {};
          return {
            name: e.name,
            originalName: e.name,
            size: stat.size,
            uploadedAt: stat.birthtime.toISOString(),
            modifiedAt: stat.mtime.toISOString(),
            ext,
            tag: meta.tag ?? "general" as CvTag,
            label: meta.label ?? null,
            type: ext === ".pdf"
              ? "application/pdf"
              : ext === ".docx"
              ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              : ext === ".doc"
              ? "application/msword"
              : `image/${ext.slice(1)}`,
          };
        }),
    );
    files.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
    return NextResponse.json({ files });
  } catch (err) {
    console.error("[CV API] GET error:", err);
    return NextResponse.json({ files: [] });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user.id;

    await ensureUserCvDir(userId);
    const userCvDir = getUserCvDir(userId);

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const ext = path.extname(file.name).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        { error: `File type "${ext}" not supported. Please upload PDF, DOC, DOCX, or an image.` },
        { status: 415 },
      );
    }

    if (file.type && file.type !== "application/octet-stream" && !ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: `MIME type "${file.type}" not supported.` },
        { status: 415 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File too large. Maximum size is 10 MB." }, { status: 413 });
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const timestamp = Date.now();
    const finalName = `${timestamp}_${safeName}`;
    const savePath = path.join(userCvDir, finalName);

    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(savePath, buffer);
    const stat = await fs.stat(savePath);

    // Fire-and-forget background processing: extract CV text → update user profile
    void processCvInBackground(finalName, savePath, ext, userId);

    return NextResponse.json({
      success: true,
      processing: true,
      file: {
        name: finalName,
        originalName: file.name,
        size: stat.size,
        uploadedAt: stat.birthtime.toISOString(),
        ext,
      },
    });
  } catch (err) {
    console.error("[CV API] POST error:", err);
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user.id;

    const json = (await req.json()) as { name: string; tag?: CvTag; label?: string };
    const { name, tag, label } = json;
    if (!name) return NextResponse.json({ error: "Missing file name" }, { status: 400 });

    const safe = path.basename(name);
    const metadata = await readMetadata(userId);
    metadata[safe] = { ...metadata[safe], ...(tag ? { tag } : {}), ...(label !== undefined ? { label } : {}) };
    await writeMetadata(userId, metadata);
    return NextResponse.json({ success: true, name: safe, tag: metadata[safe].tag, label: metadata[safe].label });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user.id;

    const { searchParams } = new URL(req.url);
    const name = searchParams.get("name");

    if (!name) {
      return NextResponse.json({ error: "Missing file name" }, { status: 400 });
    }

    const safe = path.basename(name);
    const userCvDir = getUserCvDir(userId);
    const filePath = path.join(userCvDir, safe);

    if (!filePath.startsWith(userCvDir)) {
      return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
    }

    await fs.unlink(filePath);
    const metadata = await readMetadata(userId);
    delete metadata[safe];
    await writeMetadata(userId, metadata);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[CV API] DELETE error:", err);
    const message = err instanceof Error ? err.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
