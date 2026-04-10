import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { requireAuth, isNextResponse } from "@/lib/server/auth-helpers";

/**
 * GET /api/cv/export?file=<filename>
 *
 * Serves a generated CV DOCX file for download.
 * Strict user isolation: only serves files from the authenticated user's directory.
 */
export async function GET(req: NextRequest) {
  const authResult = await requireAuth();
  if (isNextResponse(authResult)) return authResult;
  const { userId } = authResult;

  const file = req.nextUrl.searchParams.get("file");
  if (!file) {
    return NextResponse.json({ error: "Missing 'file' parameter" }, { status: 400 });
  }

  // Path-traversal guard: strip any directory components, use only the basename
  const safeFilename = path.basename(file);
  if (safeFilename !== file || safeFilename.includes("..")) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  // Serve from generated (saved) or temp (preview) directory — both scoped to this user
  const preview = req.nextUrl.searchParams.get("preview") === "true";
  const subDir = preview ? "temp" : "generated";
  const baseDir = path.join(process.cwd(), "uploads", "cv", userId, subDir);
  const filePath = path.join(baseDir, safeFilename);

  // Double-check resolved path stays within user's directory
  const resolvedPath = path.resolve(filePath);
  const resolvedDir = path.resolve(baseDir);
  if (!resolvedPath.startsWith(resolvedDir)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  try {
    const buffer = await fs.readFile(filePath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${safeFilename}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
