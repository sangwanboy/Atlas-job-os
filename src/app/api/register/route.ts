import { NextResponse } from "next/server";
import { createUser, findUserByEmail } from "@/lib/services/auth/local-user-store";
import { atlasState, ATLAS_FILES } from "@/lib/services/agent/atlas-state-manager";

export async function POST(request: Request) {
  try {
    const body = await request.json();
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

    const user = await createUser(email, name, password);

    // Create blank per-user Atlas profile so Atlas never falls back to shared data
    await atlasState.writeUserText(user.id, ATLAS_FILES.userProfile,
      `# User Profile: ${name}\n\nNo profile yet. Atlas will build this as we talk.\n`
    );

    return NextResponse.json(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Registration failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
