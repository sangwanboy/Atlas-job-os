import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { tokenBudgetManager } from "@/lib/services/agent/token-budget-manager";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") return null;
  return session;
}

export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  try {
    const data = await tokenBudgetManager.getAllUsersMonthlyUsage();
    const globalLimit = await tokenBudgetManager.getGlobalBudget();
    return NextResponse.json({ ...data, globalLimit });
  } catch (err) {
    console.error("[Admin/TokenUsage] Failed:", err);
    return NextResponse.json({ error: "Failed to fetch token usage" }, { status: 500 });
  }
}
