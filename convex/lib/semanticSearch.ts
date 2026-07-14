"use node";

import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { resolveAiRoute, trackedEmbedTextOnRoute } from "./aiDispatch";
import { buildEmbeddingFingerprint } from "./ai";
import { toDiaryCompact } from "./diaryText";
import { cleanSearchQuery, extractSearchTerms, normalizeSearchQueryHash } from "./search";
import {
  SEARCH_KEYWORD_FALLBACK_MIN_DIRECT_HITS,
  SEARCH_RELATIVE_SCORE_FLOOR,
  SEARCH_VECTOR_CANDIDATES,
  SEARCH_VECTOR_MIN_SCORE,
} from "./chat/budgets";

export type SearchEvidence = {
  confidence: "strong" | "related" | "weak";
  relation: "direct" | "related";
  channels: string[];
  matchedConcepts: string[];
};
type SearchableMemory = Doc<"memories"> & { _score?: number; _match?: SearchEvidence };

export type DiarySearchHit = ReturnType<typeof toDiaryCompact> & { match?: SearchEvidence };

const VECTOR_MIN_SCORE = SEARCH_VECTOR_MIN_SCORE;
const RRF_K = 60;
const MIN_RRF_SCORE = 0.006;
const RELATIVE_SCORE_FLOOR = SEARCH_RELATIVE_SCORE_FLOOR;
const KEYWORD_MIN_SCORE = 0.4;
const STRONG_VECTOR_SCORE = 0.62;
const DIARY_TAKE = 5;
const QUERY_CACHE_TOUCH_INTERVAL_MS = 6 * 60 * 60 * 1000;

function rrfScore(rank: number) {
  return 1 / (RRF_K + rank);
}

function classifyEvidence(
  channels: string[],
  vectorScore: number,
  fullTextIsRelated = false,
): SearchEvidence["confidence"] {
  if (channels.length >= 2 || vectorScore >= STRONG_VECTOR_SCORE) return "strong";
  return vectorScore >= VECTOR_MIN_SCORE || (fullTextIsRelated && channels.includes("fulltext"))
    ? "related"
    : "weak";
}

/** Small multiplicative boost for newer memories — only meant to break ties/near-ties, decays to ~1.0 within a couple months. */
const RECENCY_BOOST_MAX = 0.1;
const RECENCY_BOOST_HALF_LIFE_DAYS = 21;
function recencyMultiplier(creationTime: number, now: number): number {
  const ageDays = Math.max(0, (now - creationTime) / (1000 * 60 * 60 * 24));
  return 1 + RECENCY_BOOST_MAX * Math.pow(0.5, ageDays / RECENCY_BOOST_HALF_LIFE_DAYS);
}

// ─── Source registry ──────────────────────────────────────────────────────────
//
// Each searchable table is described as a set of ranked channels (vector,
// fulltext, keyword, …). Independent channels run in parallel; a channel may
// deliberately await another when it is an expensive fallback. Each source is
// fused with Reciprocal Rank Fusion in its OWN pool, so one source's hits never
// displace another's (memory cards stay memory-ranked, diary rides along as
// context).
// Adding a searchable table = one more source descriptor below.

/** One ranked hit from a channel. `weight` scales the channel boost (e.g. keyword match ratio). */
type ChannelHit<TId> = { id: TId; weight?: number };

type SourceChannel<TId> = {
  name: string;
  /** RRF contribution multiplier for this channel. */
  boost: number;
  /** Ordered (best-first) hits; failures must resolve to []. */
  run: () => Promise<ChannelHit<TId>[]>;
};

type FusedSource<TId> = {
  ranked: TId[];
  scores: Map<TId, number>;
  channelHits: Map<string, number>;
  evidence: Map<TId, { channels: string[]; weights: Map<string, number> }>;
};

async function fuseSource<TId>(args: {
  channels: SourceChannel<TId>[];
  take: number;
  /** Boost items found by 2+/3+ channels (memory pool behavior). */
  multiChannelBoost?: boolean;
  /** Drop items far below the best score (memory pool behavior). */
  relativeFloor?: boolean;
}): Promise<FusedSource<TId>> {
  const channelResults = await Promise.all(
    args.channels.map(async (channel) => ({
      channel,
      hits: await channel.run().catch(() => [] as ChannelHit<TId>[]),
    })),
  );

  const fused = new Map<TId, { score: number; sources: string[]; weights: Map<string, number> }>();
  const channelHits = new Map<string, number>();
  for (const { channel, hits } of channelResults) {
    channelHits.set(channel.name, hits.length);
    for (let i = 0; i < hits.length; i += 1) {
      const hit = hits[i];
      const contribution = rrfScore(i) * channel.boost * (hit.weight ?? 1);
      const existing = fused.get(hit.id);
      if (existing) {
        existing.score += contribution;
        existing.weights.set(channel.name, hit.weight ?? 1);
        if (!existing.sources.includes(channel.name)) {
          existing.sources.push(channel.name);
        }
      } else {
        fused.set(hit.id, {
          score: contribution,
          sources: [channel.name],
          weights: new Map([[channel.name, hit.weight ?? 1]]),
        });
      }
    }
  }

  if (args.multiChannelBoost) {
    for (const [, entry] of fused) {
      if (entry.sources.length >= 2) {
        entry.score *= 1.15;
      }
      if (entry.sources.length >= 3) {
        entry.score *= 1.1;
      }
    }
  }

  const rankedEntries = Array.from(fused.entries()).sort((a, b) => b[1].score - a[1].score);
  let filtered = rankedEntries;
  if (args.relativeFloor) {
    const bestScore = rankedEntries[0]?.[1].score ?? 0;
    const scoreFloor = Math.max(MIN_RRF_SCORE, bestScore * RELATIVE_SCORE_FLOOR);
    filtered = rankedEntries.filter(([, entry], index) => index === 0 || entry.score >= scoreFloor);
  }

  return {
    ranked: filtered.slice(0, args.take).map(([id]) => id),
    scores: new Map(rankedEntries.map(([id, entry]) => [id, entry.score])),
    channelHits,
    evidence: new Map(
      Array.from(fused.entries()).map(([id, entry]) => [
        id,
        {
          channels: entry.sources,
          weights: entry.weights,
        },
      ]),
    ),
  };
}

// ─── Main entry ───────────────────────────────────────────────────────────────

export async function runSemanticSearch(
  ctx: Pick<ActionCtx, "runQuery" | "runMutation" | "vectorSearch">,
  args: {
    userId: Id<"users">;
    query: string;
    limit?: number;
    forceDeepSearch?: boolean;
    chatTurnId?: Id<"chatMessages">;
    chatMessageId?: Id<"chatMessages">;
    conversationId?: string;
    includeDiary?: boolean;
  },
): Promise<{ results: SearchableMemory[]; diaryResults: DiarySearchHit[]; isCached: boolean }> {
  const maxResults = args.limit ? Math.min(args.limit, 20) : 10;
  const rawQuery = args.query.trim();
  if (!rawQuery) {
    return { results: [], diaryResults: [], isCached: false };
  }
  const startedAt = Date.now();

  const contentTerms = extractSearchTerms(rawQuery);
  const cleanQuery = cleanSearchQuery(rawQuery);
  let isCached = false;

  const queryHash = normalizeSearchQueryHash(rawQuery);
  const [embeddingStatus, embeddingRoute] = await Promise.all([
    ctx.runQuery(internal.aiProviders.getEmbeddingStatusInternal, {
      userId: args.userId,
    }) as Promise<{ isRebuilding: boolean }>,
    resolveAiRoute(ctx, { userId: args.userId, feature: "memory_search" }),
  ]);

  // Resolve the query embedding once (cache-first); every vector channel in
  // every source reuses the same promise, so additional sources add zero
  // embedding calls.
  const getQueryEmbedding = async (): Promise<number[] | null> => {
    if (embeddingStatus.isRebuilding) {
      return null;
    }
    try {
      const currentFingerprint = buildEmbeddingFingerprint(
        embeddingRoute.provider,
        embeddingRoute.model,
      );
      const cached = await ctx.runQuery(internal.memories.getQueryCache, {
        userId: args.userId,
        queryHash,
      });

      // A cached vector from a different embedding model/provider lives in
      // a different vector space than the current corpus — matching it
      // against today's memory/diary embeddings silently degrades
      // relevance (or breaks outright on a dimension mismatch). This is
      // the only thing that makes staleness detection intrinsic rather
      // than depending on every embedding-route-change path remembering
      // to call clearQueryCacheForUser (only the per-user BYOK path does).
      const cacheIsFresh =
        cached?.embedding &&
        (cached.embeddingFingerprint === undefined ||
          cached.embeddingFingerprint === currentFingerprint);

      if (cacheIsFresh && !args.forceDeepSearch) {
        isCached = true;
        if (Date.now() - (cached.lastUsedAt ?? 0) > QUERY_CACHE_TOUCH_INTERVAL_MS) {
          await ctx.runMutation(internal.memories.setQueryCache, {
            userId: args.userId,
            queryHash,
          });
        }
        return cached.embedding ?? null;
      }

      const queryEmbedding = await trackedEmbedTextOnRoute(ctx, embeddingRoute, {
        userId: args.userId,
        feature: "memory_search",
        stage: "search_grounding",
        visibility: "background",
        input: cleanQuery,
        metadata: { stage: "semantic_search" },
        link: {
          chatTurnId: args.chatTurnId,
          chatMessageId: args.chatMessageId,
          conversationId: args.conversationId,
        },
      });
      await ctx.runMutation(internal.memories.setQueryCache, {
        userId: args.userId,
        queryHash,
        expandedQuery: cleanQuery,
        embedding: queryEmbedding,
        embeddingFingerprint: currentFingerprint,
      });
      return queryEmbedding;
    } catch {
      return null;
    }
  };

  const queryEmbeddingPromise = getQueryEmbedding();
  const hydratedMemories = new Map<Id<"memories">, Doc<"memories">>();
  const hydratedDiaryEntries = new Map<Id<"diaryEntries">, Doc<"diaryEntries">>();

  // Start lexical retrieval immediately. The broad keyword scan is retained
  // as a fuzzy-recall fallback, but it waits on this result and is skipped
  // when direct full-text retrieval already has enough evidence.
  const memoryFullTextPromise: Promise<Doc<"memories">[]> = ctx
    .runQuery(internal.memories.searchByContent, {
      userId: args.userId,
      query: cleanQuery,
      limit: 20,
    })
    .catch(() => [] as Doc<"memories">[]);

  // ── Memory source ──
  const memorySourcePromise = fuseSource<Id<"memories">>({
    take: maxResults,
    multiChannelBoost: true,
    relativeFloor: true,
    channels: [
      {
        name: "vector",
        boost: 2.0,
        run: async () => {
          const queryEmbedding = await queryEmbeddingPromise;
          if (!queryEmbedding) {
            return [];
          }
          const vectorResults = await ctx.vectorSearch("memories", "by_embedding", {
            vector: queryEmbedding,
            limit: SEARCH_VECTOR_CANDIDATES,
            filter: (q) => q.eq("userId", args.userId),
          });
          return vectorResults
            .filter((result) => result._score >= VECTOR_MIN_SCORE)
            .map((result) => ({ id: result._id, weight: result._score }));
        },
      },
      {
        name: "fulltext",
        boost: 1.0,
        run: async () => {
          const results = await memoryFullTextPromise;
          for (const memory of results) hydratedMemories.set(memory._id, memory);
          return results.map((memory) => ({ id: memory._id }));
        },
      },
      {
        name: "keyword",
        boost: 0.8,
        run: async () => {
          if (contentTerms.length === 0) {
            return [];
          }
          const directResults = await memoryFullTextPromise;
          if (directResults.length >= SEARCH_KEYWORD_FALLBACK_MIN_DIRECT_HITS) {
            return [];
          }
          const results: Array<{ memory: Doc<"memories">; score: number }> = await ctx.runQuery(
            internal.memories.searchByKeywordScored,
            { userId: args.userId, query: rawQuery, limit: 30 },
          );
          for (const { memory } of results) hydratedMemories.set(memory._id, memory);
          return results
            .map(({ memory, score }) => ({ id: memory._id, weight: score }))
            .filter((hit) => hit.weight >= KEYWORD_MIN_SCORE)
            .sort((a, b) => b.weight - a.weight);
        },
      },
    ],
  });

  // ── Diary source (own pool: never displaces memory results) ──
  const diarySourcePromise: Promise<FusedSource<Id<"diaryEntries">>> = args.includeDiary
    ? fuseSource<Id<"diaryEntries">>({
        take: DIARY_TAKE,
        channels: [
          {
            name: "vector",
            boost: 2.0,
            run: async () => {
              const queryEmbedding = await queryEmbeddingPromise;
              if (!queryEmbedding) {
                return [];
              }
              const vectorResults = await ctx.vectorSearch("diaryEntries", "by_embedding", {
                vector: queryEmbedding,
                limit: 10,
                filter: (q) => q.eq("userId", args.userId),
              });
              return vectorResults
                .filter((result) => result._score >= VECTOR_MIN_SCORE)
                .map((result) => ({ id: result._id, weight: result._score }));
            },
          },
          {
            name: "fulltext",
            boost: 1.0,
            run: async () => {
              const results: Doc<"diaryEntries">[] = await ctx.runQuery(
                internal.diary.searchByText,
                {
                  userId: args.userId,
                  query: cleanQuery,
                  limit: 10,
                },
              );
              for (const entry of results) hydratedDiaryEntries.set(entry._id, entry);
              return results.map((entry) => ({ id: entry._id }));
            },
          },
        ],
      })
    : Promise.resolve({
        ranked: [],
        scores: new Map(),
        channelHits: new Map(),
        evidence: new Map(),
      });

  const [memoryPool, diaryPool] = await Promise.all([memorySourcePromise, diarySourcePromise]);

  // ── Hydration ──
  let diaryResults: DiarySearchHit[] = [];
  if (diaryPool.ranked.length > 0) {
    const missingDiaryIds = diaryPool.ranked.filter((id) => !hydratedDiaryEntries.has(id));
    if (missingDiaryIds.length > 0) {
      const diaryDocs: Doc<"diaryEntries">[] = await ctx.runQuery(
        internal.diary.listByIdsInternal,
        { userId: args.userId, ids: missingDiaryIds },
      );
      for (const entry of diaryDocs) hydratedDiaryEntries.set(entry._id, entry);
    }
    diaryResults = diaryPool.ranked.flatMap((id): DiarySearchHit[] => {
      const entry = hydratedDiaryEntries.get(id);
      if (!entry) return [];
      const evidence = diaryPool.evidence.get(id);
      const channels = evidence?.channels ?? [];
      const vectorScore = evidence?.weights.get("vector") ?? 0;
      const confidence = classifyEvidence(channels, vectorScore, true);
      return [
        {
          ...toDiaryCompact(entry),
          match: {
            confidence,
            relation:
              channels.includes("fulltext") || confidence === "strong" ? "direct" : "related",
            channels,
            matchedConcepts: [],
          } satisfies SearchEvidence,
        },
      ];
    });
  }

  const usedVector = (memoryPool.channelHits.get("vector") ?? 0) > 0;
  const usedFullText = (memoryPool.channelHits.get("fulltext") ?? 0) > 0;
  const usedKeyword = (memoryPool.channelHits.get("keyword") ?? 0) > 0;

  const recordUsage = (resultCount: number) =>
    ctx.runMutation(internal.analytics.recordSearchUsage, {
      userId: args.userId,
      chatTurnId: args.chatTurnId,
      chatMessageId: args.chatMessageId,
      conversationId: args.conversationId,
      feature: args.forceDeepSearch ? "deep_search" : "memory_search",
      status: "success",
      latencyMs: Date.now() - startedAt,
      resultCount,
      usedVector,
      usedFullText,
      usedKeyword,
      cacheHit: isCached,
      isDeepSearch: Boolean(args.forceDeepSearch),
    });

  if (memoryPool.ranked.length === 0) {
    await recordUsage(0);
    return { results: [], diaryResults, isCached };
  }

  const missingMemoryIds = memoryPool.ranked.filter((id) => !hydratedMemories.has(id));
  if (missingMemoryIds.length > 0) {
    const memories: Doc<"memories">[] = await ctx.runQuery(internal.memories.listByIdsInternal, {
      userId: args.userId,
      ids: missingMemoryIds,
    });
    for (const memory of memories) hydratedMemories.set(memory._id, memory);
  }
  const now = Date.now();
  const scored: SearchableMemory[] = [];
  for (const id of memoryPool.ranked) {
    const memory = hydratedMemories.get(id);
    if (!memory) {
      continue;
    }
    const baseScore = memoryPool.scores.get(id) ?? 0;
    const evidence = memoryPool.evidence.get(id);
    const channels = evidence?.channels ?? [];
    const vectorScore = evidence?.weights.get("vector") ?? 0;
    const lexicalAgreement = channels.includes("fulltext") || channels.includes("keyword");
    const confidence = classifyEvidence(channels, vectorScore);
    const queryTerms = new Set(contentTerms);
    const matchedConcepts = (memory.searchConcepts ?? [])
      .filter((concept) =>
        concept
          .toLowerCase()
          .split(/\s+/)
          .some((term) => queryTerms.has(term)),
      )
      .slice(0, 5);
    scored.push({
      ...memory,
      _score: baseScore * recencyMultiplier(memory._creationTime, now),
      _match: {
        confidence,
        relation: lexicalAgreement || confidence === "strong" ? "direct" : "related",
        channels,
        matchedConcepts,
      },
    });
  }
  // Re-rank the already-selected pool by recency-adjusted score — this only
  // reorders ties/near-ties from the fusion step, it never pulls in items
  // the fusion step excluded.
  const results = scored.sort((a, b) => (b._score ?? 0) - (a._score ?? 0));

  await recordUsage(results.length);

  return { results, diaryResults, isCached };
}
