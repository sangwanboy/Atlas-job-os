/**
 * Shared Vertex AI client for multimodal and text generation calls.
 * Uses service account credentials — does NOT require a Gemini API key.
 */

import { env } from "@/lib/config/env";

let _auth: import("google-auth-library").GoogleAuth | null = null;
let _cachedToken: string | null = null;
let _tokenExpiresAt = 0;

async function getAccessToken(): Promise<string> {
  // Return cached token if still valid (with 60s buffer)
  if (_cachedToken && Date.now() < _tokenExpiresAt - 60_000) {
    return _cachedToken;
  }

  const credPath = env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credPath) throw new Error("GOOGLE_APPLICATION_CREDENTIALS not set");

  if (!_auth) {
    const { GoogleAuth } = await import("google-auth-library");
    _auth = new GoogleAuth({
      keyFile: credPath,
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
  }

  const client = await _auth.getClient();
  const tokenResponse = await client.getAccessToken();
  if (!tokenResponse.token) throw new Error("Failed to get Vertex AI access token");

  _cachedToken = tokenResponse.token;
  // Google tokens expire in 1 hour; cache for 55 minutes
  _tokenExpiresAt = Date.now() + 55 * 60 * 1000;

  return _cachedToken;
}

type VertexPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

export type VertexRequest = {
  parts: VertexPart[];
  model?: string;
  temperature?: number;
  responseMimeType?: string;
};

export type VertexResponse = {
  ok: boolean;
  text?: string;
  error?: string;
};

export async function callVertexMultimodal(req: VertexRequest): Promise<VertexResponse> {
  const project = env.VERTEX_AI_PROJECT;
  const location = env.VERTEX_AI_LOCATION ?? "global";
  const model = req.model ?? env.DEFAULT_AI_MODEL ?? "gemini-3-flash-preview";

  if (!project) throw new Error("VERTEX_AI_PROJECT not set");

  const token = await getAccessToken();

  const host = location === "global"
    ? "aiplatform.googleapis.com"
    : `${location}-aiplatform.googleapis.com`;

  const url = `https://${host}/v1/projects/${project}/locations/${location}/publishers/google/models/${encodeURIComponent(model)}:generateContent`;

  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: req.parts }],
    generationConfig: {
      temperature: req.temperature ?? 0.1,
      ...(req.responseMimeType ? { responseMimeType: req.responseMimeType } : {}),
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    return { ok: false, error: `Vertex AI ${response.status}: ${err.slice(0, 300)}` };
  }

  const json = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? "";
  if (!text) return { ok: false, error: "Vertex AI returned empty response" };

  return { ok: true, text };
}
