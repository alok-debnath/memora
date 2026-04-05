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

// ─── Score thresholds ─────────────────────────────────────────────────────────

// text-embedding-3-small cosine similarity ranges:
//   > 0.85  → very similar (same topic)
//   0.70-0.85 → related
//   0.55-0.70 → loosely related (often noise)
//   < 0.55  → unrelated
const VECTOR_ABSOLUTE_MIN = 0.70;  // hard floor — discard anything below
const VECTOR_RELATIVE_FLOOR = 0.80; // result must be ≥ 80% of the top result's score

// ─── Stop/intent words to strip before fuzzy matching ────────────────────────

const FUZZY_STRIP_WORDS = new Set([
  // English stop words
  "a","an","the","and","or","but","in","on","at","to","for","of","with","by","from","as",
  "is","was","are","were","be","been","being","have","has","had","do","does","did","will",
  "would","could","should","may","might","shall","can","need","dare","ought","used",
  "it","its","this","that","these","those","he","she","they","we","you","i","me","my",
  "his","her","their","our","your","its","him","them","us",
  "what","which","who","whom","whose","where","when","why","how",
  "all","both","each","every","no","not","only","own","same","so","than","too",
  "very","just","more","most","other","some","such","then","there",
  // Intent/action words that don't appear in stored memories
  "forget","remember","remind","delete","remove","find","search","show","get","tell",
  "what","give","let","know","please","want","need","make","put","set","add","create",
  "save","store","note","list","look","see","check","about","any","also",
]);

function stripIntentWords(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9']/g, "").trim())
    .filter((t) => t.length > 1 && !FUZZY_STRIP_WORDS.has(t));
}

export { stripIntentWords };

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
        // Multi-source boost: small bonus when confirmed by multiple layers
        existing.sources.push(source);
        existing.score = Math.max(existing.score, score) * 1.08;
      } else {
        scoreMap.set(memory._id, { memory, score, sources: [source] });
      }
    }

    // ── Layer 1: Vector semantic search ───────────────────────────────────────
    if (hasOpenAI()) {
      try {
        const queryEmbedding = await embedText(args.query);
        const vectorResults = await ctx.vectorSearch("memories", "by_embedding", {
          vector: queryEmbedding,
          limit: 20, // fetch more so filtering doesn't leave too few
          filter: (q) => q.eq("userId", session._id),
        });

        // Apply absolute minimum score threshold
        const aboveMin = vectorResults.filter((r) => r._score >= VECTOR_ABSOLUTE_MIN);

        // Apply relative floor: result must be at least VECTOR_RELATIVE_FLOOR × top score
        if (aboveMin.length > 0) {
          const topScore = aboveMin[0]._score; // already sorted desc by Convex
          const relativeMin = topScore * VECTOR_RELATIVE_FLOOR;

          const thresholded = aboveMin.filter((r) => r._score >= relativeMin);
          const orderedIds = thresholded.map((r) => r._id);

          const vectorMemories: Doc<"memories">[] = await ctx.runQuery(
            api.memories.listByIds,
            { token: args.token, ids: orderedIds }
          );

          const byId = new Map<Id<"memories">, Doc<"memories">>(
            vectorMemories.map((m) => [m._id, m] as const)
          );

          for (const result of thresholded) {
            const memory = byId.get(result._id);
            if (memory) {
              addResult(memory, result._score, "semantic");
            }
          }
        }
      } catch {
        // Vector search failed, continue with text search
      }
    }

    // ── Layer 2: Full-text search (Convex search indexes) ─────────────────────
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

    // ── Layer 3: Keyword fallback (tags / people / locations) ─────────────────
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

    // ── Rank and return ───────────────────────────────────────────────────────
    return Array.from(scoreMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .map((entry) => ({ ...entry.memory, _score: entry.score }));
  },
});
