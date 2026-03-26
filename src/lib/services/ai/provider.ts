import { env } from "@/lib/config/env";

export type AiProviderName = "openai" | "anthropic" | "gemini" | "groq" | "mistral" | "cohere" | "perplexity" | "xai" | "deepseek" | "together" | "openrouter";

export type AiChatRequest = {
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  temperature?: number;
  apiKey?: string;
};

export type AiChatResponse = {
  text: string;
  provider: AiProviderName;
  model: string;
};

export interface AiProvider {
  chat(request: AiChatRequest): Promise<AiChatResponse>;
}

class MockAiProvider implements AiProvider {
  constructor(private readonly providerName: AiProviderName) {}

  async chat(request: AiChatRequest): Promise<AiChatResponse> {
    const response = `${request.userPrompt}\n\n[Mock ${this.providerName} response generated for v1 scaffold.]`;
    return {
      text: response,
      provider: this.providerName,
      model: request.model ?? env.DEFAULT_AI_MODEL,
    };
  }
}

type GeminiCandidate = {
  content?: {
    parts?: Array<{ text?: string }>;
  };
};

type GeminiResponse = {
  candidates?: GeminiCandidate[];
};

// Fallback chain: if preferred model is rate-limited (429/503), try these in order
// All confirmed available via ListModels API as of 2026-03-25
const GEMINI_FALLBACK_MODELS = [
  "gemini-3.1-flash-lite-preview",  // same 3.1 family, confirmed working
  "gemini-3-flash-preview",          // 3.x family, confirmed working
  "gemini-2.5-pro",                  // stable, confirmed working
  "gemini-2.5-flash",                // fast stable fallback
];

async function callGemini(
  apiKey: string,
  model: string,
  body: object,
): Promise<{ ok: boolean; text?: string; status?: number; errorText?: string }> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  if (response.ok) {
    const json = (await response.json()) as GeminiResponse;
    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join(" ").trim();
    return { ok: true, text: text || "I received an empty response from Gemini." };
  }

  const errorText = await response.text();
  return { ok: false, status: response.status, errorText };
}

class GeminiApiProvider implements AiProvider {
  async chat(request: AiChatRequest): Promise<AiChatResponse> {
    const apiKey = request.apiKey || env.GEMINI_API_KEY;
    const preferredModel = request.model ?? env.DEFAULT_AI_MODEL ?? "gemini-3.1-pro-preview";

    if (!apiKey) {
      const fallback = await new MockAiProvider("gemini").chat(request);
      return {
        ...fallback,
        text: `${fallback.text}\n[Gemini API key missing, using mock response.]`,
      };
    }

    const requestBody = {
      contents: [
        {
          role: "user",
          parts: [{ text: `${request.systemPrompt}\n\nUser: ${request.userPrompt}` }],
        },
      ],
      generationConfig: { temperature: request.temperature ?? 0.4 },
    };

    // Try preferred model first with backoff, then fall through to fallbacks
    const modelsToTry = [preferredModel, ...GEMINI_FALLBACK_MODELS.filter((m) => m !== preferredModel)];

    for (const model of modelsToTry) {
      let lastStatus = 0;
      let lastError = "";

      for (let attempt = 0; attempt < 3; attempt++) {
        const result = await callGemini(apiKey, model, requestBody);
        if (result.ok) {
          if (model !== preferredModel) {
            console.warn(`[GeminiProvider] Fell back to ${model} (preferred: ${preferredModel})`);
          }
          return { text: result.text!, provider: "gemini", model };
        }

        lastStatus = result.status ?? 0;
        lastError = result.errorText ?? "";

        // Only retry on 429 (rate limit) or 503 (overloaded)
        if ((lastStatus === 429 || lastStatus === 503) && attempt < 2) {
          const delay = Math.pow(2, attempt) * 2000 + Math.random() * 500;
          console.warn(`[GeminiProvider] ${model} returned ${lastStatus}, retrying in ${Math.round(delay)}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        break;
      }

      // Hard error on the PREFERRED model (not a rate-limit) — stop immediately
      if (model === preferredModel && lastStatus !== 429 && lastStatus !== 503 && lastStatus >= 400 && lastStatus < 500) {
        return {
          text: `Gemini request failed (${lastStatus}): ${lastError.slice(0, 300)}`,
          provider: "gemini",
          model: preferredModel,
        };
      }

      // Rate-limited or bad fallback model — try the next one
      console.warn(`[GeminiProvider] ${model} failed (${lastStatus}), trying next fallback...`);
    }

    return {
      text: `Gemini is currently overloaded or rate-limited. Please try again in a moment.`,
      provider: "gemini",
      model: preferredModel,
    };
  }
}

const providers: Record<AiProviderName, AiProvider> = {
  openai: new MockAiProvider("openai"),
  anthropic: new MockAiProvider("anthropic"),
  gemini: new GeminiApiProvider(),
  groq: new MockAiProvider("groq"),
  mistral: new MockAiProvider("mistral"),
  cohere: new MockAiProvider("cohere"),
  perplexity: new MockAiProvider("perplexity"),
  xai: new MockAiProvider("xai"),
  deepseek: new MockAiProvider("deepseek"),
  together: new MockAiProvider("together"),
  openrouter: new MockAiProvider("openrouter"),
};

export function getAiProvider(name?: AiProviderName): AiProvider {
  return providers[name ?? env.DEFAULT_AI_PROVIDER];
}
