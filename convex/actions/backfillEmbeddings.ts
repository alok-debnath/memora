"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { getEmbeddingFingerprintForUser, trackedEmbedTexts } from "../lib/aiDispatch";

function buildEmbeddingText(m: {
  title?: string;
  content?: string;
  people?: string[];
  locations?: string[];
  lifeArea?: string;
  entryKind?: string;
}): string {
  const parts: string[] = [];
  if (m.title) parts.push(`Title: ${m.title}`);
  if (m.content) parts.push(`Content: ${m.content}`);
  if (m.people && m.people.length > 0) {
    parts.push(`People: ${m.people.join(", ")}`);
  }
  if (m.locations && m.locations.length > 0) {
    parts.push(`Locations: ${m.locations.join(", ")}`);
  }
  if (m.lifeArea) parts.push(`Category: ${m.lifeArea}`);
  if (m.entryKind === "reminder") parts.push("Type: reminder");
  return parts.length > 0 ? parts.join("\n") : `${m.title ?? ""}\n${m.content ?? ""}`;
}

function averageVectors(vectors: number[][]) {
  if (vectors.length === 0) {
    return [];
  }
  const sums = [...vectors[0]];
  for (let i = 1; i < vectors.length; i += 1) {
    for (let j = 0; j < sums.length; j += 1) {
      sums[j] += vectors[i][j] ?? 0;
    }
  }
  return sums.map((value) => value / vectors.length);
}

const BACKFILL_BATCH_SIZE = 50;
const REBUILD_BATCH_SIZE = 25;

export const backfill = internalAction({
  args: {},
  handler: async (ctx): Promise<{ processed: number; reason?: string }> => {
    const memories: Array<{
      _id: Id<"memories">;
      userId: Id<"users">;
      title?: string;
      content?: string;
      people?: string[];
      locations?: string[];
      lifeArea?: string;
      entryKind?: string;
    }> = await ctx.runQuery(internal.memories.listWithoutEmbeddings, {
      limit: BACKFILL_BATCH_SIZE,
    });

    if (memories.length === 0) {
      return { processed: 0 };
    }

    const byUser = new Map<Id<"users">, typeof memories>();
    for (const memory of memories) {
      const group = byUser.get(memory.userId) ?? [];
      group.push(memory);
      byUser.set(memory.userId, group);
    }

    let processed = 0;
    for (const [userId, batch] of byUser.entries()) {
      try {
        const fingerprint = await getEmbeddingFingerprintForUser(ctx, userId);
        const embeddings = await trackedEmbedTexts(ctx, {
          userId,
          feature: "memory_search",
          stage: "backfill_missing_embeddings",
          visibility: "background",
          input: batch.map((memory) => buildEmbeddingText(memory).slice(0, 6000)),
          metadata: { stage: "backfill_missing_embeddings" },
        });
        for (let i = 0; i < batch.length; i += 1) {
          const embedding = embeddings[i];
          if (!embedding) continue;
          processed += 1;
          await ctx.runMutation(internal.processMemoryMutations.updateEmbedding, {
            memoryId: batch[i]._id,
            embedding,
            embeddingFingerprint: fingerprint,
          });
        }
      } catch {
        continue;
      }
    }

    return { processed };
  },
});

export const rebuildUserEmbeddings = internalAction({
  args: {
    userId: v.id("users"),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ processed: number; hasMore: boolean }> => {
    const state: {
      embeddingRebuildStatus:
        | "idle"
        | "queued"
        | "reembedding_memories"
        | "rebuilding_topics"
        | "failed";
      targetEmbeddingFingerprint?: string;
      embeddingRebuildProcessed?: number;
      embeddingRebuildTotal?: number;
    } = await ctx.runQuery(internal.aiProviders.getEmbeddingStatusInternal, {
      userId: args.userId,
    });

    if (!state.targetEmbeddingFingerprint) {
      return { processed: 0, hasMore: false };
    }

    await ctx.runMutation(internal.aiProviders.updateEmbeddingRebuildStateInternal, {
      userId: args.userId,
      embeddingRebuildStatus: "reembedding_memories",
      embeddingRebuildUpdatedAt: Date.now(),
      embeddingRebuildError: "",
    });

    const page: {
      batch: Array<{
        _id: Id<"memories">;
        title?: string;
        content?: string;
        people?: string[];
        locations?: string[];
        lifeArea?: string;
        entryKind?: string;
        topicIds: Id<"userTopics">[];
        primaryTopicId?: Id<"userTopics">;
        embeddingFingerprint?: string;
        embeddingState: "missing" | "ready";
        embedding?: number[];
      }>;
      hasMore: boolean;
      nextCursor?: string;
    } = await ctx.runQuery(internal.memories.listActiveForEmbeddingRebuild, {
      userId: args.userId,
      cursor: args.cursor,
      limit: REBUILD_BATCH_SIZE,
    });

    const targets = page.batch.filter(
      (memory) => memory.embeddingFingerprint !== state.targetEmbeddingFingerprint,
    );

    let processedThisRun = 0;
    if (targets.length > 0) {
      try {
        const currentFingerprint = await getEmbeddingFingerprintForUser(ctx, args.userId);
        if (currentFingerprint !== state.targetEmbeddingFingerprint) {
          throw new Error("Embedding route changed during rebuild.");
        }
        const embeddings = await trackedEmbedTexts(ctx, {
          userId: args.userId,
          feature: "memory_search",
          stage: "embedding_rebuild",
          visibility: "background",
          input: targets.map((memory) => buildEmbeddingText(memory).slice(0, 6000)),
          metadata: { stage: "embedding_rebuild" },
        });
        for (let i = 0; i < targets.length; i += 1) {
          const embedding = embeddings[i];
          if (!embedding) continue;
          processedThisRun += 1;
          await ctx.runMutation(internal.processMemoryMutations.updateEmbedding, {
            memoryId: targets[i]._id,
            embedding,
            embeddingFingerprint: state.targetEmbeddingFingerprint,
          });
        }
      } catch (error) {
        await ctx.runMutation(internal.aiProviders.updateEmbeddingRebuildStateInternal, {
          userId: args.userId,
          embeddingRebuildStatus: "failed",
          embeddingRebuildUpdatedAt: Date.now(),
          embeddingRebuildError:
            error instanceof Error ? error.message : "Embedding rebuild failed.",
        });
        return { processed: 0, hasMore: false };
      }
    }

    await ctx.runMutation(internal.aiProviders.updateEmbeddingRebuildStateInternal, {
      userId: args.userId,
      embeddingRebuildProcessed: (state.embeddingRebuildProcessed ?? 0) + processedThisRun,
      embeddingRebuildUpdatedAt: Date.now(),
    });

    if (page.hasMore && page.nextCursor) {
      await ctx.scheduler.runAfter(500, internal.actions.backfillEmbeddings.rebuildUserEmbeddings, {
        userId: args.userId,
        cursor: page.nextCursor,
      });
      return { processed: processedThisRun, hasMore: true };
    }

    await ctx.scheduler.runAfter(0, internal.actions.backfillEmbeddings.rebuildUserTopics, {
      userId: args.userId,
    });
    return { processed: processedThisRun, hasMore: false };
  },
});

export const rebuildUserTopics = internalAction({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args): Promise<{ rebuilt: number }> => {
    const state: {
      targetEmbeddingFingerprint?: string;
      embeddingRebuildTotal?: number;
    } = await ctx.runQuery(internal.aiProviders.getEmbeddingStatusInternal, {
      userId: args.userId,
    });
    if (!state.targetEmbeddingFingerprint) {
      return { rebuilt: 0 };
    }

    await ctx.runMutation(internal.aiProviders.updateEmbeddingRebuildStateInternal, {
      userId: args.userId,
      embeddingRebuildStatus: "rebuilding_topics",
      embeddingRebuildUpdatedAt: Date.now(),
    });

    const topics: Array<{ _id: Id<"userTopics"> }> = await ctx.runQuery(
      internal.userTopics.listWithCentroids,
      { userId: args.userId },
    );
    const topicVectors = new Map<Id<"userTopics">, number[][]>();
    let cursor: string | undefined;

    while (true) {
      const page: {
        batch: Array<{
          _id: Id<"memories">;
          topicIds: Id<"userTopics">[];
          primaryTopicId?: Id<"userTopics">;
          embeddingFingerprint?: string;
          embedding?: number[];
        }>;
        hasMore: boolean;
        nextCursor?: string;
      } = await ctx.runQuery(internal.memories.listActiveForEmbeddingRebuild, {
        userId: args.userId,
        cursor,
        limit: 100,
      });
      for (const memory of page.batch) {
        if (
          memory.embeddingFingerprint !== state.targetEmbeddingFingerprint ||
          !memory.embedding ||
          memory.embedding.length === 0
        ) {
          continue;
        }
        const topicIds = Array.from(
          new Set(
            [memory.primaryTopicId, ...(memory.topicIds ?? [])].filter(
              (topicId): topicId is Id<"userTopics"> => Boolean(topicId),
            ),
          ),
        );
        for (const topicId of topicIds) {
          const vectors = topicVectors.get(topicId) ?? [];
          vectors.push(memory.embedding);
          topicVectors.set(topicId, vectors);
        }
      }
      if (!page.hasMore || !page.nextCursor) {
        break;
      }
      cursor = page.nextCursor;
    }

    await ctx.runMutation(internal.userTopics.replaceUserTopicCentroids, {
      userId: args.userId,
      embeddingFingerprint: state.targetEmbeddingFingerprint,
      centroids: topics
        .map((topic) => {
          const vectors = topicVectors.get(topic._id) ?? [];
          return {
            topicId: topic._id,
            centroid: averageVectors(vectors),
            memoryCount: vectors.length,
          };
        })
        .filter((entry) => entry.centroid.length > 0),
    });

    await ctx.scheduler.runAfter(0, internal.actions.manageTopics.reanalyzeUserTopics, {
      userId: args.userId,
    });
    await ctx.runMutation(internal.aiProviders.updateEmbeddingRebuildStateInternal, {
      userId: args.userId,
      embeddingRebuildStatus: "idle",
      lastReadyEmbeddingFingerprint: state.targetEmbeddingFingerprint,
      embeddingRebuildProcessed: state.embeddingRebuildTotal ?? 0,
      embeddingRebuildUpdatedAt: Date.now(),
      embeddingRebuildError: "",
    });

    return { rebuilt: topics.length };
  },
});
