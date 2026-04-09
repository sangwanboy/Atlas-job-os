import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isNextResponse } from "@/lib/server/auth-helpers";
import fs from "fs/promises";
import path from "path";

const VALID_TYPES = ["bug", "suggestion", "other"] as const;
type FeedbackType = (typeof VALID_TYPES)[number];

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    if (isNextResponse(session)) return session;

    const body = await req.json();
    const { type, description, page, userAgent } = body as {
      type: unknown;
      description: unknown;
      page: unknown;
      userAgent: unknown;
    };

    // Validate
    if (typeof description !== "string" || description.trim().length === 0) {
      return NextResponse.json(
        { error: "description must be a non-empty string" },
        { status: 400 }
      );
    }
    if (!VALID_TYPES.includes(type as FeedbackType)) {
      return NextResponse.json(
        { error: `type must be one of: ${VALID_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    const entry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      userId: session.userId,
      userEmail: session.email,
      type: type as FeedbackType,
      description: (description as string).slice(0, 2000),
      page: typeof page === "string" ? page : "",
      userAgent:
        typeof userAgent === "string" ? userAgent.slice(0, 300) : "",
    };

    // Save to file
    const feedbackDir = path.join(process.cwd(), "data");
    const feedbackFile = path.join(feedbackDir, "feedback.jsonl");
    await fs.mkdir(feedbackDir, { recursive: true });
    await fs.appendFile(feedbackFile, JSON.stringify(entry) + "\n", "utf-8");

    // Webhook (fire-and-forget)
    const webhookUrl = process.env.FEEDBACK_WEBHOOK_URL;
    if (webhookUrl) {
      const content = [
        "**New Beta Feedback** 🎯",
        `**Type:** ${entry.type}`,
        `**From:** ${entry.userEmail}`,
        `**Page:** ${entry.page || "(unknown)"}`,
        `**Message:** ${entry.description}`,
      ].join("\n");

      fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      }).catch(() => {});
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("[feedback] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
