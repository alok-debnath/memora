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

// ─── Tracked wrappers (public API) ────────────────────────────────────────────

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
  const adapter = getAdapter(route.provider);
  const startedAt = Date.now();
  try {
    const response = await adapter.chatCompletion({ route, request: args.request });
    const usage = response.usage as ChatUsage | undefined;
    const pricing = await resolvePricing(ctx, {
      provider: route.provider,
      model: route.model,
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
      model: route.model,
      status: "success",
      latencyMs: Date.now() - startedAt,
      usage,
      billedTo: resolveBilledTo(route),
      costUsdMicros: priced.costUsdMicros,
      costAvailability: priced.priceDisplayMode,
      priceDisplayMode: priced.priceDisplayMode,
      pricingOperation: "chat_completion",
      pricingVersion: pricing.pricingVersion,
      pricingReason: priced.pricingReason,
      stage: args.stage ?? "chat_completion",
      visibility: args.visibility ?? "background",
      metadata: args.metadata,
      link: args.link,
    });
    return response;
  } catch (error) {
    await recordAiUsage(ctx, route, {
      userId: args.userId,
      feature: args.feature,
      operation: "chat_completion",
      model: route.model,
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
  const startedAt = Date.now();
  try {
    const response = await adapter.chatCompletion({ route, request: args.request });
    const usage = response.usage as ChatUsage | undefined;
    const pricing = await resolvePricing(ctx, {
      provider: route.provider,
      model: route.model,
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
      model: route.model,
      status: "success",
      latencyMs: Date.now() - startedAt,
      usage,
      billedTo: resolveBilledTo(route),
      costUsdMicros: priced.costUsdMicros,
      costAvailability: priced.priceDisplayMode,
      priceDisplayMode: priced.priceDisplayMode,
      pricingOperation: "chat_completion",
      pricingVersion: pricing.pricingVersion,
      pricingReason: priced.pricingReason,
      stage: args.stage ?? "chat_completion",
      visibility: args.visibility ?? "background",
      metadata: args.metadata,
      link: args.link,
    });
    return response;
  } catch (error) {
    await recordAiUsage(ctx, route, {
      userId: args.userId,
      feature: args.feature,
      operation: "chat_completion",
      model: route.model,
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
  const startedAt = Date.now();
  try {
    const result = await adapter.embedTexts({ route, input: args.input });
    const pricing = await resolvePricing(ctx, {
      provider: route.provider,
      model: route.model,
      operation: "embedding",
    });
    const priced = estimatePricingMicros({
      pricing,
      inputTokens: result.usage.prompt_tokens,
    });
    await recordAiUsage(ctx, route, {
      userId: args.userId,
      feature: args.feature,
      operation: "embedding",
      model: route.model,
      status: "success",
      latencyMs: Date.now() - startedAt,
      usage: result.usage,
      billedTo: resolveBilledTo(route),
      costUsdMicros: priced.costUsdMicros,
      costAvailability: priced.priceDisplayMode,
      priceDisplayMode: priced.priceDisplayMode,
      pricingOperation: "embedding",
      pricingVersion: pricing.pricingVersion,
      pricingReason: priced.pricingReason,
      stage: args.stage ?? "embedding",
      visibility: args.visibility ?? "background",
      metadata: args.metadata,
      link: args.link,
    });
    return result.embeddings;
  } catch (error) {
    await recordAiUsage(ctx, route, {
      userId: args.userId,
      feature: args.feature,
      operation: "embedding",
      model: route.model,
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
  const startedAt = Date.now();
  const audioSeconds =
    typeof args.durationMs === "number" && args.durationMs > 0 ? args.durationMs / 1000 : undefined;
  try {
    const response = await adapter.transcribeAudio({
      route,
      audioBase64: args.audioBase64,
      format: args.format,
      language: args.language,
    });
    const pricing = await resolvePricing(ctx, {
      provider: route.provider,
      model: route.model,
      operation: "transcription",
    });
    const priced = estimatePricingMicros({ pricing, audioSeconds });
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
      pricingVersion: pricing.pricingVersion,
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
