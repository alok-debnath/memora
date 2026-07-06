import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  aiCapabilityValidator,
  aiProviderValidator,
  embeddingRebuildStatusValidator,
} from "./lib/validators";
import { requireAdmin, resolveUser } from "./lib/withAuth";
import {
  AI_CAPABILITIES,
  AI_PROVIDERS,
  DEFAULT_ROUTING,
  FEATURE_TO_CAPABILITY,
  USER_VISIBLE_AI_CAPABILITIES,
  buildEmbeddingFingerprint,
  getSelectedProviderModel,
  getProviderDefaultModel,
  getProviderModels,
  isEmbeddingRebuildActive,
  normalizeProviderModelSelections,
  supportsCapability,
  supportsProviderModelCapability,
  type AiCapability,
  type AiProvider,
  type AiProviderModelSelections,
  type AiRoutingEntry,
  type EmbeddingRebuildStatus,
} from "./lib/ai";

type Provider = "openai" | "google";

type PreferenceState = {
  userId: Id<"users">;
  byokEnabled: boolean;
  preferredProvider: Provider;
  capabilityModels?: Partial<Record<AiCapability, string>>;
  providerModels?: AiProviderModelSelections;
  targetEmbeddingFingerprint?: string;
  lastReadyEmbeddingFingerprint?: string;
  embeddingRebuildStatus?: EmbeddingRebuildStatus;
  embeddingRebuildStartedAt?: number;
  embeddingRebuildUpdatedAt?: number;
  embeddingRebuildProcessed?: number;
  embeddingRebuildTotal?: number;
  embeddingRebuildError?: string;
  updatedAt: number;
};

function isProviderConfigured(provider: Provider) {
  if (provider === "openai") {
    return Boolean(process.env.OPENAI_API_KEY ?? process.env.CONVEX_OPENAI_API_KEY);
  }
  return Boolean(process.env.GEMINI_API_KEY);
}

function getSupportedCapabilitiesForProvider(provider: Provider) {
  return USER_VISIBLE_AI_CAPABILITIES.filter((capability) =>
    supportsCapability(provider, capability),
  );
}

function getProviderDefaultModels(provider: Provider) {
  return Object.fromEntries(
    USER_VISIBLE_AI_CAPABILITIES.map((capability) => [
      capability,
      getProviderDefaultModel(provider, capability),
    ]).filter(([, model]) => Boolean(model)),
  ) as Partial<Record<AiCapability, string>>;
}

function isUserVisibleCapability(
  capability: AiCapability,
): capability is (typeof USER_VISIBLE_AI_CAPABILITIES)[number] {
  return USER_VISIBLE_AI_CAPABILITIES.includes(
    capability as (typeof USER_VISIBLE_AI_CAPABILITIES)[number],
  );
}

function getProviderAvailableModels(provider: Provider) {
  return getProviderModels(provider)
    .filter((model) => model.capabilities.some(isUserVisibleCapability))
    .map((model) => ({
      id: model.id,
      label: model.label,
      capabilities: model.capabilities.filter(isUserVisibleCapability),
    }));
}

function getDefaultPreferenceState(userId: Id<"users">): PreferenceState {
  return {
    userId,
    byokEnabled: false,
    preferredProvider: "openai",
    capabilityModels: {},
    providerModels: {},
    embeddingRebuildStatus: "idle",
    embeddingRebuildProcessed: 0,
    updatedAt: 0,
  };
}

function getSelectedModelForCapability(args: {
  provider: Provider;
  preferredProvider: Provider;
  capabilityModels?: Partial<Record<AiCapability, string>>;
  providerModels?: AiProviderModelSelections;
  capability: AiCapability;
}) {
  return (
    getSelectedProviderModel({
      provider: args.provider,
      preferredProvider: args.preferredProvider,
      capability: args.capability,
      capabilityModels: args.capabilityModels,
      providerModels: args.providerModels,
    }) ?? ""
  );
}

function getEffectiveEmbeddingRoute(args: {
  preferredProvider: Provider;
  byokEnabled: boolean;
  capabilityModels?: Partial<Record<AiCapability, string>>;
  providerModels?: AiProviderModelSelections;
  routing: Record<AiCapability, { provider: Provider; model: string; enabled: boolean }>;
}) {
  if (args.byokEnabled) {
    return {
      provider: args.preferredProvider,
      model: getSelectedModelForCapability({
        provider: args.preferredProvider,
        preferredProvider: args.preferredProvider,
        capabilityModels: args.capabilityModels,
        providerModels: args.providerModels,
        capability: "embeddings",
      }),
    };
  }
  return {
    provider: args.routing.embeddings.provider,
    model: args.routing.embeddings.model,
  };
}

function buildActiveByokCapabilities(args: {
  preferredProvider: Provider;
  byokEnabled: boolean;
  connectedProviders: Set<Provider>;
  capabilityModels?: Partial<Record<AiCapability, string>>;
  providerModels?: AiProviderModelSelections;
  embeddingRebuildStatus?: EmbeddingRebuildStatus;
}) {
  const embeddingRebuildActive = isEmbeddingRebuildActive(args.embeddingRebuildStatus);

  return USER_VISIBLE_AI_CAPABILITIES.map((capability) => {
    const hasPreferredKey = args.connectedProviders.has(args.preferredProvider);
    const selectedModel = getSelectedModelForCapability({
      provider: args.preferredProvider,
      preferredProvider: args.preferredProvider,
      capabilityModels: args.capabilityModels,
      providerModels: args.providerModels,
      capability,
    });
    const providerModelSupported =
      Boolean(selectedModel) &&
      supportsProviderModelCapability(args.preferredProvider, selectedModel, capability);
    const isEmbeddingBlocked = capability === "embeddings" && embeddingRebuildActive;
    const active =
      args.byokEnabled && hasPreferredKey && providerModelSupported && !isEmbeddingBlocked;
    const available = hasPreferredKey && providerModelSupported && !isEmbeddingBlocked;

    return {
      capability,
      provider: args.preferredProvider,
      model: selectedModel,
      active,
      available,
      reason: isEmbeddingBlocked
        ? "rebuilding_embeddings"
        : active
          ? "byok"
          : !args.byokEnabled
            ? "byok_disabled"
            : !hasPreferredKey
              ? "missing_user_key"
              : !selectedModel
                ? "missing_model_selection"
                : !providerModelSupported
                  ? "model_unsupported_for_capability"
                  : "ready",
    };
  });
}

export const getRoutingInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("aiRoutingConfig").take(20);
    // Start from code-level bootstrap defaults (used only until the table is seeded).
    // DB rows always override — admin changes via setAdminRouting or seedRoutingConfig
    // are the authoritative source of truth.
    const routing = Object.fromEntries(
      AI_CAPABILITIES.map((capability) => [
        capability,
        { capability, ...DEFAULT_ROUTING[capability] },
      ]),
    ) as Record<AiCapability, { capability: AiCapability } & AiRoutingEntry>;
    for (const row of rows) {
      routing[row.capability] = {
        capability: row.capability,
        provider: row.provider,
        model: row.model,
        enabled: row.enabled,
        fallbackProvider: row.fallbackProvider,
        fallbackModel: row.fallbackModel,
        fallbackEnabled: row.fallbackEnabled,
      };
    }
    return routing;
  },
});

export const getUserProviderStateInternal = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const preference = await ctx.db
      .query("userAiProviderPreferences")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    const secrets = await ctx.db
      .query("userAiProviderSecrets")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .take(10);
    return {
      preference: preference ?? getDefaultPreferenceState(args.userId),
      secrets,
    };
  },
});

export const getEmbeddingStatusInternal = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const preference = await ctx.db
      .query("userAiProviderPreferences")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    return {
      embeddingRebuildStatus: preference?.embeddingRebuildStatus ?? "idle",
      targetEmbeddingFingerprint: preference?.targetEmbeddingFingerprint,
      lastReadyEmbeddingFingerprint: preference?.lastReadyEmbeddingFingerprint,
      embeddingRebuildProcessed: preference?.embeddingRebuildProcessed,
      embeddingRebuildTotal: preference?.embeddingRebuildTotal,
      embeddingRebuildStartedAt: preference?.embeddingRebuildStartedAt,
      embeddingRebuildUpdatedAt: preference?.embeddingRebuildUpdatedAt,
      embeddingRebuildError: preference?.embeddingRebuildError,
      isRebuilding: isEmbeddingRebuildActive(preference?.embeddingRebuildStatus),
    };
  },
});

export const getProviderSecretInternal = internalQuery({
  args: {
    userId: v.id("users"),
    provider: aiProviderValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("userAiProviderSecrets")
      .withIndex("by_user_and_provider", (q) =>
        q.eq("userId", args.userId).eq("provider", args.provider),
      )
      .unique();
  },
});

export const saveProviderSecretInternal = internalMutation({
  args: {
    userId: v.id("users"),
    provider: aiProviderValidator,
    label: v.optional(v.string()),
    maskedKeySuffix: v.string(),
    ciphertext: v.string(),
    iv: v.string(),
    authTag: v.string(),
    keyVersion: v.number(),
    baseUrl: v.optional(v.string()),
    lastValidatedAt: v.optional(v.number()),
    lastValidationStatus: v.optional(v.union(v.literal("valid"), v.literal("invalid"))),
    lastValidationMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("userAiProviderSecrets")
      .withIndex("by_user_and_provider", (q) =>
        q.eq("userId", args.userId).eq("provider", args.provider),
      )
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        label: args.label,
        maskedKeySuffix: args.maskedKeySuffix,
        ciphertext: args.ciphertext,
        iv: args.iv,
        authTag: args.authTag,
        keyVersion: args.keyVersion,
        baseUrl: args.baseUrl,
        lastValidatedAt: args.lastValidatedAt,
        lastValidationStatus: args.lastValidationStatus,
        lastValidationMessage: args.lastValidationMessage,
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("userAiProviderSecrets", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateEmbeddingRebuildStateInternal = internalMutation({
  args: {
    userId: v.id("users"),
    embeddingRebuildStatus: v.optional(embeddingRebuildStatusValidator),
    targetEmbeddingFingerprint: v.optional(v.string()),
    lastReadyEmbeddingFingerprint: v.optional(v.string()),
    embeddingRebuildStartedAt: v.optional(v.number()),
    embeddingRebuildUpdatedAt: v.optional(v.number()),
    embeddingRebuildProcessed: v.optional(v.number()),
    embeddingRebuildTotal: v.optional(v.number()),
    embeddingRebuildError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("userAiProviderPreferences")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    if (!existing) {
      return null;
    }
    await ctx.db.patch(existing._id, {
      ...(args.embeddingRebuildStatus !== undefined
        ? { embeddingRebuildStatus: args.embeddingRebuildStatus }
        : {}),
      ...(args.targetEmbeddingFingerprint !== undefined
        ? { targetEmbeddingFingerprint: args.targetEmbeddingFingerprint }
        : {}),
      ...(args.lastReadyEmbeddingFingerprint !== undefined
        ? { lastReadyEmbeddingFingerprint: args.lastReadyEmbeddingFingerprint }
        : {}),
      ...(args.embeddingRebuildStartedAt !== undefined
        ? { embeddingRebuildStartedAt: args.embeddingRebuildStartedAt }
        : {}),
      ...(args.embeddingRebuildUpdatedAt !== undefined
        ? { embeddingRebuildUpdatedAt: args.embeddingRebuildUpdatedAt }
        : {}),
      ...(args.embeddingRebuildProcessed !== undefined
        ? { embeddingRebuildProcessed: args.embeddingRebuildProcessed }
        : {}),
      ...(args.embeddingRebuildTotal !== undefined
        ? { embeddingRebuildTotal: args.embeddingRebuildTotal }
        : {}),
      ...(args.embeddingRebuildError !== undefined
        ? { embeddingRebuildError: args.embeddingRebuildError }
        : {}),
      updatedAt: Date.now(),
    });
    return existing._id;
  },
});

export const setByokPreference = mutation({
  args: {
    preferredProvider: aiProviderValidator,
    byokEnabled: v.boolean(),
    capabilityModels: v.optional(v.record(v.string(), v.string())),
    providerModels: v.optional(v.record(v.string(), v.record(v.string(), v.string()))),
  },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx);
    const routing: Record<AiCapability, { provider: Provider; model: string; enabled: boolean }> =
      await ctx.runQuery(internal.aiProviders.getRoutingInternal, {});
    const existing = await ctx.db
      .query("userAiProviderPreferences")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    const secrets = await ctx.db
      .query("userAiProviderSecrets")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(10);
    const connectedProviders = new Set<Provider>(secrets.map((secret) => secret.provider));
    const current = existing ?? getDefaultPreferenceState(user._id);
    const currentProviderModels = normalizeProviderModelSelections({
      preferredProvider: current.preferredProvider,
      capabilityModels: current.capabilityModels,
      providerModels: current.providerModels,
    });
    const nextProviderModels = {
      ...currentProviderModels,
      ...(args.providerModels ?? {}),
      ...(args.capabilityModels
        ? {
            [args.preferredProvider]: {
              ...(currentProviderModels[args.preferredProvider] ?? {}),
              ...((args.providerModels ?? {})[args.preferredProvider] ?? {}),
              ...args.capabilityModels,
            },
          }
        : {}),
    } as AiProviderModelSelections;
    const currentHasPreferredKey = connectedProviders.has(current.preferredProvider);
    const nextHasPreferredKey = connectedProviders.has(args.preferredProvider);

    const currentEmbeddingRoute = getEffectiveEmbeddingRoute({
      preferredProvider: current.preferredProvider,
      byokEnabled: current.byokEnabled && currentHasPreferredKey,
      providerModels: currentProviderModels,
      routing,
    });
    const nextEmbeddingRoute = getEffectiveEmbeddingRoute({
      preferredProvider: args.preferredProvider,
      byokEnabled: args.byokEnabled && nextHasPreferredKey,
      providerModels: nextProviderModels,
      routing,
    });

    if (
      !supportsProviderModelCapability(
        nextEmbeddingRoute.provider,
        nextEmbeddingRoute.model,
        "embeddings",
      )
    ) {
      throw new Error(
        `${nextEmbeddingRoute.provider} model ${nextEmbeddingRoute.model} is not verified for embeddings.`,
      );
    }

    const currentEmbeddingFingerprint = buildEmbeddingFingerprint(
      currentEmbeddingRoute.provider,
      currentEmbeddingRoute.model,
    );
    const nextEmbeddingFingerprint = buildEmbeddingFingerprint(
      nextEmbeddingRoute.provider,
      nextEmbeddingRoute.model,
    );
    const embeddingRouteChanged = currentEmbeddingFingerprint !== nextEmbeddingFingerprint;

    if (
      embeddingRouteChanged &&
      isEmbeddingRebuildActive(current.embeddingRebuildStatus ?? "idle")
    ) {
      throw new Error("Embedding rebuild is already in progress. Wait for it to finish first.");
    }

    const now = Date.now();
    const nextPreference = {
      preferredProvider: args.preferredProvider,
      byokEnabled: args.byokEnabled,
      providerModels: nextProviderModels,
      updatedAt: now,
      ...(embeddingRouteChanged
        ? {
            targetEmbeddingFingerprint: nextEmbeddingFingerprint,
            lastReadyEmbeddingFingerprint:
              current.lastReadyEmbeddingFingerprint ?? currentEmbeddingFingerprint,
            embeddingRebuildStatus: "queued" as const,
            embeddingRebuildStartedAt: now,
            embeddingRebuildUpdatedAt: now,
            embeddingRebuildProcessed: 0,
            embeddingRebuildTotal: await ctx.runQuery(
              internal.memories.countActiveForEmbeddingRebuild,
              { userId: user._id },
            ),
            embeddingRebuildError: undefined,
          }
        : {}),
    };

    if (existing) {
      await ctx.db.patch(existing._id, nextPreference);
    } else {
      await ctx.db.insert("userAiProviderPreferences", {
        userId: user._id,
        ...nextPreference,
        ...(embeddingRouteChanged ? {} : { embeddingRebuildStatus: "idle" as const }),
      });
    }

    if (embeddingRouteChanged) {
      await ctx.scheduler.runAfter(0, internal.memories.clearQueryCacheForUser, {
        userId: user._id,
      });
      await ctx.scheduler.runAfter(0, internal.actions.backfillEmbeddings.rebuildUserEmbeddings, {
        userId: user._id,
      });
    }

    return { success: true, embeddingRouteChanged };
  },
});

export const deleteProviderKey = mutation({
  args: {
    provider: aiProviderValidator,
  },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx);
    const existing = await ctx.db
      .query("userAiProviderSecrets")
      .withIndex("by_user_and_provider", (q) =>
        q.eq("userId", user._id).eq("provider", args.provider),
      )
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    return { success: true };
  },
});

export const getSettings = query({
  args: {},
  handler: async (
    ctx,
  ): Promise<{
    preference: Omit<PreferenceState, "capabilityModels" | "providerModels"> & {
      providerModels: AiProviderModelSelections;
    };
    providers: Array<{
      provider: Provider;
      configured: boolean;
      maskedKeySuffix?: string;
      baseUrl?: string;
      lastValidatedAt?: number;
      lastValidationStatus?: "valid" | "invalid";
      lastValidationMessage?: string;
      platformConfigured: boolean;
      supportedCapabilities: Array<
        "chat" | "structured_text" | "embeddings" | "vision" | "transcription"
      >;
      availableModels: Array<{
        id: string;
        label: string;
        capabilities: Array<"chat" | "structured_text" | "embeddings" | "vision" | "transcription">;
      }>;
      defaultModels: Partial<Record<AiCapability, string>>;
      savedModels: Partial<Record<AiCapability, string>>;
    }>;
    activeByok: {
      enabled: boolean;
      provider: Provider;
      configured: boolean;
      capabilities: Array<{
        capability: "chat" | "structured_text" | "embeddings" | "vision" | "transcription";
        provider: Provider;
        model: string;
        active: boolean;
        available: boolean;
        reason: string;
      }>;
    };
  }> => {
    const user = await resolveUser(ctx);
    const state: {
      preference: PreferenceState;
      secrets: Array<{
        provider: Provider;
        maskedKeySuffix: string;
        baseUrl?: string;
        lastValidatedAt?: number;
        lastValidationStatus?: "valid" | "invalid";
        lastValidationMessage?: string;
      }>;
    } = await ctx.runQuery(internal.aiProviders.getUserProviderStateInternal, {
      userId: user._id,
    });
    const normalizedProviderModels = normalizeProviderModelSelections({
      preferredProvider: state.preference.preferredProvider,
      capabilityModels: state.preference.capabilityModels,
      providerModels: state.preference.providerModels,
    });
    const connectedProviders = new Set<Provider>(
      state.secrets.map((secret: { provider: Provider }) => secret.provider),
    );

    return {
      preference: {
        userId: state.preference.userId,
        byokEnabled: state.preference.byokEnabled,
        preferredProvider: state.preference.preferredProvider,
        providerModels: normalizedProviderModels,
        targetEmbeddingFingerprint: state.preference.targetEmbeddingFingerprint,
        lastReadyEmbeddingFingerprint: state.preference.lastReadyEmbeddingFingerprint,
        embeddingRebuildStatus: state.preference.embeddingRebuildStatus,
        embeddingRebuildStartedAt: state.preference.embeddingRebuildStartedAt,
        embeddingRebuildUpdatedAt: state.preference.embeddingRebuildUpdatedAt,
        embeddingRebuildProcessed: state.preference.embeddingRebuildProcessed,
        embeddingRebuildTotal: state.preference.embeddingRebuildTotal,
        embeddingRebuildError: state.preference.embeddingRebuildError,
        updatedAt: state.preference.updatedAt,
      },
      providers: AI_PROVIDERS.map((provider) => {
        const secret = state.secrets.find(
          (entry: { provider: Provider }) => entry.provider === provider,
        );
        return {
          provider,
          configured: Boolean(secret),
          maskedKeySuffix: secret?.maskedKeySuffix,
          baseUrl: secret?.baseUrl,
          lastValidatedAt: secret?.lastValidatedAt,
          lastValidationStatus: secret?.lastValidationStatus,
          lastValidationMessage: secret?.lastValidationMessage,
          platformConfigured: isProviderConfigured(provider),
          supportedCapabilities: getSupportedCapabilitiesForProvider(provider),
          availableModels: getProviderAvailableModels(provider),
          defaultModels: getProviderDefaultModels(provider),
          savedModels: normalizedProviderModels[provider] ?? {},
        };
      }),
      activeByok: {
        enabled: state.preference.byokEnabled,
        provider: state.preference.preferredProvider,
        configured: connectedProviders.has(state.preference.preferredProvider),
        capabilities: buildActiveByokCapabilities({
          preferredProvider: state.preference.preferredProvider,
          byokEnabled: state.preference.byokEnabled,
          capabilityModels: state.preference.capabilityModels,
          providerModels: normalizedProviderModels,
          connectedProviders,
          embeddingRebuildStatus: state.preference.embeddingRebuildStatus,
        }),
      },
    };
  },
});

export const getAdminRouting = query({
  args: {},
  handler: async (
    ctx,
  ): Promise<
    Array<{
      capability: "chat" | "structured_text" | "embeddings" | "vision" | "transcription";
      provider: Provider;
      model: string;
      enabled: boolean;
      fallbackProvider?: AiProvider;
      fallbackModel?: string;
      fallbackEnabled?: boolean;
      supportedProviders: Array<Provider>;
    }>
  > => {
    await requireAdmin(ctx);
    const routing: Record<AiCapability, AiRoutingEntry> = await ctx.runQuery(
      internal.aiProviders.getRoutingInternal,
      {},
    );
    return USER_VISIBLE_AI_CAPABILITIES.map((capability) => ({
      capability,
      ...routing[capability],
      supportedProviders: AI_PROVIDERS.filter((provider) =>
        supportsCapability(provider, capability),
      ),
    }));
  },
});

/**
 * Writes the default routing config to the DB for any capability that doesn't
 * already have a row. Safe to run multiple times — existing rows are not touched.
 * Run this once after first deploy: `npx convex run aiProviders:seedRoutingConfig`
 */
export const seedRoutingConfig = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const now = Date.now();
    const results = await Promise.all(
      AI_CAPABILITIES.map(async (capability) => {
        const existing = await ctx.db
          .query("aiRoutingConfig")
          .withIndex("by_capability", (q) => q.eq("capability", capability))
          .unique();
        if (existing) return false;
        const entry = DEFAULT_ROUTING[capability];
        await ctx.db.insert("aiRoutingConfig", {
          capability,
          provider: entry.provider,
          model: entry.model,
          enabled: entry.enabled,
          fallbackProvider: entry.fallbackProvider,
          fallbackModel: entry.fallbackModel,
          fallbackEnabled: entry.fallbackEnabled,
          updatedAt: now,
        });
        return true;
      }),
    );
    const seeded = results.filter(Boolean).length;
    return { seeded };
  },
});

export const setAdminRouting = mutation({
  args: {
    capability: aiCapabilityValidator,
    provider: aiProviderValidator,
    model: v.string(),
    enabled: v.boolean(),
    fallbackProvider: v.optional(aiProviderValidator),
    fallbackModel: v.optional(v.string()),
    fallbackEnabled: v.optional(v.boolean()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    // No model allowlist check here — admins are trusted to set valid model IDs.
    // The PROVIDER_MODELS list is used for BYOK user suggestions only.
    const existing = await ctx.db
      .query("aiRoutingConfig")
      .withIndex("by_capability", (q) => q.eq("capability", args.capability))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: now });
    } else {
      await ctx.db.insert("aiRoutingConfig", { ...args, updatedAt: now });
    }
    return { success: true };
  },
});

export const getProviderHealth = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const usersWithKeys = await ctx.db.query("userAiProviderSecrets").take(2000);
    return AI_PROVIDERS.map((provider) => ({
      provider,
      platformConfigured: isProviderConfigured(provider),
      userKeys: usersWithKeys.filter((row) => row.provider === provider).length,
      supportedCapabilities: getSupportedCapabilitiesForProvider(provider),
      features: Object.entries(FEATURE_TO_CAPABILITY)
        .filter(([, capability]) => supportsCapability(provider, capability))
        .map(([feature]) => feature),
    }));
  },
});
