import { auth } from "@/auth";
import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") return null;
  return session;
}

export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  try {
    const filePath = path.join(process.cwd(), "data", "feedback.jsonl");
    const text = await fs.readFile(filePath, "utf-8").catch(() => "");
    const entries = text
      .split("\n")
      .filter(Boolean)
      .map((line) => { try { return JSON.parse(line); } catch { return null; } })
      .filter(Boolean)
      .reverse(); // newest first
    return NextResponse.json({ entries, total: entries.length });
  } catch {
    return NextResponse.json({ error: "Failed to read feedback" }, { status: 500 });
  }
}
