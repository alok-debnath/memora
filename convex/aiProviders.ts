import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { aiCapabilityValidator, aiProviderValidator } from "./lib/validators";
import { requireAdmin, resolveUser } from "./lib/withAuth";
import {
  AI_CAPABILITIES,
  AI_PROVIDERS,
  DEFAULT_ROUTING,
  FEATURE_TO_CAPABILITY,
  supportsCapability,
  type AiCapability,
} from "./lib/ai";

function isProviderConfigured(provider: "openai" | "google") {
  if (provider === "openai") {
    return Boolean(process.env.OPENAI_API_KEY ?? process.env.CONVEX_OPENAI_API_KEY);
  }
  return Boolean(process.env.GEMINI_API_KEY);
}

function buildCapabilityMatrix(args: {
  preferredProvider: "openai" | "google";
  byokEnabled: boolean;
  connectedProviders: Set<"openai" | "google">;
  routing: Record<AiCapability, { provider: "openai" | "google"; model: string; enabled: boolean }>;
}) {
  return AI_CAPABILITIES.map((capability) => {
    const adminRoute = args.routing[capability];
    const preferredProviderSupported = supportsCapability(args.preferredProvider, capability);
    const hasPreferredKey = args.connectedProviders.has(args.preferredProvider);
    const usesByok =
      args.byokEnabled && preferredProviderSupported && hasPreferredKey && adminRoute.enabled;
    return {
      capability,
      effectiveProvider: usesByok ? args.preferredProvider : adminRoute.provider,
      model: adminRoute.model,
      billingOwner: (usesByok ? "user" : "platform") as "platform" | "user",
      source: (usesByok ? "user_byok" : "platform") as "platform" | "user_byok",
      reason: usesByok
        ? "byok"
        : args.byokEnabled && !preferredProviderSupported
          ? "provider_unsupported_for_capability"
          : args.byokEnabled && !hasPreferredKey
            ? "missing_user_key"
            : "admin_default",
      enabled: adminRoute.enabled,
    };
  });
}

export const getRoutingInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("aiRoutingConfig").take(20);
    const routing = Object.fromEntries(
      AI_CAPABILITIES.map((capability) => [
        capability,
        { capability, ...DEFAULT_ROUTING[capability] },
      ]),
    ) as Record<
      AiCapability,
      { capability: AiCapability; provider: "openai" | "google"; model: string; enabled: boolean }
    >;
    for (const row of rows) {
      routing[row.capability] = {
        capability: row.capability,
        provider: row.provider,
        model: row.model,
        enabled: row.enabled,
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
      preference: preference ?? {
        userId: args.userId,
        byokEnabled: false,
        preferredProvider: "openai" as const,
        updatedAt: 0,
      },
      secrets,
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

export const setByokPreference = mutation({
  args: {
    preferredProvider: aiProviderValidator,
    byokEnabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx);
    const existing = await ctx.db
      .query("userAiProviderPreferences")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        preferredProvider: args.preferredProvider,
        byokEnabled: args.byokEnabled,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("userAiProviderPreferences", {
        userId: user._id,
        preferredProvider: args.preferredProvider,
        byokEnabled: args.byokEnabled,
        updatedAt: now,
      });
    }
    return { success: true };
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
    preference: {
      userId: string;
      byokEnabled: boolean;
      preferredProvider: "openai" | "google";
      updatedAt: number;
    };
    providers: Array<{
      provider: "openai" | "google";
      configured: boolean;
      maskedKeySuffix?: string;
      baseUrl?: string;
      lastValidatedAt?: number;
      lastValidationStatus?: "valid" | "invalid";
      lastValidationMessage?: string;
      platformConfigured: boolean;
      supportedCapabilities: Array<
        "chat" | "structured_text" | "embeddings" | "vision" | "transcription" | "image_generation"
      >;
    }>;
    capabilityMatrix: Array<{
      capability:
        | "chat"
        | "structured_text"
        | "embeddings"
        | "vision"
        | "transcription"
        | "image_generation";
      effectiveProvider: "openai" | "google";
      model: string;
      billingOwner: "platform" | "user";
      source: "platform" | "user_byok";
      reason: string;
      enabled: boolean;
    }>;
  }> => {
    const user = await resolveUser(ctx);
    const routing: Record<
      AiCapability,
      { provider: "openai" | "google"; model: string; enabled: boolean }
    > = await ctx.runQuery(internal.aiProviders.getRoutingInternal, {});
    const state: {
      preference: {
        userId: string;
        byokEnabled: boolean;
        preferredProvider: "openai" | "google";
        updatedAt: number;
      };
      secrets: Array<{
        provider: "openai" | "google";
        maskedKeySuffix: string;
        baseUrl?: string;
        lastValidatedAt?: number;
        lastValidationStatus?: "valid" | "invalid";
        lastValidationMessage?: string;
      }>;
    } = await ctx.runQuery(internal.aiProviders.getUserProviderStateInternal, {
      userId: user._id,
    });
    const connectedProviders = new Set<"openai" | "google">(
      state.secrets.map((secret: { provider: "openai" | "google" }) => secret.provider),
    );
    return {
      preference: state.preference,
      providers: AI_PROVIDERS.map((provider) => {
        const secret = state.secrets.find(
          (entry: { provider: "openai" | "google" }) => entry.provider === provider,
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
          supportedCapabilities: AI_CAPABILITIES.filter((capability) =>
            supportsCapability(provider, capability),
          ),
        };
      }),
      capabilityMatrix: buildCapabilityMatrix({
        preferredProvider: state.preference.preferredProvider,
        byokEnabled: state.preference.byokEnabled,
        connectedProviders,
        routing,
      }),
    };
  },
});

export const getAdminRouting = query({
  args: {},
  handler: async (
    ctx,
  ): Promise<
    Array<{
      capability:
        | "chat"
        | "structured_text"
        | "embeddings"
        | "vision"
        | "transcription"
        | "image_generation";
      provider: "openai" | "google";
      model: string;
      enabled: boolean;
      supportedProviders: Array<"openai" | "google">;
    }>
  > => {
    await requireAdmin(ctx);
    const routing: Record<
      AiCapability,
      { provider: "openai" | "google"; model: string; enabled: boolean }
    > = await ctx.runQuery(internal.aiProviders.getRoutingInternal, {});
    return AI_CAPABILITIES.map((capability) => ({
      capability,
      ...routing[capability],
      supportedProviders: AI_PROVIDERS.filter((provider) =>
        supportsCapability(provider, capability),
      ),
    }));
  },
});

export const setAdminRouting = mutation({
  args: {
    capability: aiCapabilityValidator,
    provider: aiProviderValidator,
    model: v.string(),
    enabled: v.boolean(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (!supportsCapability(args.provider, args.capability)) {
      throw new Error(`${args.provider} does not support ${args.capability}.`);
    }
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
      supportedCapabilities: AI_CAPABILITIES.filter((capability) =>
        supportsCapability(provider, capability),
      ),
      features: Object.entries(FEATURE_TO_CAPABILITY)
        .filter(([, capability]) => supportsCapability(provider, capability))
        .map(([feature]) => feature),
    }));
  },
});
