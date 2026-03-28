import { NextResponse } from "next/server";
import { conversationOrchestrator } from "@/lib/services/agent/conversation-orchestrator";
import { tokenBudgetManager } from "@/lib/services/agent/token-budget-manager";
import { llmSettingsStore } from "@/lib/services/settings/llm-settings-store";
import { runtimeSettingsStore } from "@/lib/services/settings/runtime-settings-store";
import { chatRequestSchema } from "@/lib/utils/validation";

export async function POST(request: Request) {
  try {
    const json = (await request.json()) as Record<string, unknown>;

    const parsed = chatRequestSchema.parse({
      agentId: json.agentId,
      sessionId: json.sessionId,
      message: json.message,
      context: json.context,
    });

    const userId = typeof json.userId === "string" ? json.userId : undefined;
    const settingsUserId = userId ?? "local-dev-user";
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
          
          runtimeSettingsStore.trackUsage({
            provider: selectedProvider,
            promptTokens,
            completionTokens,
          }, settingsUserId);

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
