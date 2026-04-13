"use node";

import OpenAI from "openai";
import { toFile } from "openai/uploads";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import {
  DEFAULT_ROUTING,
  FEATURE_TO_CAPABILITY,
  buildEmbeddingFingerprint,
  getSelectedProviderModel,
  supportsFeature,
  supportsProviderModelCapability,
  type AiBillingOwner,
  type AiCapability,
  type AiCredentialSource,
  type AiFeature,
  type AiProviderModelSelections,
  type AiProvider,
  type AiVisibility,
} from "./ai";
import {
  DEFAULT_AI_PRICING_VERSION,
  estimatePricingMicros,
  resolveBilledTo,
  type AiPricingOperation,
} from "./aiPricing";
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

type ResolvedRoute = {
  provider: AiProvider;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  credentialSource: AiCredentialSource;
  billingOwner: AiBillingOwner;
  routingReason: string;
};

type ResolvedPricing = {
  inputUsdPer1M?: number;
  outputUsdPer1M?: number;
  audioUsdPerMinute?: number;
  imageUsdPerUnit?: number;
  priceDisplayMode: "estimated" | "exact" | "unavailable";
  pricingVersion: string;
};

type ProviderState = {
  preference: {
    userId: Id<"users">;
    byokEnabled: boolean;
    preferredProvider: AiProvider;
    capabilityModels?: Partial<Record<AiCapability, string>>;
    providerModels?: AiProviderModelSelections;
    targetEmbeddingFingerprint?: string;
    lastReadyEmbeddingFingerprint?: string;
    embeddingRebuildStatus?: string;
    embeddingRebuildStartedAt?: number;
    embeddingRebuildUpdatedAt?: number;
    embeddingRebuildProcessed?: number;
    embeddingRebuildTotal?: number;
    embeddingRebuildError?: string;
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

export async function getEmbeddingFingerprintForUser(ctx: UsageRecorderCtx, userId: Id<"users">) {
  const route = await resolveAiRoute(ctx, { userId, feature: "memory_search" });
  return buildEmbeddingFingerprint(route.provider, route.model);
}

export function requireOpenAI() {
  const client = getOpenAIClientForCredentials();
  if (!client) {
    throw new Error("OPENAI_API_KEY is not configured in Convex.");
  }
  return client;
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

function resolveByokModel(args: {
  provider: AiProvider;
  capability: AiCapability;
  preference: ProviderState["preference"];
}) {
  return getSelectedProviderModel({
    provider: args.provider,
    capability: args.capability,
    preferredProvider: args.preference.preferredProvider,
    capabilityModels: args.preference.capabilityModels,
    providerModels: args.preference.providerModels,
  });
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

  if (byokEnabled) {
    if (!preferredSecret) {
      throw new Error(`BYOK is enabled but no ${preferredProvider} API key is configured.`);
    }
    const selectedModel = resolveByokModel({
      provider: preferredProvider,
      capability,
      preference: providerState.preference,
    });
    if (!selectedModel) {
      throw new Error(`No BYOK model is configured for ${capability}.`);
    }
    if (!supportsFeature(preferredProvider, args.feature, selectedModel)) {
      throw new Error(
        `${preferredProvider} model ${selectedModel} is not configured to support ${capability}.`,
      );
    }
    return {
      provider: preferredProvider,
      model: selectedModel,
      apiKey: decryptSecret(preferredSecret),
      baseUrl: preferredSecret.baseUrl,
      credentialSource: "user_byok" as const,
      billingOwner: "user" as const,
      routingReason: "user_byok",
    };
  }

  if (
    adminRoute.enabled &&
    supportsProviderModelCapability(adminRoute.provider, adminRoute.model, capability)
  ) {
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
        routingReason: "admin_routing",
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
    billedTo?: "memora" | "user_byok";
    costUsdMicros?: number;
    costAvailability: "estimated" | "exact" | "unavailable";
    priceDisplayMode?: "estimated" | "exact" | "unavailable";
    pricingOperation?: AiPricingOperation;
    pricingVersion?: string;
    pricingReason?: string;
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
    billedTo: args.billedTo ?? resolveBilledTo(route),
    costUsdMicros: args.costUsdMicros,
    costAvailability: args.costAvailability,
    priceDisplayMode: args.priceDisplayMode ?? args.costAvailability,
    pricingOperation: args.pricingOperation,
    pricingVersion: args.pricingVersion,
    pricingReason: args.pricingReason,
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
  let promptTokens = 0;
  let totalTokens = 0;
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
    promptTokens += data.usageMetadata?.promptTokenCount ?? 0;
    totalTokens += data.usageMetadata?.totalTokenCount ?? data.usageMetadata?.promptTokenCount ?? 0;
  }
  return {
    embeddings,
    usage: {
      prompt_tokens: promptTokens || undefined,
      total_tokens: totalTokens || undefined,
    } satisfies ChatUsage,
  };
}

async function resolvePricing(
  ctx: UsageRecorderCtx,
  args: { provider: AiProvider; model: string; operation: AiPricingOperation },
): Promise<ResolvedPricing> {
  const pricing = await ctx.runQuery(internal.aiPricing.getPricingInternal, args);
  return {
    inputUsdPer1M: pricing?.inputUsdPer1M,
    outputUsdPer1M: pricing?.outputUsdPer1M,
    audioUsdPerMinute: pricing?.audioUsdPerMinute,
    imageUsdPerUnit: pricing?.imageUsdPerUnit,
    priceDisplayMode: pricing?.priceDisplayMode ?? "unavailable",
    pricingVersion: DEFAULT_AI_PRICING_VERSION,
  };
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
  const model = route.model;
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
    const pricing = await resolvePricing(ctx, {
      provider: route.provider,
      model,
      operation: "chat_completion",
    });
    const priced = estimatePricingMicros({
      pricing,
      inputTokens: usage?.prompt_tokens,
      outputTokens: usage?.completion_tokens,
    });
    await recordAiUsage(ctx, route, {
      userId: args.userId,
      feature: args.feature,
      operation: "chat_completion",
      model,
      status: "success",
      latencyMs: Date.now() - startedAt,
      usage,
      billedTo: resolveBilledTo(route),
      costUsdMicros: priced.costUsdMicros,
      costAvailability: priced.priceDisplayMode,
      priceDisplayMode: priced.priceDisplayMode,
      pricingOperation: "chat_completion",
      pricingVersion: pricing?.pricingVersion ?? DEFAULT_AI_PRICING_VERSION,
      pricingReason: priced.pricingReason,
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
      billedTo: resolveBilledTo(route),
      costAvailability: "unavailable",
      priceDisplayMode: "unavailable",
      pricingOperation: "chat_completion",
      pricingVersion: DEFAULT_AI_PRICING_VERSION,
      pricingReason: "request_failed",
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
  const model = route.model;
  const startedAt = Date.now();
  try {
    const embeddings =
      route.provider === "openai"
        ? await (async () => {
            const response = await getOpenAIClientForCredentials({
              apiKey: route.apiKey,
              baseURL: route.baseUrl,
            })!.embeddings.create({
              model,
              input: args.input,
            });
            return {
              embeddings: response.data.map((item) => item.embedding),
              usage: {
                prompt_tokens: response.usage?.prompt_tokens,
                total_tokens: response.usage?.total_tokens,
              } satisfies ChatUsage,
            };
          })()
        : await callGoogleEmbeddings({
            apiKey: route.apiKey!,
            model,
            input: args.input,
          });
    const pricing = await resolvePricing(ctx, {
      provider: route.provider,
      model,
      operation: "embedding",
    });
    const priced = estimatePricingMicros({
      pricing,
      inputTokens: embeddings.usage.prompt_tokens,
    });
    await recordAiUsage(ctx, route, {
      userId: args.userId,
      feature: args.feature,
      operation: "embedding",
      model,
      status: "success",
      latencyMs: Date.now() - startedAt,
      usage: embeddings.usage,
      billedTo: resolveBilledTo(route),
      costUsdMicros: priced.costUsdMicros,
      costAvailability: priced.priceDisplayMode,
      priceDisplayMode: priced.priceDisplayMode,
      pricingOperation: "embedding",
      pricingVersion: pricing?.pricingVersion ?? DEFAULT_AI_PRICING_VERSION,
      pricingReason: priced.pricingReason,
      stage: args.stage ?? "embedding",
      visibility: args.visibility ?? "background",
      metadata: args.metadata,
      link: args.link,
    });
    return embeddings.embeddings;
  } catch (error) {
    await recordAiUsage(ctx, route, {
      userId: args.userId,
      feature: args.feature,
      operation: "embedding",
      model,
      status: "error",
      latencyMs: Date.now() - startedAt,
      billedTo: resolveBilledTo(route),
      costAvailability: "unavailable",
      priceDisplayMode: "unavailable",
      pricingOperation: "embedding",
      pricingVersion: DEFAULT_AI_PRICING_VERSION,
      pricingReason: "request_failed",
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
      model: route.model,
      ...(args.language ? { language: args.language } : {}),
    });
    const audioSeconds =
      typeof args.durationMs === "number" && args.durationMs > 0
        ? args.durationMs / 1000
        : undefined;
    const pricing = await resolvePricing(ctx, {
      provider: route.provider,
      model: route.model,
      operation: "transcription",
    });
    const priced = estimatePricingMicros({
      pricing,
      audioSeconds,
    });
    await recordAiUsage(ctx, route, {
      userId: args.userId,
      feature: "audio_transcription",
      operation: "transcription",
      model: route.model,
      status: "success",
      latencyMs: Date.now() - startedAt,
      audioSeconds,
      billedTo: resolveBilledTo(route),
      costUsdMicros: priced.costUsdMicros,
      costAvailability: priced.priceDisplayMode,
      priceDisplayMode: priced.priceDisplayMode,
      pricingOperation: "transcription",
      pricingVersion: pricing?.pricingVersion ?? DEFAULT_AI_PRICING_VERSION,
      pricingReason: priced.pricingReason,
    });
    return response;
  } catch (error) {
    await recordAiUsage(ctx, route, {
      userId: args.userId,
      feature: "audio_transcription",
      operation: "transcription",
      model: route.model,
      status: "error",
      latencyMs: Date.now() - startedAt,
      billedTo: resolveBilledTo(route),
      costAvailability: "unavailable",
      priceDisplayMode: "unavailable",
      pricingOperation: "transcription",
      pricingVersion: DEFAULT_AI_PRICING_VERSION,
      pricingReason: "request_failed",
    });
    throw error;
  }
}
