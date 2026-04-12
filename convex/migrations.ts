/**
 * Data migration utilities
 * Handles deletion of existing plaintext data
 */
import { Migrations } from "@convex-dev/migrations";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { api, components, internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { action, internalAction, internalQuery, mutation } from "./_generated/server";
import { rebuildUserMemoryStats } from "./lib/memoryStats";
import { deriveEmbeddingState, deriveNextDueAt } from "./lib/memoryKind";
import { resolveUser } from "./lib/withAuth";

export const migrations = new Migrations<DataModel>(components.migrations);
export const run = migrations.runner();

export const backfillMemoryDerivedFields = migrations.define({
  table: "memories",
  batchSize: 50,
  migrateOne: async (ctx, memory) => {
    const nextDueAt = deriveNextDueAt(memory);
    const embeddingState = deriveEmbeddingState(memory.embedding);
    if (memory.nextDueAt === nextDueAt && memory.embeddingState === embeddingState) {
      return;
    }
    return {
      nextDueAt,
      embeddingState,
    };
  },
});

export const backfillUserMemoryStats = migrations.define({
  table: "users",
  batchSize: 10,
  migrateOne: async (ctx, user) => {
    await rebuildUserMemoryStats(ctx, user._id);
  },
});

export const runMemoryPerformanceMigrations = migrations.runner([
  internal.migrations.backfillMemoryDerivedFields,
  internal.migrations.backfillUserMemoryStats,
]);

async function repairTopicMetadataForUser(
  ctx: Pick<ActionCtx, "runQuery" | "runMutation">,
  userId: Id<"users">,
) {
  const memoryTopicRefs: Array<{
    _id: Id<"memories">;
    primaryTopicId?: Id<"userTopics">;
    topicIds: Id<"userTopics">[];
  }> = await ctx.runQuery(internal.memories.listTopicRefsForUser, {
    userId,
  });

  const usageCounts = new Map<Id<"userTopics">, number>();
  for (const memory of memoryTopicRefs) {
    const uniqueTopicIds = new Set<Id<"userTopics">>();
    if (memory.primaryTopicId) {
      uniqueTopicIds.add(memory.primaryTopicId);
    }
    for (const topicId of memory.topicIds) {
      uniqueTopicIds.add(topicId);
    }
    for (const topicId of uniqueTopicIds) {
      usageCounts.set(topicId, (usageCounts.get(topicId) ?? 0) + 1);
    }
  }

  await ctx.runMutation(internal.userTopics.reconcileTopicUsage, {
    userId,
    usage: Array.from(usageCounts.entries()).map(([topicId, memoryCount]) => ({
      topicId,
      memoryCount,
    })),
  });

  for (const memory of memoryTopicRefs) {
    await ctx.runMutation(internal.memories.syncTopicLinksForMemory, {
      memoryId: memory._id,
    });
  }

  return {
    repairedMemories: memoryTopicRefs.length,
    repairedTopics: usageCounts.size,
  };
}

export const listUsersForTopicMetadataRepair = internalQuery({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const result = await ctx.db.query("users").paginate(args.paginationOpts);
    return {
      page: result.page.map((user) => user._id),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

export const repairMyTopicMetadata = action({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args): Promise<{ repairedMemories: number; repairedTopics: number }> => {
    const session: { _id: Id<"users"> } | null = await ctx.runQuery(api.auth.me, {
      token: args.token,
    });
    if (!session) {
      throw new Error("Unauthorized");
    }

    return await repairTopicMetadataForUser(ctx, session._id);
  },
});

export const repairAllUsersTopicMetadata = internalAction({
  args: {
    cursor: v.optional(v.string()),
    batchSize: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    repairedUsers: number;
    repairedMemories: number;
    repairedTopics: number;
    scheduledContinuation: boolean;
    nextCursor: string | null;
  }> => {
    const batchSize = Math.min(Math.max(args.batchSize ?? 25, 1), 100);
    const page: {
      page: Id<"users">[];
      isDone: boolean;
      continueCursor: string;
    } = await ctx.runQuery(internal.migrations.listUsersForTopicMetadataRepair, {
      paginationOpts: {
        numItems: batchSize,
        cursor: args.cursor ?? null,
      },
    });

    let repairedUsers = 0;
    let repairedMemories = 0;
    let repairedTopics = 0;

    for (const userId of page.page) {
      const result = await repairTopicMetadataForUser(ctx, userId);
      repairedUsers += 1;
      repairedMemories += result.repairedMemories;
      repairedTopics += result.repairedTopics;
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.migrations.repairAllUsersTopicMetadata, {
        cursor: page.continueCursor,
        batchSize,
      });
    }

    return {
      repairedUsers,
      repairedMemories,
      repairedTopics,
      scheduledContinuation: !page.isDone,
      nextCursor: page.isDone ? null : page.continueCursor,
    };
  },
});

/**
 * Wipe all existing user data
 * Use this when user wants to start fresh with encryption
 * This is irreversible!
 */
export const wipeAllUserData = mutation({
  args: {
    confirmPhrase: v.string(),
  },
  handler: async (ctx, args) => {
    // Require explicit confirmation
    if (args.confirmPhrase !== "DELETE ALL MY DATA") {
      throw new Error("Invalid confirmation phrase");
    }

    const user = await resolveUser(ctx);
    const BATCH = 200;
    let totalDeleted = 0;
    let hasMore = false;

    // Delete from all tables in batches
    const tables = [
      "memoryAttachments",
      "memoryHistory",
      "diaryEntries",
      "reviewCards",
      "nudges",
      "chatMessages",
    ] as const;

    for (const table of tables) {
      const docs = await ctx.db
        .query(table)
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .take(BATCH);

      for (const doc of docs) {
        await ctx.db.delete(doc._id);
        totalDeleted++;
      }

      if (docs.length >= BATCH) hasMore = true;
    }

    // Delete shared memories
    const shares = await ctx.db
      .query("sharedMemories")
      .withIndex("by_user", (q) => q.eq("sharedByUserId", user._id))
      .take(BATCH);

    for (const share of shares) {
      await ctx.db.delete(share._id);
      totalDeleted++;
    }
    if (shares.length >= BATCH) hasMore = true;

    // Delete memories
    const memories = await ctx.db
      .query("memories")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(BATCH);

    for (const memory of memories) {
      await ctx.db.delete(memory._id);
      totalDeleted++;
    }
    if (memories.length >= BATCH) hasMore = true;

    // Log the deletion
    await ctx.db.insert("auditLogs", {
      userId: user._id,
      action: "account.delete",
      resourceType: "data_wipe",
      metadata: {
        deletedCount: String(totalDeleted),
        complete: String(!hasMore),
      },
      timestamp: Date.now(),
    });

    if (hasMore) {
      // More data to delete - client should call again
      return {
        success: false,
        message: "Deletion in progress, please call again to continue",
        deletedThisBatch: totalDeleted,
      };
    }

    return {
      success: true,
      message: "All data deleted",
      totalDeleted,
    };
  },
});
