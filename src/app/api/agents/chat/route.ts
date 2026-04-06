import { NextResponse } from "next/server";
import { conversationOrchestrator } from "@/lib/services/agent/conversation-orchestrator";
import { tokenBudgetManager } from "@/lib/services/agent/token-budget-manager";
import { llmSettingsStore } from "@/lib/services/settings/llm-settings-store";
import { runtimeSettingsStore } from "@/lib/services/settings/runtime-settings-store";
import { chatRequestSchema } from "@/lib/utils/validation";
import { requireAuth, isNextResponse } from "@/lib/server/auth-helpers";
import { checkRateLimit } from "@/lib/redis";

export async function POST(request: Request) {
  try {
    const authResult = await requireAuth();
    if (isNextResponse(authResult)) return authResult;
    const { userId: settingsUserId } = authResult;

    // Rate limit: configurable via Settings → Runtime Controls → Rate Limit (requests/hr)
    const runtimeForRl = runtimeSettingsStore.get("global");
    const rlLimit = (runtimeForRl.settings as any).rateLimitPerHour ?? 100;
    const rl = await checkRateLimit("llm", settingsUserId, rlLimit);
    if (!rl.allowed) {
      const retryAfter = Math.ceil((rl.resetAt - Date.now()) / 1000);
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait before sending more messages." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    // Monthly token budget guard
    const overBudget = await tokenBudgetManager.isOverBudget(settingsUserId);
    if (overBudget) {
      return NextResponse.json(
        { error: "Monthly AI usage budget exceeded. Contact support to increase your limit." },
        { status: 429 }
      );
    }

    const json = (await request.json()) as Record<string, unknown>;

    const parsed = chatRequestSchema.parse({
      agentId: json.agentId,
      sessionId: json.sessionId,
      message: json.message,
      context: json.context,
    });

    const runtimeSettings = runtimeSettingsStore.get(settingsUserId).settings;
    const selection = llmSettingsStore.getRuntimeSelection(settingsUserId);
    const geminiKey = llmSettingsStore.getProviderApiKey("gemini", settingsUserId);
    const requestedProvider = selection.provider || "gemini";
    const selectedProvider = selection.apiKey ? requestedProvider : (geminiKey ? "gemini" : requestedProvider);
    const selectedApiKey = selectedProvider === "gemini" ? geminiKey ?? selection.apiKey : selection.apiKey;

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let closed = false;
        const onUpdate = (update: Record<string, unknown>) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(JSON.stringify(update) + "\n"));
          } catch {
            closed = true;
          }
        };

        try {
          // Flush immediately so the client sees the connection and shows the typing indicator
          onUpdate({ type: "status", status: "Thinking…" });

          const result = await conversationOrchestrator.run({
            agentId: parsed.agentId,
            sessionId: parsed.sessionId,
            userId: settingsUserId,
            message: parsed.message,
            preferredProvider: selectedProvider,
            preferredModel: selection.model,
            apiKey: selectedApiKey ?? undefined,
            strictAgentResponseMode: runtimeSettings.strictAgentResponseMode,
            onUpdate,
          });

          const promptTokens = tokenBudgetManager.estimateTokens(parsed.message);
          const completionTokens = tokenBudgetManager.estimateTokens(result.reply);

          void runtimeSettingsStore.trackUsage({
            provider: selectedProvider,
            promptTokens,
            completionTokens,
          }, settingsUserId);

          // Persist token usage to DB for monthly budget enforcement
          void tokenBudgetManager.recordUsage(settingsUserId, promptTokens, completionTokens);

          controller.enqueue(encoder.encode(JSON.stringify({ type: "final", result }) + "\n"));
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unexpected chat error";
          if (!closed) controller.enqueue(encoder.encode(JSON.stringify({ type: "error", error: message }) + "\n"));
        } finally {
          closed = true;
          try { controller.close(); } catch { /* already closed */ }
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected chat error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
