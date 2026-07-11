"use node";

import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalAction } from "../_generated/server";
import { MEMORY_RETRIEVAL_VERSION } from "../lib/memoryRetrieval";

/** Resumable retrieval rebuild with persistent progress and failure tracking. */
export const rebuild = internalAction({
  args: {
    jobId: v.optional(v.id("retrievalRebuildJobs")),
    cursor: v.optional(v.string()),
    batchSize: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    jobId?: Id<"retrievalRebuildJobs">;
    inspected: number;
    rebuilt: number;
    failures: number;
    hasMore: boolean;
    nextCursor: string;
  }> => {
    const page: {
      batch: Array<{
        _id: Id<"memories">;
        title?: string;
        content?: string;
        retrievalVersion?: number;
      }>;
      hasMore: boolean;
      nextCursor: string;
    } = await ctx.runQuery(internal.memories.listForReembedding, {
      cursor: args.cursor,
      limit: Math.min(args.batchSize ?? 5, 10),
    });

    const candidates = page.batch.filter(
      (memory) =>
        memory.retrievalVersion !== MEMORY_RETRIEVAL_VERSION && Boolean(memory.content?.trim()),
    );
    if (args.dryRun) {
      return {
        inspected: page.batch.length,
        rebuilt: 0,
        failures: 0,
        hasMore: page.hasMore,
        nextCursor: page.nextCursor,
      };
    }

    const jobId =
      args.jobId ??
      (await ctx.runMutation(internal.retrievalRebuildJobs.start, {
        targetVersion: MEMORY_RETRIEVAL_VERSION,
      }));
    let rebuilt = 0;
    let failures = 0;
    let lastError: string | undefined;

    try {
      for (const memory of candidates) {
        try {
          await ctx.runAction(api.actions.processMemory.processMemory, {
            memoryId: memory._id,
            title: memory.title?.trim() || "Untitled memory",
            content: memory.content ?? "",
          });
          const updated = await ctx.runQuery(internal.memories.getInternal, {
            memoryId: memory._id,
          });
          if (updated?.retrievalVersion === MEMORY_RETRIEVAL_VERSION) rebuilt += 1;
          else failures += 1;
        } catch (error) {
          failures += 1;
          lastError = error instanceof Error ? error.message : "Memory rebuild failed";
        }
      }

      await ctx.runMutation(internal.retrievalRebuildJobs.recordBatch, {
        jobId,
        cursor: page.nextCursor,
        inspected: page.batch.length,
        rebuilt,
        failures,
        lastError,
        completed: !page.hasMore,
      });

      if (page.hasMore) {
        await ctx.scheduler.runAfter(500, internal.actions.rebuildRetrieval.rebuild, {
          jobId,
          cursor: page.nextCursor,
          batchSize: args.batchSize,
        });
      }
    } catch (error) {
      await ctx.runMutation(internal.retrievalRebuildJobs.fail, {
        jobId,
        error: error instanceof Error ? error.message : "Retrieval rebuild failed",
      });
      throw error;
    }

    return {
      jobId,
      inspected: page.batch.length,
      rebuilt,
      failures,
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
    };
  },
});
