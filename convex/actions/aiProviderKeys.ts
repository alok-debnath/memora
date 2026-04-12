"use node";

import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import { action } from "../_generated/server";
import { maskApiKey } from "../lib/ai";
import { encryptSecret } from "../lib/aiSecrets";
import { aiProviderValidator } from "../lib/validators";

async function validateProviderKey(args: {
  provider: "openai" | "google";
  apiKey: string;
  baseUrl?: string;
}) {
  if (args.provider === "openai") {
    const response = await fetch(`${args.baseUrl ?? "https://api.openai.com/v1"}/models`, {
      headers: { Authorization: `Bearer ${args.apiKey}` },
    });
    if (!response.ok) {
      throw new Error("OpenAI key validation failed.");
    }
    return { message: "OpenAI key is valid." };
  }

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models?key=" +
      encodeURIComponent(args.apiKey),
  );
  if (!response.ok) {
    throw new Error("Google AI key validation failed.");
  }
  return { message: "Google AI key is valid." };
}

export const upsertProviderKey = action({
  args: {
    provider: aiProviderValidator,
    apiKey: v.string(),
    baseUrl: v.optional(v.string()),
    label: v.optional(v.string()),
    validate: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(api.auth.me, { token: "authenticated" });
    if (!user) {
      throw new Error("Not authenticated");
    }

    let validationStatus: "valid" | "invalid" | undefined;
    let validationMessage: string | undefined;
    if (args.validate !== false) {
      try {
        const result = await validateProviderKey({
          provider: args.provider,
          apiKey: args.apiKey.trim(),
          baseUrl: args.baseUrl?.trim() || undefined,
        });
        validationStatus = "valid";
        validationMessage = result.message;
      } catch (error) {
        validationStatus = "invalid";
        validationMessage = error instanceof Error ? error.message : "Validation failed.";
        throw error;
      }
    }

    const encrypted = encryptSecret(args.apiKey.trim());
    await ctx.runMutation(internal.aiProviders.saveProviderSecretInternal, {
      userId: user._id,
      provider: args.provider,
      label: args.label?.trim() || undefined,
      maskedKeySuffix: maskApiKey(args.apiKey),
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      keyVersion: encrypted.keyVersion,
      baseUrl: args.baseUrl?.trim() || undefined,
      lastValidatedAt: Date.now(),
      lastValidationStatus: validationStatus,
      lastValidationMessage: validationMessage,
    });
    return { success: true, validationStatus, validationMessage };
  },
});

export const validateProviderKeyAction = action({
  args: {
    provider: aiProviderValidator,
    apiKey: v.string(),
    baseUrl: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    return await validateProviderKey({
      provider: args.provider,
      apiKey: args.apiKey.trim(),
      baseUrl: args.baseUrl?.trim() || undefined,
    });
  },
});
