"use node";

import OpenAI from "openai";
import { toFile } from "openai/uploads";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import {
  DEFAULT_ROUTING,
  FEATURE_TO_CAPABILITY,
  supportsFeature,
  type AiBillingOwner,
  type AiCredentialSource,
  type AiFeature,
  type AiProvider,
  type AiVisibility,
} from "./ai";
import { decryptSecret } from "./aiSecrets";

export const OPENAI_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini";
export const OPENAI_EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
export const OPENAI_TRANSCRIPTION_MODEL =
  process.env.OPENAI_TRANSCRIPTION_MODEL ?? "gpt-4o-mini-transcribe";
export const GOOGLE_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL ?? "gemini-2.0-flash";
export const GOOGLE_VISION_MODEL = process.env.GEMINI_VISION_MODEL ?? "gemini-2.0-flash";
export const GOOGLE_EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001";

type UsageRecorderCtx = Pick<ActionCtx, "runMutation" | "runQuery">;
type AnalyticsLink = {
  chatTurnId?: Id<"chatMessages">;
  chatMessageId?: Id<"chatMessages">;
  conversationId?: string;
};

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

type ResolvedRoute = {
  provider: AiProvider;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  credentialSource: AiCredentialSource;
  billingOwner: AiBillingOwner;
  routingReason: string;
};

type ProviderState = {
  preference: {
    userId: Id<"users">;
    byokEnabled: boolean;
    preferredProvider: AiProvider;
    updatedAt: number;
  };
  secrets: Array<{
    provider: AiProvider;
    ciphertext: string;
    iv: string;
    authTag: string;
    keyVersion: number;
    baseUrl?: string;
  }>;
};

const OPENAI_PRICING: Record<string, PriceConfig> = {
  "gpt-4o": { inputUsdPer1M: 5, outputUsdPer1M: 15 },
  "gpt-4o-mini": { inputUsdPer1M: 0.15, outputUsdPer1M: 0.6 },
  "gpt-4o-mini-transcribe": { audioUsdPerMinute: 0.006 },
  "text-embedding-3-small": { inputUsdPer1M: 0.02 },
};

let cachedPlatformClient: OpenAI | null | undefined;

function getPlatformOpenAiApiKey() {
  return process.env.OPENAI_API_KEY ?? process.env.CONVEX_OPENAI_API_KEY ?? null;
}

function getPlatformOpenAiBaseURL() {
  return process.env.OPENAI_BASE_URL ?? process.env.CONVEX_OPENAI_BASE_URL;
}

function getGoogleApiKey() {
  return process.env.GEMINI_API_KEY ?? null;
}

function getOpenAIClientForCredentials(args?: { apiKey?: string; baseURL?: string }) {
  if (args?.apiKey) {
    return new OpenAI({
      apiKey: args.apiKey,
      ...(args.baseURL ? { baseURL: args.baseURL } : {}),
    });
  }

  if (cachedPlatformClient !== undefined) {
    return cachedPlatformClient;
  }

  const apiKey = getPlatformOpenAiApiKey();
  if (!apiKey) {
    cachedPlatformClient = null;
    return cachedPlatformClient;
  }

  cachedPlatformClient = new OpenAI({
    apiKey,
    ...(getPlatformOpenAiBaseURL() ? { baseURL: getPlatformOpenAiBaseURL() } : {}),
  });
  return cachedPlatformClient;
}

export function hasOpenAI() {
  return Boolean(getPlatformOpenAiApiKey());
}

export function getOpenAIClient() {
  return getOpenAIClientForCredentials();
}

export async function getOpenAIClientForFeature(
  ctx: UsageRecorderCtx,
  args: { userId: Id<"users">; feature: AiFeature },
) {
  const route = await resolveAiRoute(ctx, args);
  if (route.provider !== "openai") {
    return null;
  }
  return getOpenAIClientForCredentials({
    apiKey: route.apiKey,
    baseURL: route.baseUrl,
  });
}

export function requireOpenAI() {
  const client = getOpenAIClientForCredentials();
  if (!client) {
    throw new Error("OPENAI_API_KEY is not configured in Convex.");
  }
  return client;
}

function getOpenAiPricing(model: string) {
  return OPENAI_PRICING[model] ?? null;
}

function tokensToMicros(tokens: number, pricePerMillion: number) {
  return Math.round((tokens / 1_000_000) * pricePerMillion * 1_000_000);
}

function minutesToMicros(minutes: number, pricePerMinute: number) {
  return Math.round(minutes * pricePerMinute * 1_000_000);
}

function platformRouteForFeature(feature: AiFeature): ResolvedRoute {
  const capability = FEATURE_TO_CAPABILITY[feature];
  const route = DEFAULT_ROUTING[capability];
  if (route.provider === "openai") {
    if (!getPlatformOpenAiApiKey()) {
      throw new Error("Platform OpenAI credentials are not configured.");
    }
    return {
      provider: "openai",
      model: route.model,
      apiKey: getPlatformOpenAiApiKey() ?? undefined,
      baseUrl: getPlatformOpenAiBaseURL(),
      credentialSource: "platform",
      billingOwner: "platform",
      routingReason: "platform_default",
    };
  }

  if (!getGoogleApiKey()) {
    throw new Error("Platform Google AI credentials are not configured.");
  }
  return {
    provider: "google",
    model: route.model,
    apiKey: getGoogleApiKey() ?? undefined,
    credentialSource: "platform",
    billingOwner: "platform",
    routingReason: "platform_default",
  };
}

export async function resolveAiRoute(
  ctx: UsageRecorderCtx,
  args: { userId: Id<"users">; feature: AiFeature },
): Promise<ResolvedRoute> {
  const capability = FEATURE_TO_CAPABILITY[args.feature];
  const [routing, providerState]: [
    Record<string, { provider: AiProvider; model: string; enabled: boolean }>,
    ProviderState,
  ] = await Promise.all([
    ctx.runQuery(internal.aiProviders.getRoutingInternal, {}),
    ctx.runQuery(internal.aiProviders.getUserProviderStateInternal, { userId: args.userId }),
  ]);

  const adminRoute = routing[capability];
  const preferredProvider = providerState.preference.preferredProvider;
  const byokEnabled = providerState.preference.byokEnabled;
  const preferredSecret = providerState.secrets.find(
    (row: ProviderState["secrets"][number]) => row.provider === preferredProvider,
  );

  if (byokEnabled && preferredSecret && supportsFeature(preferredProvider, args.feature)) {
    return {
      provider: preferredProvider,
      model:
        capability === "embeddings"
          ? preferredProvider === "openai"
            ? OPENAI_EMBEDDING_MODEL
            : GOOGLE_EMBEDDING_MODEL
          : capability === "vision"
            ? preferredProvider === "openai"
              ? "gpt-4o"
              : GOOGLE_VISION_MODEL
            : capability === "transcription"
              ? OPENAI_TRANSCRIPTION_MODEL
              : preferredProvider === "openai"
                ? OPENAI_CHAT_MODEL
                : GOOGLE_TEXT_MODEL,
      apiKey: decryptSecret(preferredSecret),
      baseUrl: preferredSecret.baseUrl,
      credentialSource: "user_byok" as const,
      billingOwner: "user" as const,
      routingReason: "user_byok",
    };
  }

  if (adminRoute.enabled && supportsFeature(adminRoute.provider, args.feature)) {
    if (adminRoute.provider === "openai") {
      if (!getPlatformOpenAiApiKey()) {
        throw new Error("Platform OpenAI credentials are not configured.");
      }
      return {
        provider: "openai" as const,
        model: adminRoute.model,
        apiKey: getPlatformOpenAiApiKey() ?? undefined,
        baseUrl: getPlatformOpenAiBaseURL(),
        credentialSource: "platform" as const,
        billingOwner: "platform" as const,
        routingReason:
          byokEnabled && preferredSecret ? "provider_unsupported_for_feature" : "admin_routing",
      };
    }
    if (!getGoogleApiKey()) {
      throw new Error("Platform Google AI credentials are not configured.");
    }
    return {
      provider: "google" as const,
      model: adminRoute.model,
      apiKey: getGoogleApiKey() ?? undefined,
      credentialSource: "platform" as const,
      billingOwner: "platform" as const,
      routingReason: "admin_routing",
    };
  }

  return platformRouteForFeature(args.feature);
}

async function recordAiUsage(
  ctx: UsageRecorderCtx,
  route: ResolvedRoute,
  args: {
    userId: Id<"users">;
    feature: AiFeature;
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
    provider: route.provider,
    model: args.model,
    operation: args.operation,
    feature: args.feature,
    status: args.status,
    latencyMs: args.latencyMs,
    inputTokens: args.usage?.prompt_tokens,
    outputTokens: args.usage?.completion_tokens,
    totalTokens: args.usage?.total_tokens,
    audioSeconds: args.audioSeconds,
    costUsdMicros: route.billingOwner === "platform" ? args.costUsdMicros : undefined,
    costAvailability: route.billingOwner === "platform" ? args.costAvailability : "unavailable",
    stage: args.stage,
    visibility: args.visibility,
    credentialSource: route.credentialSource,
    billingOwner: route.billingOwner,
    routingReason: route.routingReason,
    metadata: {
      ...(args.metadata ?? {}),
      credentialSource: route.credentialSource,
      billingOwner: route.billingOwner,
      routingReason: route.routingReason,
    },
  });
}

function googleApiBase(model: string) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}`;
}

function buildTextPrompt(
  messages: Array<{
    role: string;
    content: string | Array<{ type?: string; text?: string; image_url?: { url: string } }>;
  }>,
) {
  return messages
    .map((message) => {
      const text = extractTextContent(message.content as never);
      return `${message.role.toUpperCase()}: ${text}`;
    })
    .join("\n\n");
}

function buildSchemaInstructions(
  request: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
) {
  const tool = request.tools?.[0];
  if (request.tool_choice && tool?.type === "function") {
    return `Return JSON only for function "${tool.function.name}" with this schema:\n${JSON.stringify(
      tool.function.parameters,
    )}`;
  }
  if (
    (request as { response_format?: { type?: string } }).response_format?.type === "json_object"
  ) {
    return "Return valid JSON only.";
  }
  return "";
}

async function callGoogleGenerate(args: {
  apiKey: string;
  model: string;
  request: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming;
}) {
  const prompt = [
    buildSchemaInstructions(args.request),
    buildTextPrompt(args.request.messages as never),
  ]
    .filter(Boolean)
    .join("\n\n");

  const response = await fetch(`${googleApiBase(args.model)}:generateContent?key=${args.apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: (args.request as { temperature?: number }).temperature ?? 0.3,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Google generateContent failed with status ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
    );
  }

  const data = (await response.json()) as {
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    };
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  return {
    choices: [
      {
        message: {
          content: text,
          tool_calls:
            args.request.tool_choice && args.request.tools?.[0]?.type === "function"
              ? [
                  {
                    type: "function",
                    function: {
                      name: args.request.tools[0].function.name,
                      arguments: text,
                    },
                  },
                ]
              : undefined,
        },
      },
    ],
    usage: {
      prompt_tokens: data.usageMetadata?.promptTokenCount,
      completion_tokens: data.usageMetadata?.candidatesTokenCount,
      total_tokens: data.usageMetadata?.totalTokenCount,
    },
  };
}

async function callGoogleEmbeddings(args: {
  apiKey: string;
  model: string;
  input: string | string[];
}) {
  const values = Array.isArray(args.input) ? args.input : [args.input];
  const embeddings: number[][] = [];
  for (const value of values) {
    const response = await fetch(`${googleApiBase(args.model)}:embedContent?key=${args.apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: `models/${args.model}`,
        content: { parts: [{ text: value }] },
        outputDimensionality: 1536,
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Google embeddings failed with status ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
      );
    }
    const data = (await response.json()) as {
      embedding?: { values?: number[] };
      usageMetadata?: { promptTokenCount?: number; totalTokenCount?: number };
    };
    embeddings.push(data.embedding?.values ?? []);
  }
  return embeddings;
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
    feature: AiFeature;
    model?: string;
    stage?: string;
    visibility?: AiVisibility;
    metadata?: Record<string, string>;
    link?: AnalyticsLink;
    request: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming;
  },
) {
  const route = await resolveAiRoute(ctx, { userId: args.userId, feature: args.feature });
  const model = args.model ?? route.model;
  const startedAt = Date.now();
  try {
    const response =
      route.provider === "openai"
        ? await getOpenAIClientForCredentials({
            apiKey: route.apiKey,
            baseURL: route.baseUrl,
          })!.chat.completions.create({
            ...args.request,
            model,
          })
        : await callGoogleGenerate({
            apiKey: route.apiKey!,
            model,
            request: {
              ...args.request,
              model,
            },
          });
    const usage = response.usage as ChatUsage | undefined;
    const pricing =
      route.provider === "openai" && route.billingOwner === "platform"
        ? getOpenAiPricing(model)
        : null;
    const costUsdMicros =
      pricing && usage
        ? tokensToMicros(usage.prompt_tokens ?? 0, pricing.inputUsdPer1M ?? 0) +
          tokensToMicros(usage.completion_tokens ?? 0, pricing.outputUsdPer1M ?? 0)
        : undefined;
    await recordAiUsage(ctx, route, {
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
    return response as OpenAI.Chat.Completions.ChatCompletion;
  } catch (error) {
    await recordAiUsage(ctx, route, {
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
    feature: AiFeature;
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
    feature: AiFeature;
    input: string | string[];
    stage?: string;
    visibility?: AiVisibility;
    metadata?: Record<string, string>;
    link?: AnalyticsLink;
  },
) {
  const route = await resolveAiRoute(ctx, { userId: args.userId, feature: args.feature });
  const model =
    route.provider === "openai" ? OPENAI_EMBEDDING_MODEL : route.model || GOOGLE_EMBEDDING_MODEL;
  const startedAt = Date.now();
  try {
    const embeddings =
      route.provider === "openai"
        ? (
            await getOpenAIClientForCredentials({
              apiKey: route.apiKey,
              baseURL: route.baseUrl,
            })!.embeddings.create({
              model,
              input: args.input,
            })
          ).data.map((item) => item.embedding)
        : await callGoogleEmbeddings({
            apiKey: route.apiKey!,
            model,
            input: args.input,
          });
    await recordAiUsage(ctx, route, {
      userId: args.userId,
      feature: args.feature,
      operation: "embedding",
      model,
      status: "success",
      latencyMs: Date.now() - startedAt,
      costAvailability: "unavailable",
      stage: args.stage ?? "embedding",
      visibility: args.visibility ?? "background",
      metadata: args.metadata,
      link: args.link,
    });
    return embeddings;
  } catch (error) {
    await recordAiUsage(ctx, route, {
      userId: args.userId,
      feature: args.feature,
      operation: "embedding",
      model,
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
): Promise<{ text?: string | null }> {
  const route = await resolveAiRoute(ctx, { userId: args.userId, feature: "audio_transcription" });
  if (route.provider !== "openai") {
    throw new Error("Transcription is only available via OpenAI in this build.");
  }
  const client = getOpenAIClientForCredentials({ apiKey: route.apiKey, baseURL: route.baseUrl })!;
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
    const pricing =
      route.billingOwner === "platform" ? getOpenAiPricing(OPENAI_TRANSCRIPTION_MODEL) : null;
    const costUsdMicros =
      pricing?.audioUsdPerMinute && audioSeconds
        ? minutesToMicros(audioSeconds / 60, pricing.audioUsdPerMinute)
        : undefined;
    await recordAiUsage(ctx, route, {
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
    await recordAiUsage(ctx, route, {
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
