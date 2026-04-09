import { NextRequest, NextResponse } from "next/server";
import { createUser, findUserByEmail } from "@/lib/services/auth/local-user-store";
import { atlasState, ATLAS_FILES } from "@/lib/services/agent/atlas-state-manager";
import { rateLimit, getClientIP } from "@/lib/rate-limit";

const REG_LIMIT = 3;            // max registrations
const REG_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export async function POST(request: NextRequest) {
  try {
    // Rate limit registration by IP
    const ip = getClientIP(request);
    const rl = rateLimit("register", ip, REG_LIMIT, REG_WINDOW_MS);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many registration attempts. Please try again later.", retryAfterSeconds: Math.ceil(rl.retryAfterMs / 1000) },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }
    const { name, email, password } = body as {
      name?: string;
      email?: string;
      password?: string;
    };

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Name, email, and password are required." },
        { status: 400 },
      );
    }

    // Sanitize name — strip HTML tags to prevent stored XSS
    const sanitizedName = (name as string)
      .replace(/<[^>]*>/g, "")
      .replace(/[<>"'&]/g, "")
      .trim();
    if (!sanitizedName || sanitizedName.length < 1) {
      return NextResponse.json(
        { error: "Name contains invalid characters." },
        { status: 400 },
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters." },
        { status: 400 },
      );
    }

    const existing = await findUserByEmail(email);
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 },
      );
    }

    const user = await createUser(email, sanitizedName, password);

    // Create blank per-user Atlas profile so Atlas never falls back to shared data
    await atlasState.writeUserText(user.id, ATLAS_FILES.userProfile,
      `# User Profile: ${sanitizedName}\n\nNo profile yet. Atlas will build this as we talk.\n`
    );

    return NextResponse.json(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      { status: 201 },
    );
  } catch (error) {
    // Prisma unique constraint violation — race condition on duplicate email
    if (
      error instanceof Error &&
      (error.message.includes("Unique constraint") || (error as { code?: string }).code === "P2002")
    ) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 },
      );
    }
    const message =
      error instanceof Error ? error.message : "Registration failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
