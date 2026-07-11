import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
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

function hasSchedulingInput(value: { entryKind?: "memory" | "reminder"; schedule?: unknown }) {
  return value.entryKind !== undefined || value.schedule !== undefined;
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

async function isCalendarSyncEnabledForUser(ctx: MutationCtx, userId: Id<"users">) {
  const integration = await ctx.db
    .query("userIntegrations")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  if (!integration) return false;
  const grantedScopes = integration.grantedScopes ?? [];
  const hasCalendarScope =
    grantedScopes.includes("https://www.googleapis.com/auth/calendar") ||
    grantedScopes.includes("https://www.googleapis.com/auth/calendar.events");
  return hasCalendarScope && integration.calendarEnabled !== false;
}

export const updateEmbedding = internalMutation({
  args: {
    memoryId: v.id("memories"),
    embedding: v.array(v.float64()),
    embeddingFingerprint: v.optional(v.string()),
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
      ...(args.embeddingFingerprint ? { embeddingFingerprint: args.embeddingFingerprint } : {}),
      embeddingState: deriveEmbeddingState(args.embedding),
    });
  },
});

export const updateEmbeddingsBatch = internalMutation({
  args: {
    updates: v.array(
      v.object({
        memoryId: v.id("memories"),
        embedding: v.array(v.float64()),
        embeddingFingerprint: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    for (const update of args.updates.slice(0, 50)) {
      const memory = await ctx.db.get(update.memoryId);
      if (
        !memory ||
        memory.status !== "active" ||
        isSameValue(memory.embedding, update.embedding)
      ) {
        continue;
      }
      await ctx.db.patch(update.memoryId, {
        embedding: update.embedding,
        ...(update.embeddingFingerprint
          ? { embeddingFingerprint: update.embeddingFingerprint }
          : {}),
        embeddingState: deriveEmbeddingState(update.embedding),
      });
    }
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
    nextDueAt: v.optional(v.string()),
    sentimentScore: v.optional(v.float64()),
    extractedActions: v.optional(extractedActionsValidator),
    embedding: v.optional(v.array(v.float64())),
    embeddingFingerprint: v.optional(v.string()),
    searchText: v.optional(v.string()),
    semanticSummary: v.optional(v.string()),
    searchAliases: v.optional(v.array(v.string())),
    searchConcepts: v.optional(v.array(v.string())),
    retrievalVersion: v.optional(v.number()),
    retrievalState: v.optional(
      v.union(v.literal("pending"), v.literal("ready"), v.literal("failed")),
    ),
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
        }),
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

    // Sync to Google Calendar if it's a reminder or was changed to one
    const updatedMemory = await ctx.db.get(args.memoryId);
    if (
      updatedMemory &&
      memory.entryKind === "reminder" &&
      updatedMemory.entryKind !== "reminder"
    ) {
      if (memory.googleEventId) {
        await ctx.scheduler.runAfter(0, internal.integrations.deleteGoogleEvent, {
          userId: memory.userId,
          googleEventId: memory.googleEventId,
        });
      }
      await ctx.db.patch(args.memoryId, {
        googleEventId: undefined,
        googleSyncStatus: undefined,
        googleSyncMessage: undefined,
        googleSyncUpdatedAt: Date.now(),
        googleSyncLockToken: undefined,
        googleSyncLockAt: undefined,
        googleSyncFingerprint: undefined,
        googleSyncDesiredFingerprint: undefined,
      });
    } else if (updatedMemory && updatedMemory.entryKind === "reminder") {
      if (!(await isCalendarSyncEnabledForUser(ctx, updatedMemory.userId))) {
        return;
      }
      await ctx.runMutation(internal.integrations.queueReminderSync, {
        memoryId: updatedMemory._id,
        pendingMessage: "Reminder updated. Syncing changes to Google Calendar...",
      });
    }
  },
});
