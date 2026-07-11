"use node";

import type OpenAI from "openai";
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
  type AiCapability,
  type AiFeature,
  type AiProvider,
  type AiProviderModelSelections,
  type AiRoutingEntry,
  type AiVisibility,
} from "./ai";
import {
  DEFAULT_AI_PRICING_VERSION,
  estimatePricingMicros,
  resolveBilledTo,
  type AiPricingOperation,
} from "./aiPricing";
import { decryptSecret } from "./aiSecrets";
import { openAiAdapter } from "./providers/openai";
import { googleAdapter } from "./providers/google";
import type { AiProviderAdapter, ChatUsage, ResolvedRoute } from "./providers/types";

// ─── Provider registry ────────────────────────────────────────────────────────

const ADAPTERS: Record<AiProvider, AiProviderAdapter> = {
  openai: openAiAdapter,
  google: googleAdapter,
};

function getAdapter(provider: AiProvider): AiProviderAdapter {
  const adapter = ADAPTERS[provider];
  if (!adapter) throw new Error(`No AI adapter registered for provider: ${provider}`);
  return adapter;
}

// ─── Re-exports for callers that need direct client access ────────────────────

export { getOpenAIClientDirect } from "./providers/openai";

// ─── Route resolution ─────────────────────────────────────────────────────────

type UsageRecorderCtx = Pick<ActionCtx, "runMutation" | "runQuery">;

type AnalyticsLink = {
  chatTurnId?: Id<"chatMessages">;
  chatMessageId?: Id<"chatMessages">;
  conversationId?: string;
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

function platformRouteForFeature(feature: AiFeature): ResolvedRoute {
  const capability = FEATURE_TO_CAPABILITY[feature];
  const route = DEFAULT_ROUTING[capability];

  if (route.provider === "openai") {
    if (!openAiAdapter.hasPlatformCredentials()) {
      throw new Error("Platform OpenAI credentials are not configured.");
    }
    return {
      provider: "openai",
      model: route.model,
      credentialSource: "platform",
      billingOwner: "platform",
      routingReason: "platform_default",
    };
  }

  if (!googleAdapter.hasPlatformCredentials()) {
    throw new Error("Platform Google AI credentials are not configured.");
  }
  return {
    provider: "google",
    model: route.model,
    credentialSource: "platform",
    billingOwner: "platform",
    routingReason: "platform_default",
  };
}

function resolveByokModel(args: {
  provider: AiProvider;
  capability: AiCapability;
  preference: ProviderState["preference"];
}): string | null {
  return (
    getSelectedProviderModel({
      provider: args.provider,
      capability: args.capability,
      preferredProvider: args.preference.preferredProvider,
      capabilityModels: args.preference.capabilityModels,
      providerModels: args.preference.providerModels,
    }) ?? null
  );
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
  const preferredSecret = providerState.secrets.find((row) => row.provider === preferredProvider);

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
      credentialSource: "user_byok",
      billingOwner: "user",
      routingReason: "user_byok",
    };
  }

  if (
    adminRoute.enabled &&
    supportsProviderModelCapability(adminRoute.provider, adminRoute.model, capability)
  ) {
    const adapter = getAdapter(adminRoute.provider);
    if (!adapter.hasPlatformCredentials()) {
      throw new Error(`Platform ${adminRoute.provider} credentials are not configured.`);
    }
    return {
      provider: adminRoute.provider,
      model: adminRoute.model,
      credentialSource: "platform",
      billingOwner: "platform",
      routingReason: "admin_routing",
    };
  }

  return platformRouteForFeature(args.feature);
}

/**
 * Resolves the admin-configured fallback route for a feature (platform-only).
 * Returns null if no fallback is configured or fallback is disabled.
 * BYOK users should never use this — the fallback is platform credits only.
 */
export async function resolveAiFallbackRoute(
  ctx: UsageRecorderCtx,
  feature: AiFeature,
): Promise<ResolvedRoute | null> {
  const capability = FEATURE_TO_CAPABILITY[feature];
  const routing: Record<string, AiRoutingEntry> = await ctx.runQuery(
    internal.aiProviders.getRoutingInternal,
    {},
  );
  const entry = routing[capability];
  if (!entry?.fallbackProvider || !entry.fallbackModel || entry.fallbackEnabled === false) {
    return null;
  }
  const fallbackAdapter = getAdapter(entry.fallbackProvider);
  if (!fallbackAdapter.hasPlatformCredentials()) {
    return null;
  }
  return {
    provider: entry.fallbackProvider,
    model: entry.fallbackModel,
    credentialSource: "platform",
    billingOwner: "platform",
    routingReason: "admin_fallback",
  };
}

// ─── Pricing helpers ──────────────────────────────────────────────────────────

type ResolvedPricing = {
  inputUsdPer1M?: number;
  outputUsdPer1M?: number;
  audioUsdPerMinute?: number;
  imageUsdPerUnit?: number;
  priceDisplayMode: "estimated" | "exact" | "unavailable";
  pricingVersion: string;
};

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

// ─── Usage recording ──────────────────────────────────────────────────────────

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

// ─── Retry helper ─────────────────────────────────────────────────────────────

const RETRYABLE_STATUS_CODES = new Set([408, 409, 429, 500, 502, 503, 504]);
const RETRYABLE_ERROR_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "ECONNREFUSED",
  "EPIPE",
  "UND_ERR_SOCKET",
]);

/** True for transient network/rate-limit/server errors worth one retry, false for anything else (bad request, auth, etc). */
function isRetryableAiError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const status = (error as { status?: unknown }).status;
  if (typeof status === "number" && RETRYABLE_STATUS_CODES.has(status)) return true;
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && RETRYABLE_ERROR_CODES.has(code)) return true;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && /fetch failed|network|timeout/i.test(message);
}

/**
 * Retries a single transient failure (network blip, 429, 5xx) once after a
 * short delay. `onRetry` fires before the retry attempt so callers can reset
 * any partial state a first attempt may have produced (e.g. streamed text
 * already buffered for display). Non-retryable errors rethrow immediately.
 */
async function withRetry<T>(run: () => Promise<T>, onRetry?: () => void): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!isRetryableAiError(error)) throw error;
    await new Promise((resolve) => setTimeout(resolve, 400));
    onRetry?.();
    return run();
  }
}

// ─── Tracked wrappers (public API) ────────────────────────────────────────────

/**
 * Runs one AI operation and records its usage/cost/status to analytics,
 * whether it succeeds or throws. Every public `tracked*` function below is a
 * thin "obtain the response" wrapper around this shared accounting skeleton.
 */
async function withUsageTracking<T extends { usage?: ChatUsage }>(
  ctx: UsageRecorderCtx,
  route: ResolvedRoute,
  meta: {
    userId: Id<"users">;
    feature: AiFeature;
    operation: string;
    pricingOperation: AiPricingOperation;
    stage?: string;
    visibility?: AiVisibility;
    metadata?: Record<string, string>;
    link?: AnalyticsLink;
    /** Only set for transcription — token-based ops derive usage from the response instead. */
    audioSeconds?: number;
  },
  run: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  try {
    const response = await run();
    const usage = response.usage;
    const cachedInputTokens = (
      usage as (ChatUsage & { prompt_tokens_details?: { cached_tokens?: number } }) | undefined
    )?.prompt_tokens_details?.cached_tokens;
    const pricing = await resolvePricing(ctx, {
      provider: route.provider,
      model: route.model,
      operation: meta.pricingOperation,
    });
    const priced = estimatePricingMicros({
      pricing,
      inputTokens: usage?.prompt_tokens,
      cachedInputTokens,
      outputTokens: usage?.completion_tokens,
      audioSeconds: meta.audioSeconds,
    });
    await recordAiUsage(ctx, route, {
      userId: meta.userId,
      feature: meta.feature,
      operation: meta.operation,
      model: route.model,
      status: "success",
      latencyMs: Date.now() - startedAt,
      usage,
      audioSeconds: meta.audioSeconds,
      billedTo: resolveBilledTo(route),
      costUsdMicros: priced.costUsdMicros,
      costAvailability: priced.priceDisplayMode,
      priceDisplayMode: priced.priceDisplayMode,
      pricingOperation: meta.pricingOperation,
      pricingVersion: pricing.pricingVersion,
      pricingReason: priced.pricingReason,
      stage: meta.stage ?? meta.operation,
      visibility: meta.visibility ?? "background",
      metadata:
        typeof cachedInputTokens === "number" && cachedInputTokens > 0
          ? { ...meta.metadata, cachedInputTokens: String(cachedInputTokens) }
          : meta.metadata,
      link: meta.link,
    });
    return response;
  } catch (error) {
    await recordAiUsage(ctx, route, {
      userId: meta.userId,
      feature: meta.feature,
      operation: meta.operation,
      model: route.model,
      status: "error",
      latencyMs: Date.now() - startedAt,
      billedTo: resolveBilledTo(route),
      costAvailability: "unavailable",
      priceDisplayMode: "unavailable",
      pricingOperation: meta.pricingOperation,
      pricingVersion: DEFAULT_AI_PRICING_VERSION,
      pricingReason: "request_failed",
      stage: meta.stage ?? meta.operation,
      visibility: meta.visibility ?? "background",
      metadata: meta.metadata,
      link: meta.link,
    });
    throw error;
  }
}

export async function trackedChatCompletion(
  ctx: UsageRecorderCtx,
  args: {
    userId: Id<"users">;
    feature: AiFeature;
    stage?: string;
    visibility?: AiVisibility;
    metadata?: Record<string, string>;
    link?: AnalyticsLink;
    request: Omit<OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming, "model">;
  },
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const route = await resolveAiRoute(ctx, { userId: args.userId, feature: args.feature });
  try {
    return await trackedChatCompletionOnRoute(ctx, route, args);
  } catch (error) {
    // The admin-configured fallback (DEFAULT_ROUTING[capability].fallback*)
    // previously only ran for attachment extraction — a primary-provider
    // outage silently took down chat/structured_text even when an admin
    // had a fallback configured for exactly this. One failover attempt,
    // only for transient errors, only when a different provider is
    // actually configured as the fallback.
    if (!isRetryableAiError(error)) throw error;
    const fallbackRoute = await resolveAiFallbackRoute(ctx, args.feature);
    if (!fallbackRoute || fallbackRoute.provider === route.provider) throw error;
    return trackedChatCompletionOnRoute(ctx, fallbackRoute, args);
  }
}

/**
 * Streaming variant of `trackedChatCompletion`. Text deltas are emitted via
 * `onDelta` while the model generates; the returned value is the fully
 * assembled completion with exact usage (stream_options.include_usage).
 * Providers without a streaming adapter fall back to the non-streaming call
 * transparently (no deltas fire, the full completion just resolves).
 */
type ChatCompletionStreamArgs = {
  userId: Id<"users">;
  feature: AiFeature;
  stage?: string;
  visibility?: AiVisibility;
  metadata?: Record<string, string>;
  link?: AnalyticsLink;
  onDelta: (textDelta: string) => void;
  /** Called before a retry attempt so the caller can discard partial streamed state. */
  onRetry?: () => void;
  streamToolTextField?: { toolName: string; argName: string };
  request: Omit<OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming, "model">;
};

/**
 * Like `trackedChatCompletionStream` but with a pre-resolved route — used by
 * the fallback path below so the failover attempt doesn't re-resolve the
 * (already-known-bad) primary route.
 */
async function trackedChatCompletionStreamOnRoute(
  ctx: UsageRecorderCtx,
  route: ResolvedRoute,
  args: ChatCompletionStreamArgs,
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const adapter = getAdapter(route.provider);
  return withUsageTracking(
    ctx,
    route,
    { ...args, operation: "chat_completion", pricingOperation: "chat_completion" },
    () =>
      withRetry(
        () =>
          adapter.chatCompletionStream
            ? adapter.chatCompletionStream({
                route,
                request: args.request,
                onDelta: args.onDelta,
                streamToolTextField: args.streamToolTextField,
              })
            : adapter.chatCompletion({ route, request: args.request }),
        args.onRetry,
      ),
  );
}

export async function trackedChatCompletionStream(
  ctx: UsageRecorderCtx,
  args: ChatCompletionStreamArgs,
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const route = await resolveAiRoute(ctx, { userId: args.userId, feature: args.feature });
  try {
    return await trackedChatCompletionStreamOnRoute(ctx, route, args);
  } catch (error) {
    // See trackedChatCompletion's fallback comment — same failover, wired
    // through for the streaming chat path (memory_chat) too.
    if (!isRetryableAiError(error)) throw error;
    const fallbackRoute = await resolveAiFallbackRoute(ctx, args.feature);
    if (!fallbackRoute || fallbackRoute.provider === route.provider) throw error;
    args.onRetry?.();
    return trackedChatCompletionStreamOnRoute(ctx, fallbackRoute, args);
  }
}

/**
 * Like `trackedChatCompletion` but with a pre-resolved route — skips route resolution.
 * Use when you've already called `resolveAiRoute` or `resolveAiFallbackRoute` and want
 * to avoid a second DB round-trip.
 */
export async function trackedChatCompletionOnRoute(
  ctx: UsageRecorderCtx,
  route: ResolvedRoute,
  args: {
    userId: Id<"users">;
    feature: AiFeature;
    stage?: string;
    visibility?: AiVisibility;
    metadata?: Record<string, string>;
    link?: AnalyticsLink;
    request: Omit<OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming, "model">;
  },
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const adapter = getAdapter(route.provider);
  return withUsageTracking(
    ctx,
    route,
    { ...args, operation: "chat_completion", pricingOperation: "chat_completion" },
    () => withRetry(() => adapter.chatCompletion({ route, request: args.request })),
  );
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
): Promise<number[][]> {
  const route = await resolveAiRoute(ctx, { userId: args.userId, feature: args.feature });
  const adapter = getAdapter(route.provider);
  const result = await withUsageTracking(
    ctx,
    route,
    { ...args, operation: "embedding", pricingOperation: "embedding" },
    async () => {
      const embedResult = await adapter.embedTexts({ route, input: args.input });
      return { ...embedResult, usage: embedResult.usage as ChatUsage };
    },
  );
  return result.embeddings;
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
): Promise<number[]> {
  return (await trackedEmbedTexts(ctx, args))[0];
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
  const route = await resolveAiRoute(ctx, {
    userId: args.userId,
    feature: "audio_transcription",
  });
  const adapter = getAdapter(route.provider);
  if (!adapter.transcribeAudio) {
    throw new Error(`Provider ${route.provider} does not support audio transcription.`);
  }
  const audioSeconds =
    typeof args.durationMs === "number" && args.durationMs > 0 ? args.durationMs / 1000 : undefined;
  return withUsageTracking(
    ctx,
    route,
    {
      userId: args.userId,
      feature: "audio_transcription",
      operation: "transcription",
      pricingOperation: "transcription",
      audioSeconds,
    },
    async () => {
      const response = await adapter.transcribeAudio!({
        route,
        audioBase64: args.audioBase64,
        format: args.format,
        language: args.language,
      });
      return { ...response, usage: undefined as ChatUsage | undefined };
    },
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export async function getEmbeddingFingerprintForUser(
  ctx: UsageRecorderCtx,
  userId: Id<"users">,
): Promise<string> {
  const route = await resolveAiRoute(ctx, { userId, feature: "memory_search" });
  return buildEmbeddingFingerprint(route.provider, route.model);
}

export function hasOpenAI(): boolean {
  return openAiAdapter.hasPlatformCredentials();
}

/** Extract plain text from an OpenAI message content value. */
export function extractTextContent(
  content: string | Array<{ type?: string; text?: string }> | null | undefined,
): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) =>
      typeof part === "object" && part?.type === "text" && typeof part.text === "string"
        ? part.text
        : "",
    )
    .join("")
    .trim();
}

/** Safely parse JSON, stripping markdown code fences if present. */
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

// Re-export ResolvedRoute for callers that need the type (e.g. attachmentExtraction)
export type { ResolvedRoute } from "./providers/types";
