import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { resolveUser } from "./lib/withAuth";
import { applyUserMemoryStatsTransition } from "./lib/memoryStats";
import { deriveEmbeddingState, toStoredMemoryFields } from "./lib/memoryKind";
import { parseMemorySnapshot, serializeMemorySnapshot } from "./lib/memorySnapshot";
import type { Id } from "./_generated/dataModel";

function withDerivedMemoryFields<T extends { entryKind?: "memory" | "reminder"; schedule?: { dueAt: string; isRecurring: boolean; recurrenceType?: "daily" | "weekly" | "monthly" | "yearly" } }>(
  memory: T
) {
  return {
    ...memory,
    ...toStoredMemoryFields({
      entryKind: memory.entryKind,
      schedule: memory.schedule,
    }),
    embeddingState: deriveEmbeddingState(undefined),
  };
}

export const getMemoryHistory = query({
  args: {
    token: v.string(),
    memoryId: v.id("memories"),
  },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const memory = await ctx.db.get(args.memoryId);
    if (!memory || memory.userId !== userId) return [];
    return await ctx.db
      .query("memoryHistory")
      .withIndex("by_memory", (q) => q.eq("memoryId", args.memoryId))
      .order("desc")
      .take(100);
  },
});

export const listSnapshots = query({
  args: {
    token: v.string(),
    memoryId: v.optional(v.id("memories")),
    limit: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const rows = args.memoryId
      ? await ctx.db
          .query("memoryHistory")
          .withIndex("by_memory", (q) => q.eq("memoryId", args.memoryId!))
          .order("desc")
          .take(args.limit ? Math.min(args.limit, 50) : 10)
      : await ctx.db
          .query("memoryHistory")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .order("desc")
          .take(args.limit ? Math.min(args.limit, 50) : 10);

    return rows
      .filter((row) => row.userId === userId)
      .map((row) => ({
        historyId: row._id,
        memoryId: row.memoryId,
        action: row.changeReason === "deleted" ? "deleted" : "edited",
        title: row.previousTitle ?? "",
        contentPreview: (row.previousContent ?? "").slice(0, 120),
        changedAt: row.editedAt,
      }));
  },
});

export const createSnapshot = mutation({
  args: {
    token: v.string(),
    memoryId: v.id("memories"),
    changeReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const memory = await ctx.db.get(args.memoryId);
    if (!memory || memory.userId !== userId || memory.status !== "active") {
      throw new Error("Not found");
    }

    return await ctx.db.insert("memoryHistory", {
      memoryId: args.memoryId,
      userId,
      previousContent: memory.content,
      previousTitle: memory.title,
      editedAt: Date.now(),
      changeReason: args.changeReason,
      snapshotJson: serializeMemorySnapshot(memory),
    });
  },
});

export const undo = mutation({
  args: {
    token: v.string(),
    memoryId: v.optional(v.id("memories")),
  },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const rows = args.memoryId
      ? await ctx.db
          .query("memoryHistory")
          .withIndex("by_memory", (q) => q.eq("memoryId", args.memoryId!))
          .order("desc")
          .take(1)
      : await ctx.db
          .query("memoryHistory")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .order("desc")
          .take(1);

    const entry = rows.find((row) => row.userId === userId);
    if (!entry) {
      return { error: "Nothing to undo" };
    }

    const snapshot = parseMemorySnapshot(entry.snapshotJson);
    if (!snapshot) {
      return { error: "Snapshot unavailable" };
    }

    const existing = await ctx.db.get(entry.memoryId);

    if (entry.changeReason === "deleted") {
      // Undo a deletion: restore status and re-increment topic counts, same as
      // memories.restore. We do NOT do a full db.replace here — we just flip
      // the soft-delete flag so nothing else changes.
      if (existing && existing.status === "deleted") {
        await ctx.db.patch(entry.memoryId, { status: "active", deletedAt: undefined });
        await applyUserMemoryStatsTransition(ctx, existing, {
          ...existing,
          status: "active",
          deletedAt: undefined,
        });
        await ctx.runMutation(internal.memories.syncTopicLinksForMemory, {
          memoryId: entry.memoryId,
        });
      } else if (!existing) {
        // Permanently deleted since undo window — full re-insert from snapshot
        const restoredSnapshot = withDerivedMemoryFields(snapshot);
        const restoredId = await ctx.db.insert("memories", restoredSnapshot);
        const restored = await ctx.db.get(restoredId);
        if (restored) {
          await applyUserMemoryStatsTransition(ctx, null, restored);
          await ctx.runMutation(internal.memories.syncTopicLinksForMemory, {
            memoryId: restored._id,
          });
        }
      }
      // Re-increment topic counts that were decremented on deletion
      const topicIds = Array.from(
        new Set(
          [snapshot.primaryTopicId, ...(snapshot.topicIds ?? [])].filter(
            (id): id is Id<"userTopics"> => id !== undefined
          )
        )
      );
      if (topicIds.length > 0) {
        await ctx.runMutation(internal.userTopics.incrementTopicCounts, { topicIds });
      }
      await ctx.db.delete(entry._id); // consume the undo entry
      return { success: true, action: "restored", memoryId: entry.memoryId };
    }

    if (existing) {
      const restoredSnapshot = withDerivedMemoryFields(snapshot);
      await ctx.db.replace(entry.memoryId, restoredSnapshot);
      await applyUserMemoryStatsTransition(ctx, existing, {
        ...existing,
        ...restoredSnapshot,
      });
      await ctx.runMutation(internal.memories.syncTopicLinksForMemory, {
        memoryId: entry.memoryId,
      });
      await ctx.scheduler.runAfter(0, internal.actions.manageTopics.reanalyzeUserTopics, {
        userId,
      });
      await ctx.db.delete(entry._id); // consume the undo entry
      return { success: true, action: "reverted", memoryId: entry.memoryId };
    }

    const restoredSnapshot = withDerivedMemoryFields(snapshot);
    const restoredId = await ctx.db.insert("memories", restoredSnapshot);
    const restored = await ctx.db.get(restoredId);
    if (restored) {
      await applyUserMemoryStatsTransition(ctx, null, restored);
      await ctx.runMutation(internal.memories.syncTopicLinksForMemory, {
        memoryId: restored._id,
      });
    }
    await ctx.scheduler.runAfter(0, internal.actions.manageTopics.reanalyzeUserTopics, {
      userId,
    });
    await ctx.db.delete(entry._id);
    return { success: true, action: "restored", memoryId: restoredId };
  },
});

export const restore = mutation({
  args: {
    token: v.string(),
    historyId: v.id("memoryHistory"),
  },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const entry = await ctx.db.get(args.historyId);
    if (!entry || entry.userId !== userId) {
      return { error: "Snapshot not found" };
    }

    const snapshot = parseMemorySnapshot(entry.snapshotJson);
    if (!snapshot) {
      return { error: "Snapshot unavailable" };
    }

    const existing = await ctx.db.get(entry.memoryId);
    if (existing) {
      const restoredSnapshot = withDerivedMemoryFields(snapshot);
      await ctx.db.replace(entry.memoryId, restoredSnapshot);
      await applyUserMemoryStatsTransition(ctx, existing, {
        ...existing,
        ...restoredSnapshot,
      });
      await ctx.runMutation(internal.memories.syncTopicLinksForMemory, {
        memoryId: entry.memoryId,
      });
      await ctx.scheduler.runAfter(0, internal.actions.manageTopics.reanalyzeUserTopics, {
        userId,
      });
      return { success: true, action: "reverted", memoryId: entry.memoryId };
    }

    const restoredSnapshot = withDerivedMemoryFields(snapshot);
    const restoredId = await ctx.db.insert("memories", restoredSnapshot);
    const restored = await ctx.db.get(restoredId);
    if (restored) {
      await applyUserMemoryStatsTransition(ctx, null, restored);
      await ctx.runMutation(internal.memories.syncTopicLinksForMemory, {
        memoryId: restored._id,
      });
    }
    await ctx.scheduler.runAfter(0, internal.actions.manageTopics.reanalyzeUserTopics, {
      userId,
    });
    return { success: true, action: "restored", memoryId: restoredId };
  },
});

export const cleanupOld = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const batch = await ctx.db.query("memoryHistory").take(200);

    let deleted = 0;
    for (const row of batch) {
      if (row.editedAt < cutoff) {
        await ctx.db.delete(row._id);
        deleted++;
      }
    }

    // If we deleted items, schedule another run to continue cleanup
    if (deleted > 0) {
      await ctx.scheduler.runAfter(0, internal.history.cleanupOld, {});
    }
  },
});
