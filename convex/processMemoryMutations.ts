import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { applyUserMemoryStatsTransition } from "./lib/memoryStats";
import {
  importanceValidator,
  lifeAreaValidator,
  extractedActionsValidator,
  contextTagsValidator,
  memoryEntryKindValidator,
  memoryScheduleValidator,
} from "./lib/validators";
import { deriveEmbeddingState, toStoredMemoryFields } from "./lib/memoryKind";

function hasSchedulingInput(value: {
  entryKind?: "memory" | "reminder";
  schedule?: unknown;
}) {
  return (
    value.entryKind !== undefined ||
    value.schedule !== undefined
  );
}

function isSameValue(left: unknown, right: unknown) {
  if (left === right) {
    return true;
  }
  if (left === undefined || right === undefined) {
    return left === right;
  }
  return JSON.stringify(left) === JSON.stringify(right);
}

export const updateEmbedding = internalMutation({
  args: {
    memoryId: v.id("memories"),
    embedding: v.array(v.float64()),
  },
  handler: async (ctx, args) => {
    const memory = await ctx.db.get(args.memoryId);
    if (!memory || memory.status !== "active") {
      return;
    }
    if (isSameValue(memory.embedding, args.embedding)) {
      return;
    }
    await ctx.db.patch(args.memoryId, {
      embedding: args.embedding,
      embeddingState: deriveEmbeddingState(args.embedding),
    });
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
    if (!memory || memory.status !== "active") {
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
    if (!memory || memory.status !== "active") {
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
    if (args.embedding !== undefined) {
      updates.embeddingState = deriveEmbeddingState(args.embedding);
    }
    const changedEntries = Object.entries(updates).filter(([key, value]) => {
      const currentValue = (memory as Record<string, unknown>)[key];
      return !isSameValue(currentValue, value);
    });
    if (changedEntries.length === 0) {
      return;
    }
    const finalPatch = Object.fromEntries(changedEntries);
    await ctx.db.patch(args.memoryId, finalPatch);
    await applyUserMemoryStatsTransition(ctx, memory, {
      ...memory,
      ...finalPatch,
    });
  },
});
