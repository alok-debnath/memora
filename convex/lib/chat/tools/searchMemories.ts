"use node";

import { normalizeSearchQueryHash } from "../../search";
import { toPreviewItems } from "../projections";
import { searchMemories } from "../search";
import type { ChatTool } from "./toolTypes";

export const searchMemoriesTool: ChatTool = {
  name: "search_memories",
  label: "Search memories",
  definition: {
    type: "function",
    function: {
      name: "search_memories",
      description:
        "Search across ALL of the user's stored data — memories, reminders, AND diary entries — using semantic plus fuzzy search. Results are tagged with source ('memory' or 'diary'). Use whenever the user asks about stored facts, counts, past events, feelings, or wants to recall information. You MUST call this (or list_memories) before answering any factual question about stored data — never answer from inference.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query." },
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
    // No pre-search status call here — the dispatch loop already emitted
    // this tool's buildStatus() (identical fields) right before handler ran.
    try {
      const searchQueryHash = normalizeSearchQueryHash(searchQuery);
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
            }
          : await searchMemories(tc.ctx, {
              token: tc.token,
              query: searchQuery,
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
