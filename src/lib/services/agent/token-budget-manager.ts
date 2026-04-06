import { prisma } from "@/lib/db";

const COST_PER_1K_INPUT = 0.000003;  // $3/M tokens (Gemini Flash pricing)
const COST_PER_1K_OUTPUT = 0.000015; // $15/M tokens

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

  async isOverBudget(userId: string): Promise<boolean> {
    const limitUsd = parseFloat(process.env.TOKEN_BUDGET_MONTHLY_USD ?? "10.00");
    const usage = await this.getMonthlyUsage(userId);
    return usage.costUsd >= limitUsd;
  }
}

export const tokenBudgetManager = new TokenBudgetManager();
