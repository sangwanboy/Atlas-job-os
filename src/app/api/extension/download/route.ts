import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import JSZip from "jszip";

const EXTENSION_FILES = [
  "manifest.json",
  "background.js",
  "content.js",
  "popup.js",
  "popup.html",
];

export async function GET() {
  try {
    const zip = new JSZip();
    const extensionDir = path.join(process.cwd(), "chrome-extension");

    for (const filename of EXTENSION_FILES) {
      const filePath = path.join(extensionDir, filename);
      const content = await readFile(filePath);
      zip.file(filename, content);
    }

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });

    return new NextResponse(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="atlas-extension.zip"',
        "Content-Length": zipBuffer.length.toString(),
      },
    });
  } catch (err) {
    console.error("[Extension/Download]", err);
    return NextResponse.json({ error: "Failed to package extension" }, { status: 500 });
  }
}
