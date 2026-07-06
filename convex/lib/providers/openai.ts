/// <reference types="node" />

"use node";

import OpenAI from "openai";
import { toFile } from "openai/uploads";
import type { AiProviderAdapter, EmbeddingsResult, ResolvedRoute } from "./types";

// ─── Platform client (cached) ─────────────────────────────────────────────────

let cachedPlatformClient: OpenAI | null | undefined;

function getPlatformApiKey() {
  return process.env.OPENAI_API_KEY ?? process.env.CONVEX_OPENAI_API_KEY ?? null;
}

function getPlatformBaseURL() {
  return process.env.OPENAI_BASE_URL ?? process.env.CONVEX_OPENAI_BASE_URL;
}

function getClientForCredentials(args?: { apiKey?: string; baseURL?: string }): OpenAI | null {
  if (args?.apiKey) {
    return new OpenAI({
      apiKey: args.apiKey,
      ...(args.baseURL ? { baseURL: args.baseURL } : {}),
    });
  }

  if (cachedPlatformClient !== undefined) {
    return cachedPlatformClient;
  }

  const apiKey = getPlatformApiKey();
  if (!apiKey) {
    cachedPlatformClient = null;
    return null;
  }

  cachedPlatformClient = new OpenAI({
    apiKey,
    ...(getPlatformBaseURL() ? { baseURL: getPlatformBaseURL() } : {}),
  });
  return cachedPlatformClient;
}

/**
 * Direct access to the platform OpenAI client.
 * Use only for explicit platform-level operations that intentionally bypass
 * user routing (e.g. the Gemini → GPT vision fallback in attachmentExtraction).
 */
export function getOpenAIClientDirect(): OpenAI | null {
  return getClientForCredentials();
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

export const openAiAdapter: AiProviderAdapter = {
  provider: "openai",

  hasPlatformCredentials() {
    return Boolean(getPlatformApiKey());
  },

  async chatCompletion({ route, request }) {
    const client = getClientForCredentials({ apiKey: route.apiKey, baseURL: route.baseUrl });
    if (!client) throw new Error("OpenAI client is not available for this route.");
    const response = await client.chat.completions.create({ ...request, model: route.model });
    return response as OpenAI.Chat.Completions.ChatCompletion;
  },

  async chatCompletionStream({ route, request, onDelta }) {
    const client = getClientForCredentials({ apiKey: route.apiKey, baseURL: route.baseUrl });
    if (!client) throw new Error("OpenAI client is not available for this route.");
    // The non-streaming param type carries stream?: false — drop it so the
    // stream helper's stream: true discriminant applies.
    const { stream: _stream, ...params } = request;
    const stream = client.chat.completions.stream({
      ...params,
      model: route.model,
      stream_options: { include_usage: true },
    });
    stream.on("content", (delta) => {
      onDelta(delta);
    });
    return await stream.finalChatCompletion();
  },

  async embedTexts({ route, input }): Promise<EmbeddingsResult> {
    const client = getClientForCredentials({ apiKey: route.apiKey, baseURL: route.baseUrl });
    if (!client) throw new Error("OpenAI client is not available for this route.");
    const response = await client.embeddings.create({ model: route.model, input });
    return {
      embeddings: response.data.map((item) => item.embedding),
      usage: {
        prompt_tokens: response.usage?.prompt_tokens,
        total_tokens: response.usage?.total_tokens,
      },
    };
  },

  async transcribeAudio({ route, audioBase64, format, language }) {
    const client = getClientForCredentials({ apiKey: route.apiKey, baseURL: route.baseUrl });
    if (!client) throw new Error("OpenAI client is not available for this route.");
    const audio = Buffer.from(audioBase64, "base64");
    const file = await toFile(audio, `recording.${format}`);
    return await client.audio.transcriptions.create({
      file,
      model: route.model,
      ...(language ? { language } : {}),
    });
  },
};
