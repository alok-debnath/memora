"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { embedTexts, hasOpenAI } from "../lib/openai";

/**
 * Build a structured, metadata-enriched text for embedding generation.
 * Including structured metadata (people, locations, life area, etc.)
 * makes the embedding more semantically discoverable.
 */
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
  if (m.entryKind === "reminder") parts.push(`Type: reminder`);
  return parts.length > 0 ? parts.join("\n") : `${m.title ?? ""}\n${m.content ?? ""}`;
}

/**
 * Batch generates enriched embeddings for memories that don't have them.
 * Processes up to 50 memories per run.
 */
export const backfill = internalAction({
  args: {},
  handler: async (ctx): Promise<{ processed: number; reason?: string }> => {
    if (!hasOpenAI()) {
      return { processed: 0, reason: "OpenAI not configured" };
    }

    const memories = await ctx.runQuery(internal.memories.listWithoutEmbeddings, {
      limit: 50,
    });

    if (memories.length === 0) {
      return { processed: 0 };
    }

    const inputs = memories.map((m: any) => buildEmbeddingText(m).slice(0, 6000));

    try {
      const embeddings = await embedTexts(inputs);

      for (let i = 0; i < memories.length; i++) {
        const embedding = embeddings[i];
        if (embedding) {
          await ctx.runMutation(internal.processMemoryMutations.updateEmbedding, {
            memoryId: memories[i]._id,
            embedding,
          });
        }
      }

      return { processed: memories.length };
    } catch {
      return { processed: 0, reason: "Embedding generation failed" };
    }
  },
});

/**
 * Re-embed ALL active memories with enriched metadata text.
 * Run this once after deploying the search rewrite to update
 * existing embeddings for better search accuracy.
 *
 * Processes up to BATCH_SIZE at a time and self-schedules for the rest.
 */
const REEMBED_BATCH_SIZE = 25;

export const reembedAll = internalAction({
  args: {
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ processed: number; hasMore: boolean }> => {
    if (!hasOpenAI()) {
      return { processed: 0, hasMore: false };
    }

    const memories = await ctx.runQuery(internal.memories.listForReembedding, {
      limit: REEMBED_BATCH_SIZE,
      cursor: args.cursor,
    });

    if (memories.batch.length === 0) {
      return { processed: 0, hasMore: false };
    }

    const inputs = memories.batch.map((m: any) => buildEmbeddingText(m).slice(0, 6000));

    try {
      const embeddings = await embedTexts(inputs);

      for (let i = 0; i < memories.batch.length; i++) {
        const embedding = embeddings[i];
        if (embedding) {
          await ctx.runMutation(internal.processMemoryMutations.updateEmbedding, {
            memoryId: memories.batch[i]._id,
            embedding,
          });
        }
      }
    } catch {
      return { processed: 0, hasMore: true };
    }

    // Self-schedule next batch if there are more
    if (memories.hasMore && memories.nextCursor) {
      await ctx.scheduler.runAfter(
        500, // small delay to avoid rate limits
        internal.actions.backfillEmbeddings.reembedAll,
        { cursor: memories.nextCursor },
      );
    }

    return {
      processed: memories.batch.length,
      hasMore: memories.hasMore,
    };
  },
});
