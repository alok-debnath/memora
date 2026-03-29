import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import {
  moodValidator,
  categoryValidator,
  importanceValidator,
  lifeAreaValidator,
  extractedActionsValidator,
  contextTagsValidator,
} from "./lib/validators";

export const updateEmbedding = internalMutation({
  args: {
    memoryId: v.id("memories"),
    embedding: v.array(v.float64()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.memoryId, { embedding: args.embedding });
  },
});

export const updateAnalysis = internalMutation({
  args: {
    memoryId: v.id("memories"),
    sentimentScore: v.float64(),
    extractedActions: extractedActionsValidator,
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.memoryId, {
      sentimentScore: args.sentimentScore,
      extractedActions: args.extractedActions,
    });
  },
});

export const updateAIFields = internalMutation({
  args: {
    memoryId: v.id("memories"),
    title: v.optional(v.string()),
    category: v.optional(categoryValidator),
    mood: v.optional(moodValidator),
    tags: v.optional(v.array(v.string())),
    people: v.optional(v.array(v.string())),
    locations: v.optional(v.array(v.string())),
    importance: v.optional(importanceValidator),
    lifeArea: v.optional(lifeAreaValidator),
    contextTags: v.optional(contextTagsValidator),
    linkedUrls: v.optional(v.array(v.string())),
    reminderDate: v.optional(v.string()),
    sentimentScore: v.optional(v.float64()),
    extractedActions: v.optional(extractedActionsValidator),
    embedding: v.optional(v.array(v.float64())),
  },
  handler: async (ctx, args) => {
    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(args)) {
      if (key !== "memoryId" && value !== undefined) {
        updates[key] = value;
      }
    }
    await ctx.db.patch(args.memoryId, updates);
  },
});
