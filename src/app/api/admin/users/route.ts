import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getAllUsers,
  createUser,
  updateUserRole,
  deleteUser,
  resetUserPassword,
} from "@/lib/services/auth/local-user-store";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return null;
  }
  return session;
}

export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const users = await getAllUsers();
  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { action, ...data } = body as {
      action: string;
      [key: string]: unknown;
    };

    switch (action) {
      case "create": {
        const { name, email, password, role } = data as {
          name: string;
          email: string;
          password: string;
          role?: "USER" | "ADMIN";
        };
        if (!name || !email || !password) {
          return NextResponse.json(
            { error: "Name, email, and password required." },
            { status: 400 },
          );
        }
        const user = await createUser(
          email,
          name,
          password,
          role || "USER",
        );
        return NextResponse.json({
          user: { id: user.id, email: user.email, name: user.name, role: user.role },
        });
      }

      case "updateRole": {
        const { userId, role } = data as {
          userId: string;
          role: "USER" | "ADMIN";
        };
        if (!userId || !role) {
          return NextResponse.json(
            { error: "userId and role required." },
            { status: 400 },
          );
        }
        const updated = await updateUserRole(userId, role);
        if (!updated) {
          return NextResponse.json(
            { error: "User not found." },
            { status: 404 },
          );
        }
        return NextResponse.json({
          user: { id: updated.id, email: updated.email, name: updated.name, role: updated.role },
        });
      }

      case "resetPassword": {
        const { userId, newPassword } = data as {
          userId: string;
          newPassword: string;
        };
        if (!userId || !newPassword) {
          return NextResponse.json(
            { error: "userId and newPassword required." },
            { status: 400 },
          );
        }
        const ok = await resetUserPassword(userId, newPassword);
        if (!ok) {
          return NextResponse.json(
            { error: "User not found." },
            { status: 404 },
          );
        }
        return NextResponse.json({ success: true });
      }

      case "delete": {
        const { userId } = data as { userId: string };
        if (!userId) {
          return NextResponse.json(
            { error: "userId required." },
            { status: 400 },
          );
        }
        try {
          const ok = await deleteUser(userId);
          if (!ok) {
            return NextResponse.json(
              { error: "User not found." },
              { status: 404 },
            );
          }
          return NextResponse.json({ success: true });
        } catch (err) {
          return NextResponse.json(
            { error: err instanceof Error ? err.message : "Delete failed" },
            { status: 400 },
          );
        }
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 },
        );
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Server error" },
      { status: 500 },
    );
  }
}
