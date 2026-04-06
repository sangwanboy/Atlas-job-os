import { env } from "@/lib/config/env";
import { GoogleAuth } from "google-auth-library";

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
  chatStream?(request: AiChatRequest, onToken: (text: string) => void): Promise<AiChatResponse>;
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
const GEMINI_FALLBACK_MODELS = [
  "gemini-3.1-flash-lite-preview",
  "gemini-3.1-pro-preview",
  "gemini-3-flash-preview",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite-preview-06-17",
];

// Cached GoogleAuth + token (service account)
let _vertexAuth: GoogleAuth | null = null;
let _vertexToken: string | null = null;
let _vertexTokenExpiresAt = 0;

function getVertexAuth(credentialsPath: string): GoogleAuth {
  if (!_vertexAuth) {
    _vertexAuth = new GoogleAuth({
      keyFile: credentialsPath,
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
  }
  return _vertexAuth;
}

async function getVertexToken(credentialsPath: string): Promise<string> {
  if (_vertexToken && Date.now() < _vertexTokenExpiresAt - 60_000) {
    return _vertexToken;
  }
  const auth = getVertexAuth(credentialsPath);
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  if (!tokenResponse.token) throw new Error("Failed to obtain Vertex AI token");
  _vertexToken = tokenResponse.token;
  _vertexTokenExpiresAt = Date.now() + 55 * 60 * 1000;
  return _vertexToken;
}

async function callVertexAI(
  project: string,
  location: string,
  credentialsPath: string,
  model: string,
  body: object,
): Promise<{ ok: boolean; text?: string; status?: number; errorText?: string }> {
  const token = await getVertexToken(credentialsPath);

  // Global endpoint has no region prefix in the hostname
  const host = location === "global"
    ? "aiplatform.googleapis.com"
    : `${location}-aiplatform.googleapis.com`;
  const url = `https://${host}/v1/projects/${project}/locations/${location}/publishers/google/models/${encodeURIComponent(model)}:generateContent`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (response.ok) {
    const json = (await response.json()) as GeminiResponse;
    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join(" ").trim();
    return { ok: true, text: text || "I received an empty response from Vertex AI." };
  }

  const errorText = await response.text();
  return { ok: false, status: response.status, errorText };
}

async function callGeminiAPI(
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
    const preferredModel = request.model ?? env.DEFAULT_AI_MODEL ?? "gemini-3.1-flash-lite-preview";
    const vertexProject = env.VERTEX_AI_PROJECT;
    const vertexLocation = env.VERTEX_AI_LOCATION ?? "global";
    const vertexCreds = env.GOOGLE_APPLICATION_CREDENTIALS;
    const useVertex = !!(vertexProject && vertexCreds);
    const apiKey = request.apiKey || env.GEMINI_API_KEY;

    if (!useVertex && !apiKey) {
      const fallback = await new MockAiProvider("gemini").chat(request);
      return {
        ...fallback,
        text: `${fallback.text}\n[No Gemini API key or Vertex AI config, using mock response.]`,
      };
    }

    const requestBody = {
      system_instruction: { parts: [{ text: request.systemPrompt }] },
      contents: [
        {
          role: "user",
          parts: [{ text: request.userPrompt }],
        },
      ],
      generationConfig: { temperature: request.temperature ?? 0.4 },
    };

    const modelsToTry = [preferredModel, ...GEMINI_FALLBACK_MODELS.filter((m) => m !== preferredModel)];

    for (const model of modelsToTry) {
      let lastStatus = 0;
      let lastError = "";

      for (let attempt = 0; attempt < 3; attempt++) {
        const result = useVertex
          ? await callVertexAI(vertexProject!, vertexLocation, vertexCreds!, model, requestBody)
          : await callGeminiAPI(apiKey!, model, requestBody);

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

      // Hard error on the PREFERRED model (not rate-limit) — stop immediately
      if (model === preferredModel && lastStatus !== 429 && lastStatus !== 503 && lastStatus >= 400 && lastStatus < 500) {
        return {
          text: `Gemini request failed (${lastStatus}): ${lastError.slice(0, 300)}`,
          provider: "gemini",
          model: preferredModel,
        };
      }

      console.warn(`[GeminiProvider] ${model} failed (${lastStatus}), trying next fallback...`);
    }

    return {
      text: `Gemini is currently overloaded or rate-limited. Please try again in a moment.`,
      provider: "gemini",
      model: preferredModel,
    };
  }

  async chatStream(request: AiChatRequest, onToken: (text: string) => void): Promise<AiChatResponse> {
    const preferredModel = request.model ?? env.DEFAULT_AI_MODEL ?? "gemini-3.1-flash-lite-preview";
    const vertexProject = env.VERTEX_AI_PROJECT;
    const vertexLocation = env.VERTEX_AI_LOCATION ?? "global";
    const vertexCreds = env.GOOGLE_APPLICATION_CREDENTIALS;
    const useVertex = !!(vertexProject && vertexCreds);
    const apiKey = request.apiKey || env.GEMINI_API_KEY;

    if (!useVertex && !apiKey) {
      const fallback = await this.chat(request);
      onToken(fallback.text);
      return fallback;
    }

    const requestBody = {
      system_instruction: { parts: [{ text: request.systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: request.userPrompt }] }],
      generationConfig: { temperature: request.temperature ?? 0.4 },
    };

    const modelsToTry = [preferredModel, ...GEMINI_FALLBACK_MODELS.filter((m) => m !== preferredModel)];

    for (const model of modelsToTry) {
      try {
        let streamUrl: string;
        const headers: Record<string, string> = { "Content-Type": "application/json" };

        if (useVertex) {
          const token = await getVertexToken(vertexCreds!);
          const host = vertexLocation === "global" ? "aiplatform.googleapis.com" : `${vertexLocation}-aiplatform.googleapis.com`;
          streamUrl = `https://${host}/v1/projects/${vertexProject}/locations/${vertexLocation}/publishers/google/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
          headers["Authorization"] = `Bearer ${token}`;
        } else {
          streamUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey!)}`;
        }

        const response = await fetch(streamUrl, { method: "POST", headers, body: JSON.stringify(requestBody) });
        if (!response.ok || !response.body) {
          const status = response.status;
          if (status === 429 || status === 503) continue; // try next model
          break;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let fullText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (!data || data === "[DONE]") continue;
            try {
              const json = JSON.parse(data) as GeminiResponse;
              const chunk = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
              if (chunk) {
                fullText += chunk;
                // Split chunk into word tokens and emit with typing delay
                onToken(chunk);
              }
            } catch { /* malformed SSE chunk — skip */ }
          }
        }

        if (fullText) return { text: fullText, provider: "gemini", model };
      } catch { continue; }
    }

    // SSE failed — fall back to non-streaming
    const fallback = await this.chat(request);
    onToken(fallback.text);
    return fallback;
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
