"use node";

import { normalizeSearchQueryHash } from "../../search";
import { toPreviewItems } from "../projections";
import { searchMemories } from "../search";
import type { ChatTool } from "./toolTypes";

export const searchMemoriesTool: ChatTool = {
  name: "search_memories",
  label: "Search memories",
  kind: "read",
  definition: {
    type: "function",
    function: {
      name: "search_memories",
      description:
        "Search across ALL stored memories, reminders, and diary entries using semantic plus fuzzy search. Call this for stored facts unless strong Authoritative DB grounding already contains the answer; never repeat the same search just to satisfy a tool-use rule. Weak/empty grounding must be expanded before concluding nothing exists.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query." },
          interpretations: {
            type: "array",
            maxItems: 4,
            items: { type: "string" },
            description:
              "Alternate meanings or phrasings when the user's wording is broad, indirect, or ambiguous.",
          },
          related_concepts: {
            type: "array",
            maxItems: 8,
            items: { type: "string" },
            description:
              "Activities, goals, situations, or problems that could make a memory useful even without exact wording.",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  buildStatus: (fnArgs) => ({
    phase: "searching",
    detail: `Searching memories${typeof fnArgs.query === "string" && fnArgs.query.trim() ? ` for "${String(fnArgs.query).trim()}"` : ""}`,
    source: "memories",
    events: [
      {
        label: "Scope",
        value: "title, content, people, locations, topics",
      },
      { label: "Mode", value: "semantic + keyword" },
    ],
    query: typeof fnArgs.query === "string" ? String(fnArgs.query) : undefined,
  }),
  handler: async (tc, fnArgs) => {
    const searchQuery = String(fnArgs.query || "");
    const interpretations = Array.isArray(fnArgs.interpretations)
      ? fnArgs.interpretations
          .filter((item): item is string => typeof item === "string")
          .slice(0, 4)
      : [];
    const relatedConcepts = Array.isArray(fnArgs.related_concepts)
      ? fnArgs.related_concepts
          .filter((item): item is string => typeof item === "string")
          .slice(0, 8)
      : [];
    const expandedQuery = [searchQuery, ...interpretations, ...relatedConcepts]
      .map((item) => item.trim())
      .filter(Boolean)
      .join(" ");
    // No pre-search status call here — the dispatch loop already emitted
    // this tool's buildStatus() (identical fields) right before handler ran.
    try {
      const searchQueryHash = normalizeSearchQueryHash(expandedQuery);
      const userMessageHash = normalizeSearchQueryHash(tc.userMessage);
      const searchRes =
        tc.grounding.shouldGround &&
        searchQueryHash.length > 0 &&
        searchQueryHash === userMessageHash
          ? {
              results: tc.grounding.searchResults,
              diaryResults: tc.grounding.diaryResults,
              count: tc.grounding.searchCount,
              isCached: tc.grounding.isCached,
              searchMode: tc.grounding.isCached
                ? ("semantic_cached" as const)
                : ("semantic_fresh" as const),
              confidence: tc.grounding.confidence,
              needsExpansion: tc.grounding.needsExpansion,
            }
          : await searchMemories(tc.ctx, {
              token: tc.token,
              query: expandedQuery,
              userId: tc.userId,
              recentMemories: await tc.getRecentMemories(),
            });
      tc.state.pendingSearchIsCached = searchRes.isCached ?? false;
      tc.state.flowSearches.push({
        source: "tool",
        query: searchQuery.trim() || undefined,
        resultCount: searchRes.count,
        cacheState:
          searchRes.searchMode === "semantic_cached"
            ? "cached"
            : searchRes.searchMode === "semantic_fresh"
              ? "fresh"
              : undefined,
        searchMode: searchRes.searchMode,
        confidence: searchRes.confidence,
        needsExpansion: searchRes.needsExpansion,
        interpretedAs: interpretations,
        relatedConcepts,
      });
      tc.state.surfaceCandidates = searchRes.results.map((r: { id: string; title?: string }) => ({
        id: String(r.id),
        title: r.title ?? "",
      }));
      await tc.reportProgress({
        query: searchQuery.trim() || undefined,
        phase: "searching",
        detail:
          searchRes.count > 0
            ? `Found ${searchRes.count} matching ${searchRes.count === 1 ? "memory" : "memories"}`
            : "No matching memories found",
        source: "memories",
        cacheState:
          searchRes.searchMode === "semantic_cached"
            ? "cached"
            : searchRes.searchMode === "semantic_fresh"
              ? "fresh"
              : undefined,
        resultCount: searchRes.count,
        previewItems: toPreviewItems(searchRes.results, "Stored memory"),
        events: [
          {
            label: "Scope",
            value: "title, content, people, locations, topics",
          },
          {
            label: "Ranking",
            value:
              searchRes.searchMode === "recent_only"
                ? "recent memory list"
                : "semantic + keyword fusion",
          },
          {
            label: "Cache",
            value:
              searchRes.searchMode === "semantic_cached"
                ? "embedding cache hit"
                : searchRes.searchMode === "semantic_fresh"
                  ? "fresh semantic search"
                  : "no query text",
          },
        ],
      });
      return JSON.stringify({
        results: searchRes.results,
        diary_entries: searchRes.diaryResults,
        count: searchRes.count,
        isCached: searchRes.isCached,
        searchMode: searchRes.searchMode,
      });
    } finally {
      await tc.setStreamingStatus({
        phase: "thinking",
        toolName: "planner",
        detail: "Processing search results",
        source: "chat",
        step: 3,
        totalSteps: 4,
      });
    }
  },
};
