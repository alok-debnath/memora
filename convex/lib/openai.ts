"use node";

import OpenAI from "openai";
import { toFile } from "openai/uploads";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";

export const OPENAI_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini";
export const OPENAI_EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
export const OPENAI_TRANSCRIPTION_MODEL =
  process.env.OPENAI_TRANSCRIPTION_MODEL ?? "gpt-4o-mini-transcribe";

type UsageRecorderCtx = Pick<ActionCtx, "runMutation">;
type AiVisibility = "user_visible" | "background";
type AnalyticsLink = {
  chatTurnId?: Id<"chatMessages">;
  chatMessageId?: Id<"chatMessages">;
  conversationId?: string;
};

type OpenAIFeature =
  | "memory_chat"
  | "memory_search"
  | "memory_processing"
  | "memory_capture"
  | "diary_processing"
  | "topic_management"
  | "conflict_detection"
  | "attachment_extraction"
  | "audio_transcription";

type ChatUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

type PriceConfig = {
  inputUsdPer1M?: number;
  outputUsdPer1M?: number;
  audioUsdPerMinute?: number;
};

const OPENAI_PRICING: Record<string, PriceConfig> = {
  "gpt-4o": { inputUsdPer1M: 5, outputUsdPer1M: 15 },
  "gpt-4o-mini": { inputUsdPer1M: 0.15, outputUsdPer1M: 0.6 },
  "gpt-4o-mini-transcribe": { audioUsdPerMinute: 0.006 },
  "text-embedding-3-small": { inputUsdPer1M: 0.02 },
};

let cachedClient: OpenAI | null | undefined;

function getApiKey() {
  return process.env.OPENAI_API_KEY ?? process.env.CONVEX_OPENAI_API_KEY ?? null;
}

function getBaseURL() {
  return process.env.OPENAI_BASE_URL ?? process.env.CONVEX_OPENAI_BASE_URL;
}

export function hasOpenAI() {
  return Boolean(getApiKey());
}

export function getOpenAIClient() {
  if (cachedClient !== undefined) {
    return cachedClient;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    cachedClient = null;
    return cachedClient;
  }

  cachedClient = new OpenAI({
    apiKey,
    ...(getBaseURL() ? { baseURL: getBaseURL() } : {}),
  });
  return cachedClient;
}

export function requireOpenAI() {
  const client = getOpenAIClient();
  if (!client) {
    throw new Error("OPENAI_API_KEY is not configured in Convex.");
  }
  return client;
}

function getChatPricing(model: string) {
  return OPENAI_PRICING[model] ?? null;
}

function tokensToMicros(tokens: number, pricePerMillion: number) {
  return Math.round((tokens / 1_000_000) * pricePerMillion * 1_000_000);
}

function minutesToMicros(minutes: number, pricePerMinute: number) {
  return Math.round(minutes * pricePerMinute * 1_000_000);
}

async function recordOpenAiUsage(
  ctx: UsageRecorderCtx,
  args: {
    userId: Id<"users">;
    feature: OpenAIFeature;
    operation: string;
    model: string;
    status: "success" | "error";
    latencyMs: number;
    usage?: ChatUsage;
    audioSeconds?: number;
    costUsdMicros?: number;
    costAvailability: "estimated" | "exact" | "unavailable";
    stage?: string;
    visibility?: AiVisibility;
    metadata?: Record<string, string>;
    link?: AnalyticsLink;
  },
) {
  await ctx.runMutation(internal.analytics.recordAiUsage, {
    userId: args.userId,
    chatTurnId: args.link?.chatTurnId,
    chatMessageId: args.link?.chatMessageId,
    conversationId: args.link?.conversationId,
    provider: "openai",
    model: args.model,
    operation: args.operation,
    feature: args.feature,
    status: args.status,
    latencyMs: args.latencyMs,
    inputTokens: args.usage?.prompt_tokens,
    outputTokens: args.usage?.completion_tokens,
    totalTokens: args.usage?.total_tokens,
    audioSeconds: args.audioSeconds,
    costUsdMicros: args.costUsdMicros,
    costAvailability: args.costAvailability,
    stage: args.stage,
    visibility: args.visibility,
    metadata: args.metadata,
  });
}

export function extractTextContent(
  content: string | Array<{ type?: string; text?: string }> | null | undefined,
) {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((part) =>
      typeof part === "object" && part?.type === "text" && typeof part.text === "string"
        ? part.text
        : "",
    )
    .join("")
    .trim();
}

export function safeJsonParse<T>(raw: string): T | null {
  try {
    const trimmed = raw.trim();
    const json = trimmed.startsWith("```")
      ? trimmed
          .replace(/^```(?:json)?/i, "")
          .replace(/```$/, "")
          .trim()
      : trimmed;
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

export async function embedTexts(input: string | string[]) {
  const client = requireOpenAI();
  const response = await client.embeddings.create({
    model: OPENAI_EMBEDDING_MODEL,
    input,
  });
  return response.data.map((item) => item.embedding);
}

export async function embedText(input: string) {
  const [embedding] = await embedTexts(input);
  return embedding;
}

export async function transcribeBase64Audio(args: {
  audioBase64: string;
  format: string;
  language?: string;
}) {
  const client = requireOpenAI();
  const audio = Buffer.from(args.audioBase64, "base64");
  const file = await toFile(audio, `recording.${args.format}`);

  return await client.audio.transcriptions.create({
    file,
    model: OPENAI_TRANSCRIPTION_MODEL,
    ...(args.language ? { language: args.language } : {}),
  });
}

export async function trackedChatCompletion(
  ctx: UsageRecorderCtx,
  args: {
    userId: Id<"users">;
    feature: OpenAIFeature;
    model?: string;
    stage?: string;
    visibility?: AiVisibility;
    metadata?: Record<string, string>;
    link?: AnalyticsLink;
    request: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming;
  },
) {
  const client = requireOpenAI();
  const model =
    args.model ?? (typeof args.request.model === "string" ? args.request.model : OPENAI_CHAT_MODEL);
  const startedAt = Date.now();
  try {
    const response = await client.chat.completions.create(args.request);
    const usage = response.usage as ChatUsage | undefined;
    const pricing = getChatPricing(model);
    const costUsdMicros =
      pricing && usage
        ? tokensToMicros(usage.prompt_tokens ?? 0, pricing.inputUsdPer1M ?? 0) +
          tokensToMicros(usage.completion_tokens ?? 0, pricing.outputUsdPer1M ?? 0)
        : undefined;
    await recordOpenAiUsage(ctx, {
      userId: args.userId,
      feature: args.feature,
      operation: "chat_completion",
      model,
      status: "success",
      latencyMs: Date.now() - startedAt,
      usage,
      costUsdMicros,
      costAvailability: usage ? "estimated" : "unavailable",
      stage: args.stage ?? "chat_completion",
      visibility: args.visibility ?? "background",
      metadata: args.metadata,
      link: args.link,
    });
    return response;
  } catch (error) {
    await recordOpenAiUsage(ctx, {
      userId: args.userId,
      feature: args.feature,
      operation: "chat_completion",
      model,
      status: "error",
      latencyMs: Date.now() - startedAt,
      costAvailability: "unavailable",
      stage: args.stage ?? "chat_completion",
      visibility: args.visibility ?? "background",
      metadata: args.metadata,
      link: args.link,
    });
    throw error;
  }
}

export async function trackedEmbedText(
  ctx: UsageRecorderCtx,
  args: {
    userId: Id<"users">;
    feature: OpenAIFeature;
    input: string;
    stage?: string;
    visibility?: AiVisibility;
    metadata?: Record<string, string>;
    link?: AnalyticsLink;
  },
) {
  return (
    await trackedEmbedTexts(ctx, {
      userId: args.userId,
      feature: args.feature,
      input: args.input,
      stage: args.stage,
      visibility: args.visibility,
      metadata: args.metadata,
      link: args.link,
    })
  )[0];
}

export async function trackedEmbedTexts(
  ctx: UsageRecorderCtx,
  args: {
    userId: Id<"users">;
    feature: OpenAIFeature;
    input: string | string[];
    stage?: string;
    visibility?: AiVisibility;
    metadata?: Record<string, string>;
    link?: AnalyticsLink;
  },
) {
  const client = requireOpenAI();
  const startedAt = Date.now();
  try {
    const response = await client.embeddings.create({
      model: OPENAI_EMBEDDING_MODEL,
      input: args.input,
    });
    const usage = {
      prompt_tokens: response.usage?.prompt_tokens,
      total_tokens: response.usage?.total_tokens,
    };
    const pricing = getChatPricing(OPENAI_EMBEDDING_MODEL);
    const costUsdMicros =
      pricing && usage.prompt_tokens
        ? tokensToMicros(usage.prompt_tokens, pricing.inputUsdPer1M ?? 0)
        : undefined;
    await recordOpenAiUsage(ctx, {
      userId: args.userId,
      feature: args.feature,
      operation: "embedding",
      model: OPENAI_EMBEDDING_MODEL,
      status: "success",
      latencyMs: Date.now() - startedAt,
      usage,
      costUsdMicros,
      costAvailability: usage.prompt_tokens ? "estimated" : "unavailable",
      stage: args.stage ?? "embedding",
      visibility: args.visibility ?? "background",
      metadata: args.metadata,
      link: args.link,
    });
    return response.data.map((item) => item.embedding);
  } catch (error) {
    await recordOpenAiUsage(ctx, {
      userId: args.userId,
      feature: args.feature,
      operation: "embedding",
      model: OPENAI_EMBEDDING_MODEL,
      status: "error",
      latencyMs: Date.now() - startedAt,
      costAvailability: "unavailable",
      stage: args.stage ?? "embedding",
      visibility: args.visibility ?? "background",
      metadata: args.metadata,
      link: args.link,
    });
    throw error;
  }
}

export async function trackedTranscribeBase64Audio(
  ctx: UsageRecorderCtx,
  args: {
    userId: Id<"users">;
    audioBase64: string;
    format: string;
    language?: string;
    durationMs?: number;
  },
) {
  const client = requireOpenAI();
  const startedAt = Date.now();
  const audio = Buffer.from(args.audioBase64, "base64");
  const file = await toFile(audio, `recording.${args.format}`);
  try {
    const response = await client.audio.transcriptions.create({
      file,
      model: OPENAI_TRANSCRIPTION_MODEL,
      ...(args.language ? { language: args.language } : {}),
    });
    const audioSeconds =
      typeof args.durationMs === "number" && args.durationMs > 0
        ? args.durationMs / 1000
        : undefined;
    const pricing = getChatPricing(OPENAI_TRANSCRIPTION_MODEL);
    const costUsdMicros =
      pricing?.audioUsdPerMinute && audioSeconds
        ? minutesToMicros(audioSeconds / 60, pricing.audioUsdPerMinute)
        : undefined;
    await recordOpenAiUsage(ctx, {
      userId: args.userId,
      feature: "audio_transcription",
      operation: "transcription",
      model: OPENAI_TRANSCRIPTION_MODEL,
      status: "success",
      latencyMs: Date.now() - startedAt,
      audioSeconds,
      costUsdMicros,
      costAvailability: audioSeconds ? "estimated" : "unavailable",
    });
    return response;
  } catch (error) {
    await recordOpenAiUsage(ctx, {
      userId: args.userId,
      feature: "audio_transcription",
      operation: "transcription",
      model: OPENAI_TRANSCRIPTION_MODEL,
      status: "error",
      latencyMs: Date.now() - startedAt,
      costAvailability: "unavailable",
    });
    throw error;
  }
}
