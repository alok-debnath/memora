"use node";

import { v } from "convex/values";
import { Doc, Id } from "../_generated/dataModel";
import { action } from "../_generated/server";
import { api, internal } from "../_generated/api";
import {
  embedText,
  getOpenAIClient,
  hasOpenAI,
  OPENAI_CHAT_MODEL,
  extractTextContent,
  safeJsonParse,
} from "../lib/openai";

type SearchableMemory = Doc<"memories"> & { _score?: number };

type ScoredEntry = {
  memory: Doc<"memories">;
  score: number;
  sources: string[];
};

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Absolute minimum cosine similarity for vector results.
 * text-embedding-3-small returns lower scores than many expect:
 *   > 0.75  → very similar (same topic, close phrasing)
 *   0.55–0.75 → semantically related (paraphrases, synonyms)
 *   0.40–0.55 → loosely related (same domain but different focus)
 *   < 0.40  → unrelated
 *
 * We use a permissive threshold here because the ranking layer (RRF)
 * will push truly relevant results to the top.
 */
const VECTOR_MIN_SCORE = 0.40;

/** RRF constant — higher k reduces the impact of individual rankings */
const RRF_K = 60;

// ─── Query preprocessing ─────────────────────────────────────────────────────

/**
 * Stop words and intent/action words that should be stripped before
 * embedding OR keyword matching. These are words that carry user intent
 * but don't appear in stored memory content.
 */
const NOISE_WORDS = new Set([
  // English stop words
  "a","an","the","and","or","but","in","on","at","to","for","of","with","by",
  "from","as","is","was","are","were","be","been","being","have","has","had",
  "do","does","did","will","would","could","should","may","might","shall",
  "can","need","dare","ought","used","it","its","this","that","these","those",
  "he","she","they","we","you","i","me","my","his","her","their","our","your",
  "him","them","us","what","which","who","whom","whose","where","when","why","how",
  "all","both","each","every","no","not","only","own","same","so","than","too",
  "very","just","more","most","other","some","such","then","there",
  // Intent/action words — user commands that don't exist in memory content
  "forget","remember","remind","delete","remove","find","search","show","get",
  "tell","give","let","know","please","want","make","put","set","add","create",
  "save","store","note","list","look","see","check","about","any","also",
  "data","everything","anything","info","information","stuff","things","related",
]);

/**
 * Strip noise/intent words from a query, returning only meaningful content terms.
 */
function extractContentTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9']/g, "").trim())
    .filter((t) => t.length > 1 && !NOISE_WORDS.has(t));
}

export { extractContentTerms };

/**
 * Build a clean search-optimized query by stripping noise words.
 * This is a fast, no-LLM fallback for query preparation.
 */
function buildCleanQuery(query: string): string {
  const terms = extractContentTerms(query);
  return terms.length > 0 ? terms.join(" ") : query.trim();
}

/**
 * Use LLM to expand and rewrite the user's query into an ideal search query.
 * This handles synonyms, paraphrases, and intent understanding.
 *
 * Example: "delete all data about family names" →
 *   "family member names mother father sister brother parent sibling"
 *
 * Falls back to simple noise-word stripping if LLM is unavailable.
 */
async function expandQuery(rawQuery: string): Promise<string> {
  const client = getOpenAIClient();
  if (!client) {
    return buildCleanQuery(rawQuery);
  }

  try {
    const response = await client.chat.completions.create({
      model: OPENAI_CHAT_MODEL,
      temperature: 0,
      max_completion_tokens: 150,
      messages: [
        {
          role: "system",
          content: `You are a search query optimizer for a personal memory/notes app. The user's query may contain action words (delete, find, show, etc.) and noise. Your job is to extract the SEMANTIC MEANING of what they want to search for and produce an optimized search query.

Rules:
- Strip action/intent words (delete, find, show, search, remove, etc.)
- Keep ALL content-bearing words
- Add 2-3 closely related synonyms or elaborations that would help find matching notes
- Output ONLY the optimized search terms, nothing else
- Keep it concise: 5-15 words max
- If the query mentions a category (family, work, health), include related terms

Examples:
- "delete all data about family names" → "family names mother father sister brother parent sibling relative"
- "what is my sister's name" → "sister name sibling family"
- "show me memories about visiting a marriage" → "marriage wedding visit attend ceremony celebration"
- "find my wifi password" → "wifi password network internet credentials"
- "names of my family" → "family names mother father sister brother children spouse relatives"`,
        },
        { role: "user", content: rawQuery },
      ],
    });

    const expanded = extractTextContent(response.choices[0]?.message?.content)?.trim();
    if (expanded && expanded.length > 0) {
      return expanded;
    }
  } catch {
    // LLM unavailable — fall back to simple cleaning
  }

  return buildCleanQuery(rawQuery);
}

// ─── Reciprocal Rank Fusion ──────────────────────────────────────────────────

/**
 * Compute RRF score contribution for a result at a given rank.
 * RRF is the industry-standard method for fusing ranked lists from
 * different retrieval systems (vector, full-text, keyword).
 */
function rrfScore(rank: number): number {
  return 1 / (RRF_K + rank);
}

// ─── Keyword matching ────────────────────────────────────────────────────────

/**
 * Compute a keyword match score between 0 and 1 for a memory
 * against a set of query terms.
 *
 * Uses PROPORTIONAL matching — the fraction of query terms that
 * appear in the memory's combined text fields.
 */
function keywordMatchScore(
  memory: Doc<"memories">,
  queryTerms: string[],
  topicMap: Map<Id<"userTopics">, string>
): number {
  if (queryTerms.length === 0) return 0;

  const topicNames = (memory.topicIds ?? [])
    .map((id) => topicMap.get(id))
    .filter(Boolean);
  const primaryTopic = memory.primaryTopicId ? topicMap.get(memory.primaryTopicId) : "";
  if (primaryTopic) topicNames.push(primaryTopic);

  const haystack = [
    memory.title ?? "",
    memory.content ?? "",
    ...(memory.people ?? []),
    ...(memory.locations ?? []),
    memory.lifeArea,
    ...topicNames,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  let matched = 0;
  for (const term of queryTerms) {
    let singular = term;
    if (term.endsWith("ies") && term.length > 4) {
      singular = term.substring(0, term.length - 3) + "y";
    } else if (term.endsWith("s") && term.length > 3) {
      singular = term.substring(0, term.length - 1);
    }
    
    if (haystack.includes(term) || (singular !== term && haystack.includes(singular))) {
      matched++;
    }
  }

  return matched / queryTerms.length;
}

// ─── Main search action ──────────────────────────────────────────────────────

export const search = action({
  args: {
    token: v.string(),
    query: v.string(),
    limit: v.optional(v.float64()),
    forceDeepSearch: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{ results: SearchableMemory[]; isCached: boolean }> => {
    const session = await ctx.runQuery(api.auth.me, { token: args.token });
    if (!session) {
      return { results: [], isCached: false };
    }

    const maxResults = args.limit ? Math.min(args.limit, 20) : 10;
    const rawQuery = args.query.trim();
    if (!rawQuery) return { results: [], isCached: false };

    // ── Step 1: Prepare synchronous query parts ──────────────────────
    const contentTerms = extractContentTerms(rawQuery);

    // ── Step 2: Multi-source retrieval ──────────────────────────────────
    // Collect ranked lists from 3 independent sources

    /** Source 1: Vector / semantic search */
    const vectorRanked: Array<{ id: Id<"memories">; vectorScore: number }> = [];

    /** Source 2: Full-text search (Convex search indexes) */
    const fulltextRanked: Id<"memories">[] = [];

    /** Track caching state for UI */
    let isCached = false;

    /** Source 3: Keyword / metadata match */
    const keywordRanked: Array<{ id: Id<"memories">; kwScore: number }> = [];

    // Run all retrieval sources concurrently
    const [vectorResult, fulltextResult, keywordResult] = await Promise.allSettled([
      // ── Source 1: Vector search (handles its own LLM expansion) ──
      (async () => {
        if (!hasOpenAI()) return;
        try {
          const queryHash = rawQuery.toLowerCase().substring(0, 100);
          const cached = await ctx.runQuery(internal.memories.getQueryCache, { userId: session._id, queryHash });
          
          let queryEmbedding;
          if (cached && cached.embedding && !args.forceDeepSearch) {
            queryEmbedding = cached.embedding;
            isCached = true;
          } else {
            // Use LLM expansion for longer queries or when forced;
            // short queries (≤3 words) just get noise-stripped and embedded directly.
            const needsExpansion = rawQuery.split(/\s+/).length > 3 || args.forceDeepSearch;
            const expandedQuery = needsExpansion
              ? await expandQuery(rawQuery)
              : buildCleanQuery(rawQuery);
            queryEmbedding = await embedText(expandedQuery);
            await ctx.runMutation(internal.memories.setQueryCache, {
              userId: session._id,
              queryHash,
              expandedQuery,
              embedding: queryEmbedding,
            });
          }

          const vectorResults = await ctx.vectorSearch("memories", "by_embedding", {
            vector: queryEmbedding,
            limit: 30, // fetch more to compensate for filtering
            filter: (q) => q.eq("userId", session._id),
          });

          for (const r of vectorResults) {
            if (r._score >= VECTOR_MIN_SCORE) {
              vectorRanked.push({ id: r._id, vectorScore: r._score });
            }
          }
        } catch {
          // Vector search failed — continue with other sources
        }
      })(),

      // ── Source 2: Full-text search (clean query, no intent words) ──
      (async () => {
        try {
          const cleanQuery = buildCleanQuery(rawQuery);
          const results: Doc<"memories">[] = await ctx.runQuery(
            internal.memories.searchByContent,
            { userId: session._id, query: cleanQuery, limit: 20 }
          );
          for (const m of results) {
            fulltextRanked.push(m._id);
          }
        } catch {
          // Full-text search not available
        }
      })(),

      // ── Source 3: Keyword / metadata search ──
      (async () => {
        if (contentTerms.length === 0) return;
        try {
          const userTopics = await ctx.runQuery(api.userTopics.list, { token: args.token });
          const topicMap = new Map<Id<"userTopics">, string>(
            userTopics.map(t => [t._id, t.name.toLowerCase()] as [Id<"userTopics">, string])
          );
          
          const results: Doc<"memories">[] = await ctx.runQuery(
            internal.memories.searchByKeyword,
            { userId: session._id, query: rawQuery, limit: 30 }
          );
          for (const m of results) {
            const kwScore = keywordMatchScore(m, contentTerms, topicMap);
            if (kwScore > 0) {
              keywordRanked.push({ id: m._id, kwScore });
            }
          }
          // Sort by match proportion descending
          keywordRanked.sort((a, b) => b.kwScore - a.kwScore);
        } catch {
          // Keyword search failed
        }
      })(),
    ]);

    // ── Step 3: Reciprocal Rank Fusion ──────────────────────────────────
    // Merge results from all sources using RRF scoring

    const rrfScores = new Map<Id<"memories">, { score: number; sources: string[] }>();

    function addRRF(id: Id<"memories">, rank: number, source: string, boost = 1.0) {
      const existing = rrfScores.get(id);
      const contribution = rrfScore(rank) * boost;
      if (existing) {
        existing.score += contribution;
        if (!existing.sources.includes(source)) {
          existing.sources.push(source);
        }
      } else {
        rrfScores.set(id, { score: contribution, sources: [source] });
      }
    }

    // Vector results get highest weight (2x boost)
    for (let i = 0; i < vectorRanked.length; i++) {
      addRRF(vectorRanked[i].id, i, "vector", 2.0);
    }

    // Full-text results get standard weight
    for (let i = 0; i < fulltextRanked.length; i++) {
      addRRF(fulltextRanked[i], i, "fulltext", 1.0);
    }

    // Keyword results get weight proportional to their match quality
    for (let i = 0; i < keywordRanked.length; i++) {
      const item = keywordRanked[i];
      // Only include if ≥40% of terms matched (prevents single-word noise)
      if (item.kwScore >= 0.4) {
        addRRF(item.id, i, "keyword", 0.8 * item.kwScore);
      }
    }

    // ── Step 4: Multi-source bonus ────────────────────────────────────
    // Results found by multiple sources are more likely to be relevant
    for (const [, entry] of rrfScores) {
      if (entry.sources.length >= 2) {
        entry.score *= 1.15; // 15% bonus for multi-source confirmation
      }
      if (entry.sources.length >= 3) {
        entry.score *= 1.10; // additional 10% for triple confirmation
      }
    }

    // ── Step 5: Sort and hydrate ───────────────────────────────────────
    const rankedIds = Array.from(rrfScores.entries())
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, maxResults)
      .map(([id]) => id);

    if (rankedIds.length === 0) return { results: [], isCached };

    // Hydrate the top results with full memory documents
    const memories: Doc<"memories">[] = await ctx.runQuery(
      api.memories.listByIds,
      { token: args.token, ids: rankedIds }
    );

    // Preserve the RRF ranking order
    const byId = new Map(memories.map((m) => [m._id, m] as const));
    const results: SearchableMemory[] = [];
    for (const id of rankedIds) {
      const memory = byId.get(id);
      if (memory) {
        const rrfEntry = rrfScores.get(id);
        results.push({ ...memory, _score: rrfEntry?.score ?? 0 });
      }
    }

    return { results, isCached };
  },
});
