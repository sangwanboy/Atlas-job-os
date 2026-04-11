import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { tokenBudgetManager } from "@/lib/services/agent/token-budget-manager";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") return null;
  return session;
}

export async function PUT(req: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  try {
    const body = (await req.json()) as { userId?: string; monthlyBudgetUsd?: number };
    if (!body.userId || typeof body.monthlyBudgetUsd !== "number" || body.monthlyBudgetUsd <= 0) {
      return NextResponse.json({ error: "Invalid userId or monthlyBudgetUsd" }, { status: 400 });
    }

    await tokenBudgetManager.setUserBudget(body.userId, body.monthlyBudgetUsd);
    return NextResponse.json({ success: true, userId: body.userId, monthlyBudgetUsd: body.monthlyBudgetUsd });
  } catch (err) {
    console.error("[Admin/UserLimit] Failed:", err);
    return NextResponse.json({ error: "Failed to set user limit" }, { status: 500 });
  }
}
