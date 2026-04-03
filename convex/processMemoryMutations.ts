import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import {
  moodValidator,
  importanceValidator,
  lifeAreaValidator,
  extractedActionsValidator,
  contextTagsValidator,
  memoryEntryKindValidator,
  memoryScheduleValidator,
} from "./lib/validators";
import { toStoredMemoryFields } from "./lib/memoryKind";

function hasSchedulingInput(value: {
  entryKind?: "memory" | "reminder";
  schedule?: unknown;
}) {
  return (
    value.entryKind !== undefined ||
    value.schedule !== undefined
  );
}

export const updateEmbedding = internalMutation({
  args: {
    memoryId: v.id("memories"),
    embedding: v.array(v.float64()),
  },
  handler: async (ctx, args) => {
    const memory = await ctx.db.get(args.memoryId);
    if (!memory || memory.isDeleted) {
      return;
    }
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
    const memory = await ctx.db.get(args.memoryId);
    if (!memory || memory.isDeleted) {
      return;
    }
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
    mood: v.optional(moodValidator),
    people: v.optional(v.array(v.string())),
    locations: v.optional(v.array(v.string())),
    importance: v.optional(importanceValidator),
    lifeArea: v.optional(lifeAreaValidator),
    contextTags: v.optional(contextTagsValidator),
    linkedUrls: v.optional(v.array(v.string())),
    entryKind: v.optional(memoryEntryKindValidator),
    schedule: v.optional(memoryScheduleValidator),
    sentimentScore: v.optional(v.float64()),
    extractedActions: v.optional(extractedActionsValidator),
    embedding: v.optional(v.array(v.float64())),
  },
  handler: async (ctx, args) => {
    const memory = await ctx.db.get(args.memoryId);
    if (!memory || memory.isDeleted) {
      return;
    }
    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(args)) {
      if (key !== "memoryId" && value !== undefined) {
        updates[key] = value;
      }
    }
    if (hasSchedulingInput(args)) {
      Object.assign(
        updates,
        toStoredMemoryFields({
          entryKind: args.entryKind,
          schedule: args.schedule,
        })
      );
    }
    await ctx.db.patch(args.memoryId, updates);
  },
});
