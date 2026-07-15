import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { resolveUser } from "./lib/withAuth";
import { buildDiarySearchText } from "./lib/diaryText";
import { moodValidator, energyLevelValidator, priorityValidator } from "./lib/validators";
import { buildCalendarSummary, buildInsights } from "./model/diary/insights";

/** Bounded read window for calendar/insights rollups — one indexed range read, no table scans. */
const DIARY_ROLLUP_MAX_ENTRIES = 400;
const DIARY_SEARCH_MAX_RESULTS = 30;

export const list = query({
  args: {
    token: v.string(),
    limit: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const limit = args.limit ? Math.min(args.limit, 100) : 100;
    return await ctx.db
      .query("diaryEntries")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit);
  },
});

/**
 * Paginated entry feed with optional mood + date-range filters.
 * `by_user_mood` when a mood is set, otherwise `by_user`; both support a
 * `_creationTime` range after the eq fields.
 */
export const listPaginated = query({
  args: {
    token: v.string(),
    paginationOpts: paginationOptsValidator,
    mood: v.optional(moodValidator),
    dateStartMs: v.optional(v.number()),
    dateEndMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const { mood, dateStartMs, dateEndMs } = args;

    const applyRange = <Q extends { gte: any; lt: any }>(q: Q) => {
      let range = q;
      if (dateStartMs !== undefined) range = range.gte("_creationTime", dateStartMs);
      if (dateEndMs !== undefined) range = range.lt("_creationTime", dateEndMs);
      return range;
    };

    const base = mood
      ? ctx.db
          .query("diaryEntries")
          .withIndex("by_user_mood", (q) => applyRange(q.eq("userId", userId).eq("mood", mood)))
      : ctx.db
          .query("diaryEntries")
          .withIndex("by_user", (q) => applyRange(q.eq("userId", userId)));

    const page = await base.order("desc").paginate(args.paginationOpts);
    return {
      ...page,
      page: page.page.map(toDiaryListItem),
    };
  },
});

/** Full entry for the detail screen; ownership-checked, tolerant of bad route params. */
export const getEntry = query({
  args: {
    token: v.string(),
    id: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const entryId = ctx.db.normalizeId("diaryEntries", args.id);
    if (!entryId) return null;
    const entry = await ctx.db.get(entryId);
    if (!entry || entry.userId !== userId) return null;
    const { embedding: _embedding, ...rest } = entry;
    return rest;
  },
});

/**
 * Edit an entry's text. Derived AI fields are cleared and the existing
 * processing action re-runs (analysis + searchText + embedding), so an edited
 * entry goes through exactly the same enrichment path as a new one.
 */
export const update = mutation({
  args: {
    token: v.string(),
    id: v.id("diaryEntries"),
    rawText: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const entry = await ctx.db.get(args.id);
    if (!entry || entry.userId !== userId) throw new Error("Not found");
    const rawText = args.rawText.trim();
    if (!rawText) throw new Error("Entry text cannot be empty");

    await ctx.db.patch(args.id, {
      rawText,
      correctedText: undefined,
      summary: undefined,
      mood: undefined,
      energyLevel: undefined,
      structuredInsights: undefined,
      habitsDetected: undefined,
      personalityTraits: undefined,
      likes: undefined,
      dislikes: undefined,
      actionItems: undefined,
      searchText: buildDiarySearchText({ rawText }),
      embeddingState: "missing",
    });

    await ctx.runMutation(internal.analytics.recordProductEvent, {
      userId,
      event: "diary_updated",
    });
    await ctx.scheduler.runAfter(0, api.actions.processDiary.processDiary, {
      entryId: args.id,
      rawText,
    });

    return null;
  },
});

/** Full-text search over the existing search index — pure DB, no query embedding. */
export const search = query({
  args: {
    token: v.string(),
    query: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const text = args.query.trim();
    if (!text) return [];
    const entries = await ctx.db
      .query("diaryEntries")
      .withSearchIndex("search_text", (q) => q.search("searchText", text).eq("userId", userId))
      .take(DIARY_SEARCH_MAX_RESULTS);
    return entries.map(toDiaryListItem);
  },
});

/** Per-local-day counts + dominant mood for a month grid. */
export const calendarSummary = query({
  args: {
    token: v.string(),
    startMs: v.number(),
    endMs: v.number(),
    tzOffsetMinutes: v.number(),
  },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const entries = await ctx.db
      .query("diaryEntries")
      .withIndex("by_user", (q) =>
        q.eq("userId", userId).gte("_creationTime", args.startMs).lt("_creationTime", args.endMs),
      )
      .order("desc")
      .take(DIARY_ROLLUP_MAX_ENTRIES);
    return buildCalendarSummary(entries, args.tzOffsetMinutes);
  },
});

/** Range-bounded mood/energy/topic/habit rollup for the insights view. */
export const insights = query({
  args: {
    token: v.string(),
    startMs: v.number(),
    endMs: v.number(),
    tzOffsetMinutes: v.number(),
  },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const entries = await ctx.db
      .query("diaryEntries")
      .withIndex("by_user", (q) =>
        q.eq("userId", userId).gte("_creationTime", args.startMs).lt("_creationTime", args.endMs),
      )
      .order("desc")
      .take(DIARY_ROLLUP_MAX_ENTRIES);
    return buildInsights(
      entries,
      args.tzOffsetMinutes,
      entries.length === DIARY_ROLLUP_MAX_ENTRIES,
    );
  },
});

/** List-row projection — full text stays on the detail query; embeddings never leave the server. */
function toDiaryListItem(entry: Doc<"diaryEntries">) {
  return {
    _id: entry._id,
    _creationTime: entry._creationTime,
    mood: entry.mood,
    energyLevel: entry.energyLevel,
    topics: entry.topics ?? [],
    summary: entry.summary,
    excerpt: (entry.correctedText ?? entry.rawText ?? "").slice(0, 320),
    insight: entry.structuredInsights?.[0]?.insight,
    processing: entry.embeddingState !== "ready" && !entry.summary,
  };
}

export const create = mutation({
  args: {
    token: v.string(),
    rawText: v.optional(v.string()),
    correctedText: v.optional(v.string()),
    topics: v.optional(v.array(v.string())),
    mood: v.optional(moodValidator),
    energyLevel: v.optional(energyLevelValidator),
    structuredInsights: v.optional(
      v.array(v.object({ insight: v.string(), category: v.string() })),
    ),
  },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const entryId = await ctx.db.insert("diaryEntries", {
      userId,
      rawText: args.rawText,
      correctedText: args.correctedText,
      topics: args.topics ?? ["general"],
      mood: args.mood,
      energyLevel: args.energyLevel,
      structuredInsights: args.structuredInsights,
      searchText: buildDiarySearchText({
        rawText: args.rawText,
        correctedText: args.correctedText,
        topics: args.topics,
      }),
      embeddingState: "missing",
    });
    await ctx.runMutation(internal.analytics.recordProductEvent, {
      userId,
      event: "diary_created",
    });

    await ctx.scheduler.runAfter(0, api.actions.processDiary.processDiary, {
      entryId,
      rawText: args.rawText ?? "",
    });

    return entryId;
  },
});

export const remove = mutation({
  args: { token: v.string(), id: v.id("diaryEntries") },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const entry = await ctx.db.get(args.id);
    if (!entry || entry.userId !== userId) throw new Error("Not found");
    await ctx.db.delete(args.id);
    await ctx.runMutation(internal.analytics.recordProductEvent, {
      userId,
      event: "diary_deleted",
    });
  },
});

export const listRecentForNudges = internalQuery({
  args: {
    entryId: v.id("diaryEntries"),
  },
  handler: async (ctx, args) => {
    const entry = await ctx.db.get(args.entryId);
    if (!entry) {
      return [];
    }

    return await ctx.db
      .query("diaryEntries")
      .withIndex("by_user", (q) => q.eq("userId", entry.userId))
      .order("desc")
      .take(10);
  },
});

export const getEntryInternal = internalQuery({
  args: {
    entryId: v.id("diaryEntries"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.entryId);
  },
});

/** Card display data for chat — mirrors memories.listByIds tolerance: foreign/invalid IDs are dropped, never an error. */
export const listByIds = query({
  args: {
    token: v.string(),
    ids: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const entryIds = args.ids
      .map((id) => ctx.db.normalizeId("diaryEntries", id))
      .filter((id): id is Id<"diaryEntries"> => id !== null);
    const entries = await Promise.all(entryIds.map((id) => ctx.db.get(id)));
    return entries
      .filter((entry): entry is Doc<"diaryEntries"> => entry !== null && entry.userId === userId)
      .map((entry) => ({
        _id: entry._id,
        _creationTime: entry._creationTime,
        mood: entry.mood ?? null,
        energyLevel: entry.energyLevel ?? null,
        topics: entry.topics ?? [],
        summary: entry.summary ?? null,
        excerpt: (entry.correctedText ?? entry.rawText ?? "").slice(0, 280),
      }));
  },
});

/** AI-emitted card ID validation for diary — same contract as memories.filterValidCardIds. */
export const filterValidCardIds = internalQuery({
  args: {
    userId: v.id("users"),
    ids: v.array(v.string()),
  },
  handler: async (ctx, args): Promise<string[]> => {
    const entryIds = args.ids
      .map((id) => ctx.db.normalizeId("diaryEntries", id))
      .filter((id): id is Id<"diaryEntries"> => id !== null);
    const entries = await Promise.all(entryIds.map((id) => ctx.db.get(id)));
    return entries
      .filter(
        (entry): entry is Doc<"diaryEntries"> => entry !== null && entry.userId === args.userId,
      )
      .map((entry) => String(entry._id));
  },
});

export const searchByText = internalQuery({
  args: {
    userId: v.id("users"),
    query: v.string(),
    limit: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("diaryEntries")
      .withSearchIndex("search_text", (q) =>
        q.search("searchText", args.query).eq("userId", args.userId),
      )
      .take(Math.min(args.limit ?? 10, 20));
  },
});

export const listRecentInternal = internalQuery({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("diaryEntries")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(Math.min(args.limit ?? 10, 50));
  },
});

export const listByDateRangeInternal = internalQuery({
  args: {
    userId: v.id("users"),
    startMs: v.number(),
    endMs: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("diaryEntries")
      .withIndex("by_user", (q) =>
        q
          .eq("userId", args.userId)
          .gte("_creationTime", args.startMs)
          .lt("_creationTime", args.endMs),
      )
      .order("desc")
      .take(200);
  },
});

export const listByIdsInternal = internalQuery({
  args: {
    userId: v.id("users"),
    ids: v.array(v.id("diaryEntries")),
  },
  handler: async (ctx, args) => {
    const entries = await Promise.all(args.ids.map((id) => ctx.db.get(id)));
    return entries.filter(
      (entry): entry is NonNullable<typeof entry> => !!entry && entry.userId === args.userId,
    );
  },
});

export const listForEmbeddingBackfill = internalQuery({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("diaryEntries").paginate({
      cursor: args.cursor ?? null,
      numItems: Math.min(args.limit ?? 50, 100),
    });
    return {
      batch: page.page.filter((entry) => entry.embeddingState !== "ready" || !entry.searchText),
      hasMore: !page.isDone,
      nextCursor: page.isDone ? undefined : page.continueCursor,
    };
  },
});

export const patchSearchTextInternal = internalMutation({
  args: {
    entryId: v.id("diaryEntries"),
    searchText: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.entryId, { searchText: args.searchText });
  },
});

export const getUserProfileInternal = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
  },
});

/**
 * Everything the chat AI needs to "know" the user at turn start, in one
 * transaction: stored counts, the merged profile, and recent diary entries.
 * Pure DB reads — zero AI calls.
 */
export const getKnowledgeDigestInternal = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const [stats, analyticsSummary, profile, recentDiary] = await Promise.all([
      ctx.db
        .query("userMemoryStats")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .unique(),
      ctx.db
        .query("userAnalyticsSummary")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .unique(),
      ctx.db
        .query("userProfiles")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .unique(),
      ctx.db
        .query("diaryEntries")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .order("desc")
        .take(30),
    ]);

    return {
      totalMemories: stats?.totalMemories ?? 0,
      totalReminders: stats?.totalReminders ?? 0,
      // The already-tracked analytics counter gives the exact total; the
      // capped 30-entry page below would silently report 30 for any user
      // with more diary entries than that.
      totalDiaryEntries: analyticsSummary?.totalDiaryEntries ?? recentDiary.length,
      diaryCountIsExact: analyticsSummary !== null,
      profile: profile
        ? {
            likes: profile.likes.slice(-10),
            dislikes: profile.dislikes.slice(-10),
            traits: profile.traits.slice(-10),
            habits: profile.habits.slice(-10),
          }
        : null,
      recentDiary: recentDiary.slice(0, 5).map((entry) => ({
        id: entry._id,
        date: new Date(entry._creationTime).toISOString().slice(0, 10),
        mood: entry.mood ?? null,
        summary: entry.summary ?? (entry.correctedText ?? entry.rawText ?? "").slice(0, 140),
      })),
    };
  },
});

export const replaceNudgesFromDiary = internalMutation({
  args: {
    entryId: v.id("diaryEntries"),
    nudges: v.array(
      v.object({
        title: v.string(),
        message: v.string(),
        nudgeType: v.string(),
        priority: priorityValidator,
      }),
    ),
  },
  handler: async (ctx, args) => {
    const entry = await ctx.db.get(args.entryId);
    if (!entry) {
      return;
    }

    // Dismiss active nudges (bounded fetch)
    const existing = await ctx.db
      .query("nudges")
      .withIndex("by_user", (q) => q.eq("userId", entry.userId))
      .take(100);

    const activeNudges = existing.filter((nudge) => !nudge.isDismissed);
    await Promise.all(activeNudges.map((nudge) => ctx.db.patch(nudge._id, { isDismissed: true })));

    await Promise.all(
      args.nudges.slice(0, 2).map((nudge) =>
        ctx.db.insert("nudges", {
          userId: entry.userId,
          title: nudge.title,
          message: nudge.message,
          nudgeType: nudge.nudgeType,
          priority: nudge.priority,
          isDismissed: false,
          isActedOn: false,
          basedOnDiaryEntryIds: [args.entryId],
        }),
      ),
    );
  },
});
