"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { embedTexts, hasOpenAI } from "../lib/openai";

/**
 * Batch generates embeddings for memories that don't have them.
 * Processes up to 50 memories per run.
 * Matches Supabase's backfill-embeddings edge function.
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

    const inputs = memories.map(
      (m) => `${m.title}\n${m.content}`.slice(0, 6000)
    );

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
