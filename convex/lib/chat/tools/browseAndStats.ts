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

/**
 * Offset (in minutes, local = UTC + offset) of `timeZone` at the instant
 * `ms`. Single-pass approximation — can be off by an hour during the DST
 * transition itself, which is an acceptable tradeoff for a chat-tool date
 * filter (not a billing/scheduling computation).
 */
function timezoneOffsetMinutesAt(ms: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ms));
  const map: Record<string, string> = {};
  for (const part of parts) map[part.type] = part.value;
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour) % 24,
    Number(map.minute),
    Number(map.second),
  );
  return (asUtc - ms) / 60000;
}

/** [startMs, endMs) for the local calendar day `dateStr` (YYYY-MM-DD) in `timeZone`. */
function localDayRangeMs(dateStr: string, timeZone: string): { startMs: number; endMs: number } {
  const naiveUtcMs = Date.parse(`${dateStr}T00:00:00Z`);
  const offsetMinutes = timezoneOffsetMinutesAt(naiveUtcMs, timeZone);
  const startMs = naiveUtcMs - offsetMinutes * 60000;
  return { startMs, endMs: startMs + 24 * 60 * 60 * 1000 };
}

export const listMemoriesTool: ChatTool = {
  name: "list_memories",
  label: "List memories",
  kind: "read",
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
    const limit =
      typeof fnArgs.limit === "number"
        ? Math.min(fnArgs.limit, LIST_LIMIT_MAX)
        : LIST_LIMIT_DEFAULT;
    const wantsOldest = fnArgs.sort === "oldest";
    // "oldest" needs a real ascending query — reversing the cached
    // newest-RECENT_MEMORIES_LIMIT window would return the oldest of that
    // window, not the user's actual oldest memories.
    const memories = wantsOldest
      ? ((await tc.ctx.runQuery(internal.memories.listForAI, {
          userId: tc.userId,
          limit,
          order: "asc",
        })) as MemoryDoc[])
      : await tc.getRecentMemories();
    const listed = memories.slice(0, limit);
    tc.state.surfaceCandidates = listed.map((m: MemoryDoc) => ({
      id: String(m._id),
      title: m.title ?? "",
    }));
    // The digest's exact total (not the capped list length) is what the
    // model should quote for "how many" questions — the list itself is a
    // window and can silently undercount past its cap.
    const exactTotal = tc.knowledgeDigest?.totalMemories ?? memories.length;
    const truncated = memories.length < exactTotal;
    await tc.reportProgress({
      phase: "loading",
      detail: `Loaded ${listed.length} of ${exactTotal} stored memories`,
      source: "memories",
      resultCount: exactTotal,
      previewItems: toPreviewItems(listed, "Stored memory"),
      events: [
        {
          label: "Sort",
          value: wantsOldest ? "oldest first" : "newest first",
        },
        { label: "Limit", value: `${limit}` },
      ],
    });
    return JSON.stringify({
      memories: listed.map((memory: MemoryDoc) => toMemoryCompact(memory)),
      returned: listed.length,
      total: exactTotal,
      truncated,
    });
  },
};

export const getDiaryEntriesTool: ChatTool = {
  name: "get_diary_entries",
  label: "Read diary",
  kind: "read",
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
    // A date filter needs the user's actual local day, not a UTC slice of
    // _creationTime, and needs an indexed range query rather than filtering
    // a fixed newest-N window — otherwise entries older than that window,
    // or written near local midnight, silently vanish from the result.
    const entries: Doc<"diaryEntries">[] = dateFilter
      ? await (async () => {
          const { startMs, endMs } = localDayRangeMs(dateFilter, tc.effectiveTimezone);
          return tc.ctx.runQuery(internal.diary.listByDateRangeInternal, {
            userId: tc.userId,
            startMs,
            endMs,
          });
        })()
      : await tc.ctx.runQuery(internal.diary.listRecentInternal, {
          userId: tc.userId,
          limit,
        });
    const listed = entries.slice(0, limit).map((entry) => ({
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
  kind: "read",
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
  kind: "read",
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
    const exactTotal = tc.knowledgeDigest?.totalMemories ?? memories.length;
    return JSON.stringify({
      memories: memories.slice(0, limit).map((memory: MemoryDoc) => toMemoryCompact(memory)),
      analyzed: memories.length,
      total: exactTotal,
      truncated: memories.length < exactTotal,
      diary_entries: analysisDiary.map((entry) =>
        toDiaryCompact(entry, DIARY_ANALYZE_EXCERPT_CHARS),
      ),
    });
  },
};
