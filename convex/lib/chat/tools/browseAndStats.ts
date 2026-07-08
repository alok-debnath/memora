import { internal } from "../../../_generated/api";
import type { Doc } from "../../../_generated/dataModel";
import { toDiaryCompact } from "../../diaryText";
import { getMemorySchedule, isReminder } from "../../memoryKind";
import {
  DIARY_ANALYZE_EXCERPT_CHARS,
  DIARY_ANALYZE_FETCH,
  DIARY_STATS_FETCH,
  DIARY_TOOL_EXCERPT_CHARS,
  DIARY_TOOL_INSIGHTS_MAX,
  DIARY_TOOL_LIMIT_DEFAULT,
  DIARY_TOOL_LIMIT_MAX,
  LIST_LIMIT_DEFAULT,
  LIST_LIMIT_MAX,
} from "../budgets";
import { toMemoryCompact, toPreviewItems } from "../projections";
import type { MemoryDoc } from "../types";
import type { ChatTool } from "./toolTypes";

export const listMemoriesTool: ChatTool = {
  name: "list_memories",
  label: "List memories",
  definition: {
    type: "function",
    function: {
      name: "list_memories",
      description:
        "List memories with optional filters for browsing or counting. Use this for count questions ('how many X'), existence checks, or when the user asks to see/list stored items. You MUST call this (or search_memories) before answering any factual question about stored data.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number" },
          sort: { type: "string", enum: ["newest", "oldest"] },
        },
        additionalProperties: false,
      },
    },
  },
  buildStatus: () => ({
    phase: "loading",
    detail: "Listing stored memories",
    source: "memories",
    events: [{ label: "Status", value: "active" }],
  }),
  handler: async (tc, fnArgs) => {
    const memories = await tc.getRecentMemories();
    const limit =
      typeof fnArgs.limit === "number"
        ? Math.min(fnArgs.limit, LIST_LIMIT_MAX)
        : LIST_LIMIT_DEFAULT;
    const ordered = fnArgs.sort === "oldest" ? [...memories].reverse() : memories;
    const listed = ordered.slice(0, limit);
    tc.state.surfaceCandidates = listed.map((m: MemoryDoc) => ({
      id: String(m._id),
      title: m.title ?? "",
    }));
    await tc.reportProgress({
      phase: "loading",
      detail: `Loaded ${listed.length} of ${memories.length} stored memories`,
      source: "memories",
      resultCount: memories.length,
      previewItems: toPreviewItems(listed, "Stored memory"),
      events: [
        {
          label: "Sort",
          value: fnArgs.sort === "oldest" ? "oldest first" : "newest first",
        },
        { label: "Limit", value: `${limit}` },
      ],
    });
    return JSON.stringify({
      memories: listed.map((memory: MemoryDoc) => toMemoryCompact(memory)),
      count: memories.length,
    });
  },
};

export const getDiaryEntriesTool: ChatTool = {
  name: "get_diary_entries",
  label: "Read diary",
  definition: {
    type: "function",
    function: {
      name: "get_diary_entries",
      description:
        "Fetch the user's recent diary entries with full text, mood, and insights. Use for questions about what they wrote, how they felt, or their recent days ('what did I write yesterday', 'how was my week'). For topic-based lookups across all entries, prefer search_memories.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Max entries to return, newest first (default 5, max 15).",
          },
          date: {
            type: "string",
            description: "Optional YYYY-MM-DD filter to fetch entries from one specific day.",
          },
        },
        additionalProperties: false,
      },
    },
  },
  buildStatus: () => ({
    phase: "loading",
    detail: "Reading recent diary entries",
    source: "diary",
    events: [{ label: "Scope", value: "full text, mood, insights" }],
  }),
  handler: async (tc, fnArgs) => {
    const limit =
      typeof fnArgs.limit === "number"
        ? Math.min(fnArgs.limit, DIARY_TOOL_LIMIT_MAX)
        : DIARY_TOOL_LIMIT_DEFAULT;
    const dateFilter = typeof fnArgs.date === "string" ? fnArgs.date.trim() : "";
    const entries: Doc<"diaryEntries">[] = await tc.ctx.runQuery(
      internal.diary.listRecentInternal,
      {
        userId: tc.userId,
        limit: dateFilter ? 50 : limit,
      },
    );
    const filtered = dateFilter
      ? entries.filter(
          (entry) => new Date(entry._creationTime).toISOString().slice(0, 10) === dateFilter,
        )
      : entries;
    const listed = filtered.slice(0, limit).map((entry) => ({
      ...toDiaryCompact(entry, DIARY_TOOL_EXCERPT_CHARS),
      insights: (entry.structuredInsights ?? []).slice(0, DIARY_TOOL_INSIGHTS_MAX),
      action_items: entry.actionItems ?? [],
    }));
    await tc.reportProgress({
      phase: "loading",
      detail:
        listed.length > 0
          ? `Loaded ${listed.length} diary ${listed.length === 1 ? "entry" : "entries"}`
          : "No diary entries found",
      source: "diary",
      resultCount: listed.length,
      previewItems: toPreviewItems(
        listed.map((entry) => ({ title: entry.summary ?? entry.excerpt })),
        "Diary entry",
      ),
      events: [
        { label: "Sort", value: "newest first" },
        ...(dateFilter ? [{ label: "Date", value: dateFilter }] : []),
      ],
    });
    return JSON.stringify({ diary_entries: listed, count: listed.length });
  },
};

export const getStatsTool: ChatTool = {
  name: "get_stats",
  label: "Compute stats",
  definition: {
    type: "function",
    function: {
      name: "get_stats",
      description:
        "Get statistics about the user's memories including reminders, recurring items, and recent activity.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  buildStatus: () => ({
    phase: "analyzing",
    detail: "Computing memory statistics",
    source: "memories",
    events: [{ label: "Analysis", value: "counts and trends" }],
  }),
  handler: async (tc) => {
    // Exact totals come from the aggregate stats table (via the digest
    // query); the recent-memories list is capped, so counting it would
    // undercount large accounts. The list only feeds the recent/recurring
    // scans below.
    const digest = tc.knowledgeDigest;
    const [memories, diaryEntries] = await Promise.all([
      tc.getRecentMemories(),
      tc.ctx.runQuery(internal.diary.listRecentInternal, {
        userId: tc.userId,
        limit: DIARY_STATS_FETCH,
      }) as Promise<Doc<"diaryEntries">[]>,
    ]);
    let withReminders = 0;
    let recurring = 0;

    for (const memory of memories) {
      if (isReminder(memory)) withReminders += 1;
      if (getMemorySchedule(memory)?.isRecurring) recurring += 1;
    }

    const totalMemories = digest?.totalMemories ?? memories.length;
    const totalReminders = digest?.totalReminders ?? withReminders;
    const totalDiaryEntries = digest?.totalDiaryEntries ?? diaryEntries.length;

    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentCount = memories.filter(
      (memory: MemoryDoc) => memory._creationTime >= weekAgo,
    ).length;
    const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const moodDistribution: Record<string, number> = {};
    for (const entry of diaryEntries) {
      if (entry._creationTime >= monthAgo && entry.mood) {
        moodDistribution[entry.mood] = (moodDistribution[entry.mood] ?? 0) + 1;
      }
    }
    await tc.reportProgress({
      phase: "analyzing",
      detail: `Computed stats across ${totalMemories} stored memories`,
      source: "memories",
      resultCount: totalMemories,
      events: [
        { label: "Reminders", value: `${totalReminders}` },
        { label: "Recurring", value: `${recurring}` },
        { label: "Recent 7d", value: `${recentCount}` },
      ],
    });
    return JSON.stringify({
      total: totalMemories,
      withReminders: totalReminders,
      recurring,
      recentCount,
      diaryEntries: totalDiaryEntries,
      moodLast30Days: moodDistribution,
    });
  },
};

export const analyzeMemoriesTool: ChatTool = {
  name: "analyze_memories",
  label: "Analyze memories",
  definition: {
    type: "function",
    function: {
      name: "analyze_memories",
      description: "Retrieve memories for analysis, summaries, trends, and insights.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number" },
        },
        additionalProperties: false,
      },
    },
  },
  buildStatus: () => ({
    phase: "analyzing",
    detail: "Analyzing memory patterns",
    source: "memories",
    events: [{ label: "Analysis", value: "pattern scan" }],
  }),
  handler: async (tc, fnArgs) => {
    const memories = await tc.getRecentMemories();
    const limit =
      typeof fnArgs.limit === "number" ? Math.min(fnArgs.limit, LIST_LIMIT_MAX) : LIST_LIMIT_MAX;
    await tc.reportProgress({
      phase: "analyzing",
      detail: `Preparing ${Math.min(limit, memories.length)} memories for analysis`,
      source: "memories",
      resultCount: memories.length,
      previewItems: toPreviewItems(memories.slice(0, limit), "Stored memory"),
      events: [
        { label: "Limit", value: `${limit}` },
        { label: "Scope", value: "active memories only" },
      ],
    });
    const analysisDiary: Doc<"diaryEntries">[] = await tc.ctx.runQuery(
      internal.diary.listRecentInternal,
      { userId: tc.userId, limit: DIARY_ANALYZE_FETCH },
    );
    return JSON.stringify({
      memories: memories.slice(0, limit).map((memory: MemoryDoc) => toMemoryCompact(memory)),
      count: memories.length,
      diary_entries: analysisDiary.map((entry) =>
        toDiaryCompact(entry, DIARY_ANALYZE_EXCERPT_CHARS),
      ),
    });
  },
};
