/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import {
  shouldGroundAgainstDb,
  shouldRunInitialGroundingSearch,
} from "../convex/lib/chat/heuristics";
import { buildGroundingSystemMessage } from "../convex/lib/chat/prompts";
import { cleanSearchQuery, normalizeSearchQueryHash } from "../convex/lib/search";
import schema from "../convex/schema";
import { convexTest } from "convex-test";
import {
  buildMemoryEmbeddingText,
  buildMemorySearchText,
  normalizeMemoryRetrievalFields,
} from "../convex/lib/memoryRetrieval";
import { estimatePricingMicros } from "../convex/lib/aiPricing";

describe("personal recall grounding", () => {
  for (const query of [
    "what about taking a walk",
    "is there anything about work",
    "anything related to fixing my lifestyle",
    "find the memory about improving my health",
  ]) {
    test(`grounds indirect recall: ${query}`, () => {
      expect(shouldGroundAgainstDb(query)).toBe(true);
      expect(shouldRunInitialGroundingSearch(query)).toBe(true);
    });
  }

  test("does not ground a generic knowledge question", () => {
    expect(shouldGroundAgainstDb("explain how photosynthesis works")).toBe(false);
  });
});

describe("adaptive planner boundary", () => {
  const groundingBase = {
    shouldGround: true,
    shouldPreferUpdate: false,
    isGenericOnly: false,
    searchCount: 1,
    searchResults: [],
    diaryResults: [],
    recentMemories: [],
    isCached: false,
  };

  test("strong grounding tells the planner to respond without duplicate search", () => {
    const prompt = buildGroundingSystemMessage({
      ...groundingBase,
      confidence: "strong",
      needsExpansion: false,
    });
    expect(prompt).toContain("call respond directly");
    expect(prompt).toContain("do not repeat search_memories");
  });

  test("weak grounding still requires expanded retrieval", () => {
    const prompt = buildGroundingSystemMessage({
      ...groundingBase,
      confidence: "weak",
      needsExpansion: true,
    });
    expect(prompt).toContain("call search_memories once with alternate interpretations");
  });
});

describe("recall query normalization", () => {
  test("keeps concepts and removes retrieval boilerplate", () => {
    expect(cleanSearchQuery("find the memory about improving my health")).toBe("improving health");
  });

  test("equivalent retrieval wording shares an embedding cache key", () => {
    expect(normalizeSearchQueryHash("search for anything about work")).toBe(
      normalizeSearchQueryHash("work"),
    );
  });
});

describe("retrieval representation", () => {
  test("normalizes and deduplicates AI enrichment", () => {
    const fields = normalizeMemoryRetrievalFields({
      semanticSummary: "  Helps reduce fatigue during long work calls.  ",
      searchAliases: ["walking break", "walking break", "movement at work"],
      searchConcepts: ["health", "work calls", "sedentary lifestyle"],
    });
    expect(fields.searchAliases).toEqual(["walking break", "movement at work"]);
    expect(buildMemorySearchText({ title: "Sitting Fix", ...fields })).toContain(
      "sedentary lifestyle",
    );
    expect(buildMemoryEmbeddingText({ title: "Sitting Fix", ...fields })).toContain(
      "Related concepts: health, work calls, sedentary lifestyle",
    );
  });
});

describe("AI cost estimation", () => {
  test("uses the cached-input rate when provider usage reports cached tokens", () => {
    expect(
      estimatePricingMicros({
        pricing: {
          inputUsdPer1M: 2,
          cachedInputUsdPer1M: 0.5,
          outputUsdPer1M: 8,
          priceDisplayMode: "estimated",
        },
        inputTokens: 1_000_000,
        cachedInputTokens: 400_000,
        outputTokens: 100_000,
      }),
    ).toMatchObject({ costUsdMicros: 2_200_000, priceDisplayMode: "estimated" });
  });

  test("falls back to the standard input rate when no cached-input price is configured", () => {
    expect(
      estimatePricingMicros({
        pricing: { inputUsdPer1M: 2, priceDisplayMode: "estimated" },
        inputTokens: 1_000_000,
        cachedInputTokens: 400_000,
      }),
    ).toMatchObject({ costUsdMicros: 2_000_000, priceDisplayMode: "estimated" });
  });
});

describe("database-backed vector retrieval", () => {
  test("ranks a conceptually matching owned memory and filters another user", async () => {
    const t = convexTest({
      schema,
      modules: {
        "../convex/_generated/server.ts": () => import("../convex/_generated/server"),
      },
    });
    const [userId, otherUserId] = await t.run(async (ctx) => {
      const owner = await ctx.db.insert("users", { email: "owner@test.dev", name: "Owner" });
      const other = await ctx.db.insert("users", { email: "other@test.dev", name: "Other" });
      return [owner, other] as const;
    });
    const healthVector = [1, ...Array<number>(1535).fill(0)];
    const unrelatedVector = [0, 1, ...Array<number>(1534).fill(0)];
    const [matchingId, privateId] = await t.run(async (ctx) => {
      const id = await ctx.db.insert("memories", {
        userId,
        title: "Sitting Fix",
        content: "Take short movement breaks during calls.",
        importance: "normal",
        entryKind: "memory",
        status: "active",
        embeddingState: "ready",
        embedding: healthVector,
      });
      await ctx.db.insert("memories", {
        userId,
        title: "Grocery list",
        content: "Buy milk.",
        importance: "normal",
        entryKind: "memory",
        status: "active",
        embeddingState: "ready",
        embedding: unrelatedVector,
      });
      const otherId = await ctx.db.insert("memories", {
        userId: otherUserId,
        title: "Private health note",
        content: "Walking routine.",
        importance: "normal",
        entryKind: "memory",
        status: "active",
        embeddingState: "ready",
        embedding: healthVector,
      });
      return [id, otherId] as const;
    });

    const results = await t.action(async (ctx) =>
      ctx.vectorSearch("memories", "by_embedding", {
        vector: healthVector,
        limit: 10,
        filter: (q) => q.eq("userId", userId),
      }),
    );
    expect(results[0]?._id).toBe(matchingId);
    expect(results.map((result) => result._id)).not.toContain(privateId);
  });
});
