import { z } from "zod";

export const runtimeSettingsUpdateSchema = z.object({
  monthlyTokenBudget: z.number().int().min(10000).max(100000000),
  softLimitPercent: z.number().int().min(50).max(99),
  perResponseTokenCap: z.number().int().min(256).max(128000),
  maxJobsPerSearch: z.number().int().min(1).max(200).optional().default(20),
  outputPerPrompt: z.number().int().min(1).max(100).optional().default(10),
  autoSummarizeOnHighUsage: z.boolean(),
  strictLoopProtection: z.boolean(),
  strictAgentResponseMode: z.boolean().optional().default(true),
  allowProviderFallback: z.boolean(),
  redactPiiInMemory: z.boolean(),
});
