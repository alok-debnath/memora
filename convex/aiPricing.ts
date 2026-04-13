import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { requireAdmin } from "./lib/withAuth";
import { aiPricingOperationValidator } from "./lib/validators";
import {
  DEFAULT_AI_PRICING_VERSION,
  buildDefaultPricingCatalog,
  getDefaultPricingEntry,
} from "./lib/aiPricing";

export const getPricingInternal = internalQuery({
  args: {
    provider: v.string(),
    model: v.string(),
    operation: aiPricingOperationValidator,
  },
  handler: async (ctx, args) => {
    const stored = await ctx.db
      .query("aiModelPricing")
      .withIndex("by_provider_model_and_operation", (q) =>
        q.eq("provider", args.provider).eq("model", args.model).eq("operation", args.operation),
      )
      .unique();
    const fallback = getDefaultPricingEntry(args.provider, args.model, args.operation);
    return (
      stored ?? (fallback ? { ...fallback, pricingVersion: DEFAULT_AI_PRICING_VERSION } : null)
    );
  },
});

export const syncDefaultPricingCatalog = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const now = Date.now();
    const defaults = buildDefaultPricingCatalog(now);
    for (const entry of defaults) {
      const existing = await ctx.db
        .query("aiModelPricing")
        .withIndex("by_provider_model_and_operation", (q) =>
          q
            .eq("provider", entry.provider)
            .eq("model", entry.model)
            .eq("operation", entry.operation),
        )
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, {
          ...entry,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("aiModelPricing", entry);
      }
    }
    return { success: true, count: defaults.length };
  },
});

export const getCatalog = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.db.query("aiModelPricing").take(200);
  },
});

export const resetPricingCatalog = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("aiModelPricing").take(200);
    for (const row of rows) {
      await ctx.db.delete(row._id);
    }
    return rows.length;
  },
});
