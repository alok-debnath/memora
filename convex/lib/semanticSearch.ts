"use node";

import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { trackedEmbedText } from "./aiDispatch";
import { toDiaryCompact } from "./diaryText";
import { cleanSearchQuery, extractSearchTerms, normalizeSearchQueryHash } from "./search";

type SearchableMemory = Doc<"memories"> & { _score?: number };

export type DiarySearchHit = ReturnType<typeof toDiaryCompact>;

const VECTOR_MIN_SCORE = 0.4;
const RRF_K = 60;
const MIN_RRF_SCORE = 0.006;
const RELATIVE_SCORE_FLOOR = 0.6;
const KEYWORD_MIN_SCORE = 0.4;
const DIARY_TAKE = 5;

function rrfScore(rank: number) {
  return 1 / (RRF_K + rank);
}

// ─── Source registry ──────────────────────────────────────────────────────────
//
// Each searchable table is described as a set of ranked channels (vector,
// fulltext, keyword, …). Channels run in parallel; each source is fused with
// Reciprocal Rank Fusion in its OWN pool, so one source's hits never displace
// another's (memory cards stay memory-ranked, diary rides along as context).
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

  const fused = new Map<TId, { score: number; sources: string[] }>();
  const channelHits = new Map<string, number>();
  for (const { channel, hits } of channelResults) {
    channelHits.set(channel.name, hits.length);
    for (let i = 0; i < hits.length; i += 1) {
      const hit = hits[i];
      const contribution = rrfScore(i) * channel.boost * (hit.weight ?? 1);
      const existing = fused.get(hit.id);
      if (existing) {
        existing.score += contribution;
        if (!existing.sources.includes(channel.name)) {
          existing.sources.push(channel.name);
        }
      } else {
        fused.set(hit.id, { score: contribution, sources: [channel.name] });
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
  };
}

// ─── Keyword scoring (memory source only) ─────────────────────────────────────

function keywordMatchScore(
  memory: Doc<"memories">,
  queryTerms: string[],
  topicMap: Map<Id<"userTopics">, string>,
): number {
  if (queryTerms.length === 0) {
    return 0;
  }

  const topicNames = (memory.topicIds ?? []).map((id) => topicMap.get(id)).filter(Boolean);
  const primaryTopic = memory.primaryTopicId ? topicMap.get(memory.primaryTopicId) : "";
  if (primaryTopic) {
    topicNames.push(primaryTopic);
  }

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
      singular = `${term.substring(0, term.length - 3)}y`;
    } else if (term.endsWith("s") && term.length > 3) {
      singular = term.substring(0, term.length - 1);
    }

    if (haystack.includes(term) || (singular !== term && haystack.includes(singular))) {
      matched += 1;
    }
  }

  return matched / queryTerms.length;
}

// ─── Main entry ───────────────────────────────────────────────────────────────

export async function runSemanticSearch(
  ctx: Pick<ActionCtx, "runQuery" | "runMutation" | "vectorSearch">,
  args: {
    token: string;
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
  const embeddingStatus: {
    isRebuilding: boolean;
  } = await ctx.runQuery(internal.aiProviders.getEmbeddingStatusInternal, {
    userId: args.userId,
  });

  // Resolve the query embedding once (cache-first); every vector channel in
  // every source reuses the same promise, so additional sources add zero
  // embedding calls.
  const getQueryEmbedding = async (): Promise<number[] | null> => {
    if (embeddingStatus.isRebuilding) {
      return null;
    }
    try {
      const cached = await ctx.runQuery(internal.memories.getQueryCache, {
        userId: args.userId,
        queryHash,
      });

      if (cached?.embedding && !args.forceDeepSearch) {
        isCached = true;
        // Refresh TTL background
        await ctx.runMutation(internal.memories.setQueryCache, {
          userId: args.userId,
          queryHash,
        });
        return cached.embedding;
      }

      const queryEmbedding = await trackedEmbedText(ctx, {
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
      });
      return queryEmbedding;
    } catch {
      return null;
    }
  };

  const queryEmbeddingPromise = getQueryEmbedding();

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
            limit: 30,
            filter: (q) => q.eq("userId", args.userId),
          });
          return vectorResults
            .filter((result) => result._score >= VECTOR_MIN_SCORE)
            .map((result) => ({ id: result._id }));
        },
      },
      {
        name: "fulltext",
        boost: 1.0,
        run: async () => {
          const results: Doc<"memories">[] = await ctx.runQuery(internal.memories.searchByContent, {
            userId: args.userId,
            query: cleanQuery,
            limit: 20,
          });
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
          const userTopics = await ctx.runQuery(internal.userTopics.listActiveNames, {
            userId: args.userId,
          });
          const topicMap = new Map<Id<"userTopics">, string>(
            userTopics.map(
              (topic: { _id: Id<"userTopics">; name: string }) =>
                [topic._id, topic.name.toLowerCase()] as const,
            ),
          );
          const results: Doc<"memories">[] = await ctx.runQuery(internal.memories.searchByKeyword, {
            userId: args.userId,
            query: rawQuery,
            limit: 30,
          });
          return results
            .map((memory) => ({
              id: memory._id,
              weight: keywordMatchScore(memory, contentTerms, topicMap),
            }))
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
                .map((result) => ({ id: result._id }));
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
              return results.map((entry) => ({ id: entry._id }));
            },
          },
        ],
      })
    : Promise.resolve({ ranked: [], scores: new Map(), channelHits: new Map() });

  const [memoryPool, diaryPool] = await Promise.all([memorySourcePromise, diarySourcePromise]);

  // ── Hydration ──
  let diaryResults: DiarySearchHit[] = [];
  if (diaryPool.ranked.length > 0) {
    const diaryDocs: Doc<"diaryEntries">[] = await ctx.runQuery(internal.diary.listByIdsInternal, {
      userId: args.userId,
      ids: diaryPool.ranked,
    });
    const diaryById = new Map(diaryDocs.map((entry) => [entry._id, entry] as const));
    diaryResults = diaryPool.ranked
      .map((id) => diaryById.get(id))
      .filter((entry): entry is Doc<"diaryEntries"> => !!entry)
      .map((entry) => toDiaryCompact(entry));
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

  const memories: Doc<"memories">[] = await ctx.runQuery(internal.memories.listByIdsInternal, {
    userId: args.userId,
    ids: memoryPool.ranked,
  });

  const byId = new Map(memories.map((memory) => [memory._id, memory] as const));
  const results: SearchableMemory[] = [];
  for (const id of memoryPool.ranked) {
    const memory = byId.get(id);
    if (!memory) {
      continue;
    }
    results.push({ ...memory, _score: memoryPool.scores.get(id) ?? 0 });
  }

  await recordUsage(results.length);

  return { results, diaryResults, isCached };
}
