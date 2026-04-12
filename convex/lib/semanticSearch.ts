"use node";

import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { hasOpenAI, trackedEmbedText } from "./openai";
import { cleanSearchQuery, extractSearchTerms, normalizeSearchQueryHash } from "./search";

type SearchableMemory = Doc<"memories"> & { _score?: number };

const VECTOR_MIN_SCORE = 0.4;
const RRF_K = 60;
const MIN_RRF_SCORE = 0.006;
const RELATIVE_SCORE_FLOOR = 0.6;

function rrfScore(rank: number) {
  return 1 / (RRF_K + rank);
}

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

export async function runSemanticSearch(
  ctx: Pick<ActionCtx, "runQuery" | "runMutation" | "vectorSearch">,
  args: {
    token: string;
    userId: Id<"users">;
    query: string;
    limit?: number;
    forceDeepSearch?: boolean;
  },
): Promise<{ results: SearchableMemory[]; isCached: boolean }> {
  const maxResults = args.limit ? Math.min(args.limit, 20) : 10;
  const rawQuery = args.query.trim();
  if (!rawQuery) {
    return { results: [], isCached: false };
  }
  const startedAt = Date.now();

  const contentTerms = extractSearchTerms(rawQuery);
  const vectorRanked: Array<{ id: Id<"memories">; vectorScore: number }> = [];
  const fulltextRanked: Id<"memories">[] = [];
  const keywordRanked: Array<{ id: Id<"memories">; kwScore: number }> = [];
  let isCached = false;

  const queryHash = normalizeSearchQueryHash(rawQuery);

  await Promise.allSettled([
    (async () => {
      if (!hasOpenAI()) {
        return;
      }

      try {
        const cached = await ctx.runQuery(internal.memories.getQueryCache, {
          userId: args.userId,
          queryHash,
        });

        let queryEmbedding: number[];
        if (cached?.embedding && !args.forceDeepSearch) {
          queryEmbedding = cached.embedding;
          isCached = true;
          // Refresh TTL background
          await ctx.runMutation(internal.memories.setQueryCache, {
            userId: args.userId,
            queryHash,
          });
        } else {
          const expandedQuery = cleanSearchQuery(rawQuery);
          queryEmbedding = await trackedEmbedText(ctx, {
            userId: args.userId,
            feature: "memory_search",
            input: expandedQuery,
            metadata: { stage: "semantic_search" },
          });
          await ctx.runMutation(internal.memories.setQueryCache, {
            userId: args.userId,
            queryHash,
            expandedQuery,
            embedding: queryEmbedding,
          });
        }

        const vectorResults = await ctx.vectorSearch("memories", "by_embedding", {
          vector: queryEmbedding,
          limit: 30,
          filter: (q) => q.eq("userId", args.userId),
        });

        for (const result of vectorResults) {
          if (result._score >= VECTOR_MIN_SCORE) {
            vectorRanked.push({ id: result._id, vectorScore: result._score });
          }
        }
      } catch {
        return;
      }
    })(),
    (async () => {
      try {
        const cleanQuery = cleanSearchQuery(rawQuery);
        const results: Doc<"memories">[] = await ctx.runQuery(internal.memories.searchByContent, {
          userId: args.userId,
          query: cleanQuery,
          limit: 20,
        });
        for (const memory of results) {
          fulltextRanked.push(memory._id);
        }
      } catch {
        return;
      }
    })(),
    (async () => {
      if (contentTerms.length === 0) {
        return;
      }

      try {
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
        for (const memory of results) {
          const kwScore = keywordMatchScore(memory, contentTerms, topicMap);
          if (kwScore > 0) {
            keywordRanked.push({ id: memory._id, kwScore });
          }
        }
        keywordRanked.sort((a, b) => b.kwScore - a.kwScore);
      } catch {
        return;
      }
    })(),
  ]);

  const rrfScores = new Map<Id<"memories">, { score: number; sources: string[] }>();

  function addRRF(id: Id<"memories">, rank: number, source: string, boost = 1) {
    const existing = rrfScores.get(id);
    const contribution = rrfScore(rank) * boost;
    if (existing) {
      existing.score += contribution;
      if (!existing.sources.includes(source)) {
        existing.sources.push(source);
      }
      return;
    }
    rrfScores.set(id, { score: contribution, sources: [source] });
  }

  for (let i = 0; i < vectorRanked.length; i += 1) {
    addRRF(vectorRanked[i].id, i, "vector", 2.0);
  }
  for (let i = 0; i < fulltextRanked.length; i += 1) {
    addRRF(fulltextRanked[i], i, "fulltext", 1.0);
  }
  for (let i = 0; i < keywordRanked.length; i += 1) {
    const item = keywordRanked[i];
    if (item.kwScore >= 0.4) {
      addRRF(item.id, i, "keyword", 0.8 * item.kwScore);
    }
  }

  for (const [, entry] of rrfScores) {
    if (entry.sources.length >= 2) {
      entry.score *= 1.15;
    }
    if (entry.sources.length >= 3) {
      entry.score *= 1.1;
    }
  }

  const rankedEntries = Array.from(rrfScores.entries()).sort((a, b) => b[1].score - a[1].score);

  const bestScore = rankedEntries[0]?.[1].score ?? 0;
  const scoreFloor = Math.max(MIN_RRF_SCORE, bestScore * RELATIVE_SCORE_FLOOR);
  const rankedIds = rankedEntries
    .filter(([, entry], index) => index === 0 || entry.score >= scoreFloor)
    .slice(0, maxResults)
    .map(([id]) => id);

  if (rankedIds.length === 0) {
    await ctx.runMutation(internal.analytics.recordSearchUsage, {
      userId: args.userId,
      feature: args.forceDeepSearch ? "deep_search" : "memory_search",
      status: "success",
      latencyMs: Date.now() - startedAt,
      resultCount: 0,
      usedVector: vectorRanked.length > 0,
      usedFullText: fulltextRanked.length > 0,
      usedKeyword: keywordRanked.length > 0,
      cacheHit: isCached,
      isDeepSearch: Boolean(args.forceDeepSearch),
    });
    return { results: [], isCached };
  }

  const memories: Doc<"memories">[] = await ctx.runQuery(internal.memories.listByIdsInternal, {
    userId: args.userId,
    ids: rankedIds,
  });

  const byId = new Map(memories.map((memory) => [memory._id, memory] as const));
  const results: SearchableMemory[] = [];
  for (const id of rankedIds) {
    const memory = byId.get(id);
    if (!memory) {
      continue;
    }
    results.push({ ...memory, _score: rrfScores.get(id)?.score ?? 0 });
  }

  await ctx.runMutation(internal.analytics.recordSearchUsage, {
    userId: args.userId,
    feature: args.forceDeepSearch ? "deep_search" : "memory_search",
    status: "success",
    latencyMs: Date.now() - startedAt,
    resultCount: results.length,
    usedVector: vectorRanked.length > 0,
    usedFullText: fulltextRanked.length > 0,
    usedKeyword: keywordRanked.length > 0,
    cacheHit: isCached,
    isDeepSearch: Boolean(args.forceDeepSearch),
  });

  return { results, isCached };
}
