import { llmProviderCatalog } from "@/lib/services/settings/llm-catalog";
import { prisma } from "@/lib/db";
import type {
  LlmProvider,
  RuntimeSettingsResponse,
  RuntimeSettingsUpdatePayload,
  TokenUsageSummary,
} from "@/types/settings";

type ProviderUsageRuntime = {
  requests: number;
  promptTokens: number;
  completionTokens: number;
};

type RuntimeState = {
  monthlyTokenBudget: number;
  softLimitPercent: number;
  perResponseTokenCap: number;
  maxJobsPerSearch: number;
  outputPerPrompt: number;
  autoSummarizeOnHighUsage: boolean;
  strictLoopProtection: boolean;
  strictAgentResponseMode: boolean;
  allowProviderFallback: boolean;
  redactPiiInMemory: boolean;
  usagePeriodStart: string;
  usageByProvider: Record<LlmProvider, ProviderUsageRuntime>;
  updatedAt: string;
};

// In-memory read-through cache keyed by userId/"global" — avoids a DB round-trip on every LLM call
const globalCache = globalThis as unknown as {
  runtimeSettingsCache?: Map<string, RuntimeState>;
};
const cache = globalCache.runtimeSettingsCache ?? new Map<string, RuntimeState>();
globalCache.runtimeSettingsCache = cache;

function createDefaultState(): RuntimeState {
  const usageByProvider = Object.fromEntries(
    llmProviderCatalog.map((provider) => [
      provider.provider,
      { requests: 0, promptTokens: 0, completionTokens: 0 },
    ]),
  ) as Record<LlmProvider, ProviderUsageRuntime>;

  return {
    monthlyTokenBudget: 1_000_000,
    softLimitPercent: 85,
    perResponseTokenCap: 8_192,
    maxJobsPerSearch: 20,
    outputPerPrompt: 10,
    autoSummarizeOnHighUsage: true,
    strictLoopProtection: true,
    strictAgentResponseMode: true,
    allowProviderFallback: true,
    redactPiiInMemory: true,
    usagePeriodStart: new Date().toISOString(),
    usageByProvider,
    updatedAt: new Date().toISOString(),
  };
}

function migrate(state: RuntimeState): RuntimeState {
  if (state.strictAgentResponseMode === undefined) state.strictAgentResponseMode = true;
  if ((state as any).maxJobsPerSearch === undefined) (state as any).maxJobsPerSearch = 20;
  if ((state as any).outputPerPrompt === undefined) (state as any).outputPerPrompt = 10;
  return state;
}

async function loadFromDb(key: string): Promise<RuntimeState> {
  const record = await prisma.runtimeSettingsRecord.findUnique({ where: { key } });
  if (record) {
    return migrate(record.data as unknown as RuntimeState);
  }
  const defaults = createDefaultState();
  await prisma.runtimeSettingsRecord.create({ data: { key, data: defaults as any } });
  return defaults;
}

async function resolveState(key: string): Promise<RuntimeState> {
  const cached = cache.get(key);
  if (cached) return cached;
  const state = await loadFromDb(key);
  cache.set(key, state);
  return state;
}

async function persistState(key: string, state: RuntimeState): Promise<void> {
  state.updatedAt = new Date().toISOString();
  cache.set(key, state);
  await prisma.runtimeSettingsRecord.upsert({
    where: { key },
    create: { key, data: state as any },
    update: { data: state as any },
  });
}

function toUsageSummary(state: RuntimeState): TokenUsageSummary {
  const byProvider = llmProviderCatalog.map((provider) => {
    const usage = state.usageByProvider[provider.provider];
    return {
      provider: provider.provider,
      requests: usage.requests,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.promptTokens + usage.completionTokens,
    };
  });

  const requests = byProvider.reduce((sum, item) => sum + item.requests, 0);
  const promptTokens = byProvider.reduce((sum, item) => sum + item.promptTokens, 0);
  const completionTokens = byProvider.reduce((sum, item) => sum + item.completionTokens, 0);

  return {
    requests,
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    periodStart: state.usagePeriodStart,
    periodEnd: new Date().toISOString(),
    byProvider,
  };
}

function toResponse(state: RuntimeState): RuntimeSettingsResponse {
  return {
    settings: {
      monthlyTokenBudget: state.monthlyTokenBudget,
      softLimitPercent: state.softLimitPercent,
      perResponseTokenCap: state.perResponseTokenCap,
      maxJobsPerSearch: state.maxJobsPerSearch ?? 20,
      outputPerPrompt: state.outputPerPrompt ?? 10,
      autoSummarizeOnHighUsage: state.autoSummarizeOnHighUsage,
      strictLoopProtection: state.strictLoopProtection,
      strictAgentResponseMode: state.strictAgentResponseMode ?? true,
      allowProviderFallback: state.allowProviderFallback,
      redactPiiInMemory: state.redactPiiInMemory,
    },
    usage: toUsageSummary(state),
    updatedAt: state.updatedAt,
  };
}

export class RuntimeSettingsStore {
  // Synchronous get — uses cache only (safe after first async load)
  get(key = "local-dev-user"): RuntimeSettingsResponse {
    const cached = cache.get(key);
    if (cached) return toResponse(cached);
    // Cache miss: return defaults and trigger async load to warm cache
    const defaults = createDefaultState();
    void loadFromDb(key).then((state) => cache.set(key, state));
    return toResponse(defaults);
  }

  async getAsync(key = "local-dev-user"): Promise<RuntimeSettingsResponse> {
    return toResponse(await resolveState(key));
  }

  async update(payload: RuntimeSettingsUpdatePayload, key = "local-dev-user"): Promise<RuntimeSettingsResponse> {
    const state = await resolveState(key);

    state.monthlyTokenBudget = payload.monthlyTokenBudget;
    state.softLimitPercent = payload.softLimitPercent;
    state.perResponseTokenCap = payload.perResponseTokenCap;
    state.maxJobsPerSearch = payload.maxJobsPerSearch ?? 20;
    state.outputPerPrompt = payload.outputPerPrompt ?? 10;
    state.autoSummarizeOnHighUsage = payload.autoSummarizeOnHighUsage;
    state.strictLoopProtection = payload.strictLoopProtection;
    state.strictAgentResponseMode = payload.strictAgentResponseMode;
    state.allowProviderFallback = payload.allowProviderFallback;
    state.redactPiiInMemory = payload.redactPiiInMemory;

    await persistState(key, state);
    return toResponse(state);
  }

  async trackUsage(
    input: { provider: LlmProvider; promptTokens: number; completionTokens: number },
    key = "local-dev-user",
  ) {
    const state = await resolveState(key);
    const providerUsage = state.usageByProvider[input.provider];

    providerUsage.requests += 1;
    providerUsage.promptTokens += Math.max(0, Math.floor(input.promptTokens));
    providerUsage.completionTokens += Math.max(0, Math.floor(input.completionTokens));

    await persistState(key, state);
  }
}

export const runtimeSettingsStore = new RuntimeSettingsStore();
