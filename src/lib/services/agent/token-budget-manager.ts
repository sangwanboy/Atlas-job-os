import { prisma } from "@/lib/db";

const COST_PER_1K_INPUT = 0.000003;  // $3/M tokens (Gemini Flash pricing)
const COST_PER_1K_OUTPUT = 0.000015; // $15/M tokens

export type UserUsageSummary = {
  userId: string;
  name: string | null;
  email: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  limitUsd: number;
  usagePercent: number;
};

export class TokenBudgetManager {
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  checkResponseBudget(input: { message: string; budget: number }): { allowed: boolean; warning?: string } {
    const estimate = this.estimateTokens(input.message);
    if (estimate > input.budget) {
      return {
        allowed: false,
        warning: `Estimated ${estimate} tokens exceeds response budget ${input.budget}.`,
      };
    }
    if (estimate > input.budget * 0.8) {
      return {
        allowed: true,
        warning: `High token usage expected (${estimate}/${input.budget}).`,
      };
    }
    return { allowed: true };
  }

  async recordUsage(userId: string, inputTokens: number, outputTokens: number): Promise<void> {
    try {
      const costUsd =
        (inputTokens / 1000) * COST_PER_1K_INPUT +
        (outputTokens / 1000) * COST_PER_1K_OUTPUT;
      await prisma.tokenUsage.create({
        data: { userId, inputTokens, outputTokens, costUsd },
      });
    } catch (err) {
      // Non-fatal — don't block the response if usage tracking fails
      console.warn("[TokenBudget] Failed to record usage:", (err as Error).message);
    }
  }

  async getMonthlyUsage(userId: string): Promise<{ inputTokens: number; outputTokens: number; costUsd: number }> {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    try {
      const rows = await prisma.tokenUsage.findMany({
        where: { userId, date: { gte: start } },
        select: { inputTokens: true, outputTokens: true, costUsd: true },
      });
      return rows.reduce(
        (acc, r) => ({
          inputTokens: acc.inputTokens + r.inputTokens,
          outputTokens: acc.outputTokens + r.outputTokens,
          costUsd: acc.costUsd + r.costUsd,
        }),
        { inputTokens: 0, outputTokens: 0, costUsd: 0 }
      );
    } catch {
      return { inputTokens: 0, outputTokens: 0, costUsd: 0 };
    }
  }

  /** Get the global admin-configured budget from RuntimeSettingsRecord, falling back to env var */
  async getGlobalBudget(): Promise<number> {
    const envLimit = parseFloat(process.env.TOKEN_BUDGET_MONTHLY_USD ?? "10.00");
    try {
      const record = await prisma.runtimeSettingsRecord.findUnique({ where: { key: "global" } });
      if (record?.data && typeof record.data === "object") {
        const val = (record.data as Record<string, unknown>).monthlyBudgetUsd;
        if (typeof val === "number" && val > 0) return val;
      }
    } catch {
      // Fall back to env var
    }
    return envLimit;
  }

  /** Get the per-user budget override, falling back to global admin setting, then env var */
  async getUserBudget(userId: string): Promise<number> {
    try {
      const record = await prisma.runtimeSettingsRecord.findUnique({
        where: { key: `user_limit_${userId}` },
      });
      if (record?.data && typeof record.data === "object" && "monthlyBudgetUsd" in (record.data as Record<string, unknown>)) {
        const custom = (record.data as Record<string, unknown>).monthlyBudgetUsd;
        if (typeof custom === "number" && custom > 0) return custom;
      }
    } catch {
      // Fall through to global
    }
    return this.getGlobalBudget();
  }

  /** Set a per-user budget override */
  async setUserBudget(userId: string, monthlyBudgetUsd: number): Promise<void> {
    const key = `user_limit_${userId}`;
    await prisma.runtimeSettingsRecord.upsert({
      where: { key },
      create: { key, data: { monthlyBudgetUsd } },
      update: { data: { monthlyBudgetUsd } },
    });
  }

  async isOverBudget(userId: string): Promise<boolean> {
    const limitUsd = await this.getUserBudget(userId);
    const usage = await this.getMonthlyUsage(userId);
    return usage.costUsd >= limitUsd;
  }

  /** Get all users' monthly usage for the admin panel */
  async getAllUsersMonthlyUsage(): Promise<{ users: UserUsageSummary[]; totals: { inputTokens: number; outputTokens: number; costUsd: number } }> {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const globalLimit = await this.getGlobalBudget();

    try {
      // Get all users
      const allUsers = await prisma.user.findMany({
        select: { id: true, name: true, email: true },
      });

      // Get all token usage for current month
      const allUsage = await prisma.tokenUsage.findMany({
        where: { date: { gte: start } },
        select: { userId: true, inputTokens: true, outputTokens: true, costUsd: true },
      });

      // Get all per-user limit overrides
      const limitRecords = await prisma.runtimeSettingsRecord.findMany({
        where: { key: { startsWith: "user_limit_" } },
      });
      const limitMap = new Map<string, number>();
      for (const r of limitRecords) {
        const uid = r.key.replace("user_limit_", "");
        const data = r.data as Record<string, unknown> | null;
        if (data && typeof data.monthlyBudgetUsd === "number") {
          limitMap.set(uid, data.monthlyBudgetUsd);
        }
      }

      // Aggregate usage per user
      const usageMap = new Map<string, { inputTokens: number; outputTokens: number; costUsd: number }>();
      for (const row of allUsage) {
        const existing = usageMap.get(row.userId) ?? { inputTokens: 0, outputTokens: 0, costUsd: 0 };
        existing.inputTokens += row.inputTokens;
        existing.outputTokens += row.outputTokens;
        existing.costUsd += row.costUsd;
        usageMap.set(row.userId, existing);
      }

      // Build per-user summaries
      const users: UserUsageSummary[] = allUsers.map((u) => {
        const usage = usageMap.get(u.id) ?? { inputTokens: 0, outputTokens: 0, costUsd: 0 };
        const limitUsd = limitMap.get(u.id) ?? globalLimit;
        return {
          userId: u.id,
          name: u.name,
          email: u.email ?? "",
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          costUsd: usage.costUsd,
          limitUsd,
          usagePercent: limitUsd > 0 ? Math.min(100, Math.round((usage.costUsd / limitUsd) * 100)) : 0,
        };
      });

      // Sort by usage % descending
      users.sort((a, b) => b.usagePercent - a.usagePercent);

      const totals = users.reduce(
        (acc, u) => ({
          inputTokens: acc.inputTokens + u.inputTokens,
          outputTokens: acc.outputTokens + u.outputTokens,
          costUsd: acc.costUsd + u.costUsd,
        }),
        { inputTokens: 0, outputTokens: 0, costUsd: 0 }
      );

      return { users, totals };
    } catch (err) {
      console.error("[TokenBudget] Failed to get all users usage:", err);
      return { users: [], totals: { inputTokens: 0, outputTokens: 0, costUsd: 0 } };
    }
  }
}

export const tokenBudgetManager = new TokenBudgetManager();
