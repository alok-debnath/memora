"use node";

import { v } from "convex/values";
import { Doc, Id } from "../_generated/dataModel";
import { action } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { embedText, hasOpenAI } from "../lib/openai";

type SearchableMemory = Doc<"memories"> & { _score?: number };

type ScoredEntry = {
  memory: Doc<"memories">;
  score: number;
  sources: string[];
};

export const search = action({
  args: {
    token: v.string(),
    query: v.string(),
    limit: v.optional(v.float64()),
  },
  handler: async (ctx, args): Promise<SearchableMemory[]> => {
    const session = await ctx.runQuery(api.auth.me, { token: args.token });
    if (!session) {
      return [];
    }

    const maxResults = args.limit ? Math.min(args.limit, 20) : 10;
    const scoreMap = new Map<Id<"memories">, ScoredEntry>();

    function addResult(memory: Doc<"memories">, score: number, source: string) {
      const existing = scoreMap.get(memory._id);
      if (existing) {
        // Multi-source boost: 15% bonus when found in multiple search layers
        existing.sources.push(source);
        existing.score = Math.max(existing.score, score) * 1.15;
      } else {
        scoreMap.set(memory._id, { memory, score, sources: [source] });
      }
    }

    // Layer 1: Vector semantic search (if OpenAI available)
    if (hasOpenAI()) {
      try {
        const queryEmbedding = await embedText(args.query);
        const vectorResults = await ctx.vectorSearch("memories", "by_embedding", {
          vector: queryEmbedding,
          limit: 15,
          filter: (q) => q.eq("userId", session._id),
        });

        const orderedIds = vectorResults.map((result) => result._id);
        const vectorMemories: Doc<"memories">[] = await ctx.runQuery(
          api.memories.listByIds,
          { token: args.token, ids: orderedIds }
        );

        const byId = new Map<Id<"memories">, Doc<"memories">>(
          vectorMemories.map((memory) => [memory._id, memory] as const)
        );

        for (const result of vectorResults) {
          const memory = byId.get(result._id);
          if (memory) {
            addResult(memory, result._score, "semantic");
          }
        }
      } catch {
        // Vector search failed, continue with text search
      }
    }

    // Layer 2: Full-text search using Convex search indexes
    try {
      const contentResults: Doc<"memories">[] = await ctx.runQuery(
        internal.memories.searchByContent,
        { userId: session._id, query: args.query, limit: 15 }
      );
      for (const memory of contentResults) {
        addResult(memory, 0.5, "fulltext");
      }
    } catch {
      // Search index not yet available
    }

    // Layer 3: Keyword fallback on tags/people/locations
    try {
      const keywordResults: Doc<"memories">[] = await ctx.runQuery(
        internal.memories.searchByKeyword,
        { userId: session._id, query: args.query, limit: 15 }
      );
      for (const memory of keywordResults) {
        addResult(memory, 0.3, "keyword");
      }
    } catch {
      // Fallback search failed
    }

    // Sort by score descending, take top N
    return Array.from(scoreMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .map((entry) => ({ ...entry.memory, _score: entry.score }));
  },
});
