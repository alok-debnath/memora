"use node";

import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import { runSemanticSearch } from "../semanticSearch";
import {
  GROUNDING_RESULTS_TOP,
  GROUNDING_RECENT_TOP,
  RECENT_MEMORIES_LIMIT,
  SEARCH_FETCH_LIMIT,
  SEARCH_RESULTS_TOP,
} from "./budgets";
import {
  isGenericOnlyQuery,
  shouldGroundAgainstDb,
  shouldPreferUpdatingExisting,
  shouldRunInitialGroundingSearch,
} from "./heuristics";
import { toMemoryCompact, toMemorySummary } from "./projections";
import type { GroundingContext, MemoryDoc, MemorySearchResult } from "./types";

export async function listMemoriesForAI(
  ctx: ActionCtx,
  userId: Id<"users">,
  limit = RECENT_MEMORIES_LIMIT,
) {
  return await ctx.runQuery(internal.memories.listForAI, {
    userId,
    limit: Math.min(limit, RECENT_MEMORIES_LIMIT),
  });
}

export async function searchMemories(
  ctx: ActionCtx,
  args: {
    token: string;
    query: string;
    userId: Id<"users">;
    recentMemories?: MemoryDoc[];
    chatTurnId?: Id<"chatMessages">;
  },
): Promise<MemorySearchResult> {
  const recentMemories = args.recentMemories ?? (await listMemoriesForAI(ctx, args.userId));
  const normalizedQuery = args.query.trim();
  if (!normalizedQuery) {
    return {
      results: recentMemories.slice(0, SEARCH_RESULTS_TOP).map(toMemorySummary),
      diaryResults: [],
      count: recentMemories.length,
      searchMode: "recent_only",
    };
  }

  // The rewritten semanticSearch already handles:
  // 1. LLM query expansion (strips intent words, adds synonyms)
  // 2. Vector search with permissive thresholds
  // 3. Full-text search with cleaned query
  // 4. Proportional keyword matching (prevents single-term noise)
  // 5. RRF fusion ranking across all sources
  const semanticResults = await runSemanticSearch(ctx, {
    token: args.token,
    userId: args.userId,
    query: normalizedQuery,
    limit: SEARCH_FETCH_LIMIT,
    chatTurnId: args.chatTurnId,
    chatMessageId: args.chatTurnId,
    includeDiary: true,
  });

  return {
    results: semanticResults.results.slice(0, SEARCH_RESULTS_TOP).map(toMemorySummary),
    diaryResults: semanticResults.diaryResults,
    count: semanticResults.results.length + semanticResults.diaryResults.length,
    isCached: semanticResults.isCached,
    searchMode: semanticResults.isCached ? "semantic_cached" : "semantic_fresh",
  };
}

export async function resolveMemoryReference(
  ctx: ActionCtx,
  args: {
    token: string;
    userId: Id<"users">;
    reference?: string;
    recentMemories?: MemoryDoc[];
  },
): Promise<Id<"memories"> | null> {
  const recentMemories = args.recentMemories ?? (await listMemoriesForAI(ctx, args.userId, 20));

  if (!args.reference?.trim()) {
    return recentMemories[0]?._id ?? null;
  }

  const reference = args.reference.trim().toLowerCase();

  const exactIdMatch = recentMemories.find((memory: MemoryDoc) => memory._id === args.reference);
  if (exactIdMatch) {
    return exactIdMatch._id;
  }

  const referenceTerms = reference
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 1);

  const scored = recentMemories
    .map((memory: MemoryDoc) => {
      const title = (memory.title ?? "").toLowerCase();
      const content = (memory.content ?? "").toLowerCase();
      let score = 0;
      if (title.includes(reference)) score += 5;
      if (content.includes(reference)) score += 3;
      for (const term of referenceTerms) {
        if (title.includes(term)) score += 2;
        if (content.includes(term)) score += 1;
      }
      return { memory, score };
    })
    .sort(
      (a: { memory: MemoryDoc; score: number }, b: { memory: MemoryDoc; score: number }) =>
        b.score - a.score,
    );

  if ((scored[0]?.score ?? 0) > 0) {
    return scored[0].memory._id;
  }

  return recentMemories[0]?._id ?? null;
}

export async function buildGroundingContext(
  ctx: ActionCtx,
  args: {
    token: string;
    message: string;
    userId: Id<"users">;
    recentMemories?: MemoryDoc[];
    skipInitialGroundingSearch?: boolean;
    chatTurnId?: Id<"chatMessages">;
  },
): Promise<GroundingContext> {
  const isGenericOnly = isGenericOnlyQuery(args.message);
  const shouldGround = shouldGroundAgainstDb(args.message);
  const shouldPreferUpdate = shouldPreferUpdatingExisting(args.message);
  const shouldRunSearch = shouldRunInitialGroundingSearch(args.message);

  if (!shouldGround || !shouldRunSearch || args.skipInitialGroundingSearch) {
    return {
      shouldGround: false,
      shouldPreferUpdate,
      isGenericOnly,
      searchCount: 0,
      searchResults: [],
      diaryResults: [],
      recentMemories: [],
      isCached: false,
    };
  }

  const recentMemories = args.recentMemories ?? (await listMemoriesForAI(ctx, args.userId, 40));
  const searchRes = await searchMemories(ctx, {
    token: args.token,
    query: args.message,
    userId: args.userId,
    recentMemories,
    chatTurnId: args.chatTurnId,
  });

  return {
    shouldGround,
    shouldPreferUpdate,
    isGenericOnly,
    searchCount: searchRes.count,
    searchResults: searchRes.results.slice(0, GROUNDING_RESULTS_TOP),
    diaryResults: searchRes.diaryResults,
    recentMemories: recentMemories.slice(0, GROUNDING_RECENT_TOP).map(toMemoryCompact),
    isCached: searchRes.isCached ?? false,
  };
}
