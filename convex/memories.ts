import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  MutationCtx,
  QueryCtx,
} from "./_generated/server";
import { api, internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { resolveUser } from "./lib/withAuth";
import { serializeMemorySnapshot } from "./lib/memorySnapshot";
import { applyUserMemoryStatsTransition } from "./lib/memoryStats";
import {
  importanceValidator,
  lifeAreaValidator,
  recurrenceValidator,
  memoryEntryKindValidator,
  memoryScheduleValidator,
  extractedActionsValidator,
  contextTagsValidator,
} from "./lib/validators";
import {
  getMemorySchedule,
  inferEntryKind,
  isReminder,
  toStoredMemoryFields,
} from "./lib/memoryKind";
import { cleanSearchQuery, extractSearchTerms } from "./lib/search";
import {
  getGoogleIntegrationForUser,
  hasSchedulingInput,
  isActiveMemory,
  isCalendarSyncEnabled,
  isSameValue,
} from "./model/memories/helpers";
import { deleteTopicLinksForMemory, replaceTopicLinksForMemory } from "./model/memories/topicLinks";
import { permanentlyDeleteMemory, softDeleteMemory } from "./model/memories/deletion";
import { executeKeywordSearch } from "./model/memories/keywordSearch";

export const list = query({
  args: {
    token: v.string(),
    limit: v.optional(v.float64()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const pageSize = args.limit ? Math.min(args.limit, 50) : 20;
    const result = await ctx.db
      .query("memories")
      .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "active"))
      .order("desc")
      .paginate({
        numItems: pageSize,
        cursor: (args.cursor ?? null) as string | null,
      });
    return {
      memories: result.page,
      nextCursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

export const listAll = query({
  args: {
    token: v.string(),
    limit: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const take = args.limit ? Math.min(args.limit, 500) : 300;
    const rows = await ctx.db
      .query("memories")
      .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "active"))
      .order("desc")
      .take(take);
    return rows.filter(isActiveMemory);
  },
});

export const flashbacks = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const now = new Date();
    const todayMonth = now.getMonth();
    const todayDay = now.getDate();
    const oneYearMs = 365 * 24 * 60 * 60 * 1000;

    const cutoff = Date.now() - oneYearMs;
    const memories = await ctx.db
      .query("memories")
      .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "active"))
      .order("desc")
      .take(500);

    return memories
      .filter(isActiveMemory)
      .filter((m) => {
        if (m._creationTime > cutoff) return false;
        const created = new Date(m._creationTime);
        const diffDays = Math.abs(
          (created.getMonth() - todayMonth) * 30 + (created.getDate() - todayDay),
        );
        return diffDays <= 3 || diffDays >= 362;
      })
      .slice(0, 5);
  },
});

export const reminders = query({
  args: {
    token: v.string(),
    asOf: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const now = args.asOf ?? new Date().toISOString();
    return await ctx.db
      .query("memories")
      .withIndex("by_user_status_nextDueAt", (q) =>
        q.eq("userId", userId).eq("status", "active").lte("nextDueAt", now),
      )
      .order("desc")
      .take(20);
  },
});

export const upcomingReminders = query({
  args: {
    token: v.string(),
    asOf: v.optional(v.string()),
    range: v.optional(
      v.union(v.literal("week"), v.literal("month"), v.literal("year"), v.literal("all")),
    ),
  },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const now = args.asOf ? new Date(args.asOf) : new Date();
    const nowIso = now.toISOString();
    const range = args.range ?? "week";

    const rangeMs: Record<string, number> = {
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
      year: 365 * 24 * 60 * 60 * 1000,
    };

    if (range === "all") {
      return await ctx.db
        .query("memories")
        .withIndex("by_user_status_nextDueAt", (q) =>
          q.eq("userId", userId).eq("status", "active").gte("nextDueAt", nowIso),
        )
        .order("asc")
        .take(50);
    }

    const endIso = new Date(now.getTime() + rangeMs[range]).toISOString();

    return await ctx.db
      .query("memories")
      .withIndex("by_user_status_nextDueAt", (q) =>
        q
          .eq("userId", userId)
          .eq("status", "active")
          .gte("nextDueAt", nowIso)
          .lte("nextDueAt", endIso),
      )
      .order("asc")
      .take(50);
  },
});

export const get = query({
  args: { token: v.string(), id: v.id("memories") },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const memory = await ctx.db.get(args.id);
    if (!memory || memory.userId !== userId || !isActiveMemory(memory)) return null;
    return memory;
  },
});

export const listByTopic = query({
  args: {
    token: v.string(),
    topicId: v.id("userTopics"),
    limit: v.optional(v.float64()),
  },
  handler: async (ctx, args): Promise<Doc<"memories">[]> => {
    const { userId } = await resolveUser(ctx, args.token);
    const take = args.limit ? Math.min(args.limit, 50) : 20;
    const links = await ctx.db
      .query("memoryTopicLinks")
      .withIndex("by_user_and_topic", (q) => q.eq("userId", userId).eq("topicId", args.topicId))
      .order("desc")
      .take(Math.max(take * 3, 30));

    const memoryIds: Id<"memories">[] = [];
    const seen = new Set<Id<"memories">>();
    for (const link of links) {
      if (seen.has(link.memoryId)) continue;
      seen.add(link.memoryId);
      memoryIds.push(link.memoryId);
    }

    const memories = await Promise.all(memoryIds.map((memoryId) => ctx.db.get(memoryId)));
    return memories
      .filter(
        (memory): memory is Doc<"memories"> =>
          memory !== null && memory.userId === userId && isActiveMemory(memory),
      )
      .sort((a, b) => b._creationTime - a._creationTime)
      .slice(0, take);
  },
});

export const listByIds = query({
  args: {
    token: v.string(),
    // Plain strings on purpose: the AI can emit IDs from other tables (e.g.
    // diary entries) — normalizeId silently drops anything that isn't a memory
    // instead of failing the whole query with an ArgumentValidationError.
    ids: v.array(v.string()),
  },
  handler: async (ctx, args): Promise<Doc<"memories">[]> => {
    const { userId } = await resolveUser(ctx, args.token);
    const memoryIds = args.ids
      .map((id) => ctx.db.normalizeId("memories", id))
      .filter((id): id is Id<"memories"> => id !== null);
    const results = await Promise.all(memoryIds.map((id) => ctx.db.get(id)));
    return results.filter(
      (m): m is Doc<"memories"> => m !== null && m.userId === userId && isActiveMemory(m),
    );
  },
});

/**
 * Validates arbitrary ID strings (typically AI-emitted) down to the user's
 * active memory IDs. Single source of truth for what may surface as a card:
 * drops diary IDs, hallucinated IDs, other users' memories, and deleted items.
 */
export const filterValidCardIds = internalQuery({
  args: {
    userId: v.id("users"),
    ids: v.array(v.string()),
  },
  handler: async (ctx, args): Promise<string[]> => {
    const memoryIds = args.ids
      .map((id) => ctx.db.normalizeId("memories", id))
      .filter((id): id is Id<"memories"> => id !== null);
    const docs = await Promise.all(memoryIds.map((id) => ctx.db.get(id)));
    return docs
      .filter(
        (m): m is Doc<"memories"> => m !== null && m.userId === args.userId && isActiveMemory(m),
      )
      .map((m) => String(m._id));
  },
});

export const searchByContent = internalQuery({
  args: {
    userId: v.id("users"),
    query: v.string(),
    limit: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const maxResults = args.limit ? Math.min(args.limit, 20) : 10;
    // Clean the query to remove intent/noise words before full-text search
    const cleanedQuery = cleanSearchQuery(args.query);
    if (!cleanedQuery) return [];

    const [enrichedResults, contentResults, titleResults] = await Promise.all([
      ctx.db
        .query("memories")
        .withSearchIndex("search_enriched", (q) =>
          q.search("searchText", cleanedQuery).eq("userId", args.userId),
        )
        .take(maxResults),
      ctx.db
        .query("memories")
        .withSearchIndex("search_content", (q) =>
          q.search("content", cleanedQuery).eq("userId", args.userId),
        )
        .take(maxResults),
      ctx.db
        .query("memories")
        .withSearchIndex("search_title", (q) =>
          q.search("title", cleanedQuery).eq("userId", args.userId),
        )
        .take(maxResults),
    ]);

    const seen = new Set<Id<"memories">>();
    const merged: Doc<"memories">[] = [];
    for (const m of [...enrichedResults, ...titleResults, ...contentResults]) {
      if (!seen.has(m._id) && isActiveMemory(m)) {
        seen.add(m._id);
        merged.push(m);
      }
    }
    return merged.slice(0, maxResults);
  },
});

export const searchByKeyword = internalQuery({
  args: {
    userId: v.id("users"),
    query: v.string(),
    limit: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const maxResults = args.limit ? Math.min(args.limit, 30) : 15;
    const queryTerms = extractSearchTerms(args.query);
    if (queryTerms.length === 0) return [];

    const scored = await executeKeywordSearch(ctx, args.userId, queryTerms);
    return scored.slice(0, maxResults).map((s) => s.memory);
  },
});

/** Keyword candidates with the exact score used by semantic fusion. */
export const searchByKeywordScored = internalQuery({
  args: {
    userId: v.id("users"),
    query: v.string(),
    limit: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const maxResults = args.limit ? Math.min(args.limit, 30) : 15;
    const queryTerms = extractSearchTerms(args.query);
    if (queryTerms.length === 0) return [];
    const scored = await executeKeywordSearch(
      ctx,
      args.userId,
      queryTerms,
      cleanSearchQuery(args.query),
    );
    return scored.slice(0, maxResults).map(({ memory, score }) => ({ memory, score }));
  },
});

export const searchInstant = query({
  args: {
    token: v.optional(v.union(v.string(), v.null())),
    query: v.string(),
    limit: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const session = await resolveUser(ctx, args.token ?? undefined);
    if (!session) return [];

    const rawQuery = args.query.trim();
    if (rawQuery.length < 3) return [];
    const maxResults = args.limit ? Math.min(args.limit, 30) : 12;
    const cleanedQuery = cleanSearchQuery(rawQuery);
    const queryTerms = extractSearchTerms(args.query);

    const [contentResults, titleResults, keywordResults] = await Promise.all([
      cleanedQuery.length > 0
        ? ctx.db
            .query("memories")
            .withSearchIndex("search_content", (q) =>
              q.search("content", cleanedQuery).eq("userId", session._id),
            )
            .take(maxResults)
        : Promise.resolve([] as Doc<"memories">[]),
      cleanedQuery.length > 0
        ? ctx.db
            .query("memories")
            .withSearchIndex("search_title", (q) =>
              q.search("title", cleanedQuery).eq("userId", session._id),
            )
            .take(maxResults)
        : Promise.resolve([] as Doc<"memories">[]),
      queryTerms.length > 0
        ? executeKeywordSearch(ctx, session._id, queryTerms)
        : Promise.resolve([]),
    ]);

    // RRF Merge — title hits get highest boost (1.4x) since titles are the
    // most information-dense field; content and keyword get 1.0x / 0.8x
    const rrfScores = new Map<string, number>();
    const RRF_K = 60;
    const addRRF = (id: string, rank: number, boost: number) => {
      const current = rrfScores.get(id) ?? 0;
      rrfScores.set(id, current + boost * (1 / (RRF_K + rank)));
    };

    contentResults.forEach((m, idx) => addRRF(m._id, idx, 1.0));
    titleResults.forEach((m, idx) => addRRF(m._id, idx, 1.4));
    keywordResults.slice(0, maxResults).forEach((kr, idx) => {
      addRRF(kr.memory._id, idx, 0.8 * kr.proportion);
    });

    const memoryMap = new Map<string, Doc<"memories">>();
    for (const m of contentResults) if (isActiveMemory(m)) memoryMap.set(m._id, m);
    for (const m of titleResults) if (isActiveMemory(m)) memoryMap.set(m._id, m);
    for (const kr of keywordResults)
      if (isActiveMemory(kr.memory)) memoryMap.set(kr.memory._id, kr.memory);

    const merged = Array.from(rrfScores.entries())
      .map(([id, score]) => ({ memory: memoryMap.get(id), score }))
      .filter((item) => item.memory !== undefined)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.memory!);

    return merged.slice(0, maxResults);
  },
});

export const listForAI = internalQuery({
  args: {
    userId: v.id("users"),
    primaryTopicId: v.optional(v.id("userTopics")),
    limit: v.optional(v.float64()),
    includeDeleted: v.optional(v.boolean()),
    /** "asc" for a true oldest-first page (list_memories sort:"oldest"). Ignored when includeDeleted/primaryTopicId is set — those callers don't need it today. */
    order: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
  },
  handler: async (ctx, args) => {
    const take = args.limit ? Math.min(args.limit, 100) : 20;
    if (args.order === "asc" && !args.includeDeleted && !args.primaryTopicId) {
      return await ctx.db
        .query("memories")
        .withIndex("by_user_status", (q) => q.eq("userId", args.userId).eq("status", "active"))
        .order("asc")
        .take(take);
    }
    if (args.includeDeleted) {
      let rows: Doc<"memories">[];
      if (args.primaryTopicId) {
        rows = await ctx.db
          .query("memories")
          .withIndex("by_user_primaryTopic", (q) =>
            q.eq("userId", args.userId).eq("primaryTopicId", args.primaryTopicId!),
          )
          .order("desc")
          .take(take);
      } else {
        rows = await ctx.db
          .query("memories")
          .withIndex("by_user", (q) => q.eq("userId", args.userId))
          .order("desc")
          .take(take);
      }
      return rows;
    }

    if (args.primaryTopicId) {
      const rows = await ctx.db
        .query("memories")
        .withIndex("by_user_primaryTopic", (q) =>
          q.eq("userId", args.userId).eq("primaryTopicId", args.primaryTopicId!),
        )
        .order("desc")
        .take(Math.min(take * 2, 200));
      return rows.filter(isActiveMemory).slice(0, take);
    }

    return await ctx.db
      .query("memories")
      .withIndex("by_user_status", (q) => q.eq("userId", args.userId).eq("status", "active"))
      .order("desc")
      .take(take);
  },
});

export const getMemoryInternal = internalQuery({
  args: { id: v.id("memories") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const listByIdsInternal = internalQuery({
  args: {
    userId: v.id("users"),
    ids: v.array(v.id("memories")),
  },
  handler: async (ctx, args): Promise<Doc<"memories">[]> => {
    const rows = await Promise.all(args.ids.map((id) => ctx.db.get(id)));
    return rows.filter(
      (memory): memory is Doc<"memories"> =>
        memory !== null && memory.userId === args.userId && isActiveMemory(memory),
    );
  },
});

export const create = mutation({
  args: {
    token: v.string(),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    people: v.optional(v.array(v.string())),
    locations: v.optional(v.array(v.string())),
    importance: importanceValidator,
    lifeArea: v.optional(lifeAreaValidator),
    contextTags: v.optional(contextTagsValidator),
    sentimentScore: v.optional(v.float64()),
    linkedUrls: v.optional(v.array(v.string())),
    extractedActions: v.optional(extractedActionsValidator),
    entryKind: v.optional(memoryEntryKindValidator),
    schedule: v.optional(memoryScheduleValidator),
    capsuleUnlockDate: v.optional(v.string()),
    skipAiProcessing: v.optional(v.boolean()),
    sourceChatTurnId: v.optional(v.id("chatMessages")),
  },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx, args.token);
    const userId = user.userId;
    const scheduling = toStoredMemoryFields({
      entryKind: args.entryKind,
      schedule: args.schedule,
    });
    if (scheduling.entryKind === "reminder" && !scheduling.schedule?.dueAt) {
      throw new Error("Reminders require a due date.");
    }
    // Auto-promote: if a due date is set without an explicit entryKind, treat as reminder
    if (scheduling.schedule?.dueAt && !scheduling.entryKind) {
      scheduling.entryKind = "reminder";
    }
    const googleIntegration =
      scheduling.entryKind === "reminder" ? await getGoogleIntegrationForUser(ctx, userId) : null;
    const canSyncReminderToGoogle = isCalendarSyncEnabled(googleIntegration);
    const memoryId = await ctx.db.insert("memories", {
      userId,
      title: args.title,
      content: args.content,
      people: args.people,
      locations: args.locations,
      importance: args.importance,
      lifeArea: args.lifeArea,
      contextTags: args.contextTags,
      sentimentScore: args.sentimentScore,
      linkedUrls: args.linkedUrls ?? [],
      extractedActions: args.extractedActions,
      ...scheduling,
      capsuleUnlockDate: args.capsuleUnlockDate,
      embeddingState: "missing",
      status: "active",
      ...(scheduling.entryKind === "reminder" && canSyncReminderToGoogle
        ? {
            googleSyncStatus: "pending" as const,
            googleSyncMessage: "Reminder saved. Waiting to sync to Google Calendar...",
            googleSyncUpdatedAt: Date.now(),
          }
        : {}),
    });
    const createdMemory = await ctx.db.get(memoryId);
    if (createdMemory) {
      await applyUserMemoryStatsTransition(ctx, null, createdMemory);
      await ctx.runMutation(internal.analytics.recordProductEvent, {
        userId,
        event: "memory_created",
      });

      // Sync to Google Calendar if it's a reminder
      if (createdMemory.entryKind === "reminder" && canSyncReminderToGoogle) {
        await ctx.runMutation(internal.integrations.queueReminderSync, {
          memoryId: createdMemory._id,
          pendingMessage: "Reminder saved. Waiting to sync to Google Calendar...",
        });
      }
    }
    if (!args.skipAiProcessing) {
      await ctx.scheduler.runAfter(0, api.actions.processMemory.processMemory, {
        memoryId,
        title: args.title ?? "",
        content: args.content ?? "",
        userTimezone: user.timezone,
        currentTime: new Date().toISOString(),
        sourceChatTurnId: args.sourceChatTurnId,
      });
    }

    return memoryId;
  },
});

export const update = mutation({
  args: {
    token: v.string(),
    id: v.id("memories"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    people: v.optional(v.array(v.string())),
    locations: v.optional(v.array(v.string())),
    importance: v.optional(importanceValidator),
    lifeArea: v.optional(v.union(lifeAreaValidator, v.null())),
    contextTags: v.optional(v.union(contextTagsValidator, v.null())),
    sentimentScore: v.optional(v.union(v.float64(), v.null())),
    linkedUrls: v.optional(v.array(v.string())),
    extractedActions: v.optional(extractedActionsValidator),
    entryKind: v.optional(v.union(memoryEntryKindValidator, v.null())),
    schedule: v.optional(v.union(memoryScheduleValidator, v.null())),
    nextDueAt: v.optional(v.union(v.string(), v.null())),
    capsuleUnlockDate: v.optional(v.union(v.string(), v.null())),
    sourceChatTurnId: v.optional(v.id("chatMessages")),
    reviewOptOut: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx, args.token);
    const userId = user.userId;
    const memory = await ctx.db.get(args.id);
    if (!memory || memory.userId !== userId || !isActiveMemory(memory))
      throw new Error("Not found");

    // Build patch object — only include defined, non-null fields (exclude non-schema args)
    const { id, token, sourceChatTurnId: _sourceChatTurnId, ...updates } = args;
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        patch[key] = value === null ? undefined : value;
      }
    }
    if (hasSchedulingInput(args)) {
      const scheduling = toStoredMemoryFields({
        entryKind: args.entryKind === null ? undefined : args.entryKind,
        schedule: args.schedule === null ? undefined : args.schedule,
      });
      if (scheduling.entryKind === "reminder" && !scheduling.schedule?.dueAt) {
        throw new Error("Reminders require a due date.");
      }
      // Auto-promote: if a due date is set without an explicit entryKind, treat as reminder
      if (scheduling.schedule?.dueAt && !scheduling.entryKind) {
        scheduling.entryKind = "reminder";
      }
      Object.assign(patch, scheduling);
    }

    const changedEntries = Object.entries(patch).filter(([key, value]) => {
      const currentValue = (memory as Record<string, unknown>)[key];
      return !isSameValue(currentValue, value);
    });

    if (changedEntries.length === 0) {
      return;
    }

    // Save history snapshot before modifying only when the update is real.
    await ctx.db.insert("memoryHistory", {
      memoryId: args.id,
      userId,
      previousTitle: memory.title ?? "",
      previousContent: memory.content ?? "",
      editedAt: Date.now(),
      snapshotJson: serializeMemorySnapshot(memory),
    });

    const finalPatch = Object.fromEntries(changedEntries);
    await ctx.db.patch(args.id, finalPatch);
    await applyUserMemoryStatsTransition(ctx, memory, {
      ...memory,
      ...finalPatch,
    });
    await ctx.runMutation(internal.analytics.recordProductEvent, {
      userId,
      event: "memory_updated",
    });

    // Sync to Google Calendar if it's a reminder
    const updatedMemory = await ctx.db.get(args.id);
    if (
      updatedMemory &&
      memory.entryKind === "reminder" &&
      updatedMemory.entryKind !== "reminder"
    ) {
      if (memory.googleEventId) {
        await ctx.scheduler.runAfter(0, internal.integrations.deleteGoogleEvent, {
          userId,
          googleEventId: memory.googleEventId,
        });
      }
      await ctx.db.patch(args.id, {
        googleEventId: undefined,
        googleSyncStatus: undefined,
        googleSyncMessage: undefined,
        googleSyncUpdatedAt: Date.now(),
        googleSyncLockToken: undefined,
        googleSyncLockAt: undefined,
        googleSyncFingerprint: undefined,
        googleSyncDesiredFingerprint: undefined,
      });
    } else if (updatedMemory && updatedMemory.entryKind === "reminder") {
      const googleIntegration = await getGoogleIntegrationForUser(ctx, userId);
      if (!isCalendarSyncEnabled(googleIntegration)) {
        return;
      }
      await ctx.runMutation(internal.integrations.queueReminderSync, {
        memoryId: updatedMemory._id,
        pendingMessage: "Reminder updated. Syncing changes to Google Calendar...",
      });
    }

    if ("title" in finalPatch || "content" in finalPatch) {
      await ctx.scheduler.runAfter(0, api.actions.processMemory.processMemory, {
        memoryId: args.id,
        title:
          (typeof finalPatch.title === "string" ? finalPatch.title : undefined) ??
          memory.title ??
          "",
        content:
          (typeof finalPatch.content === "string" ? finalPatch.content : undefined) ??
          memory.content ??
          "",
        userTimezone: user.timezone,
        currentTime: new Date().toISOString(),
        sourceChatTurnId: args.sourceChatTurnId,
      });
    }

    if ("reviewOptOut" in finalPatch) {
      const effectiveEntryKind =
        (typeof finalPatch.entryKind === "string" ? finalPatch.entryKind : undefined) ??
        memory.entryKind;
      const effectiveImportance =
        (typeof finalPatch.importance === "string" ? finalPatch.importance : undefined) ??
        memory.importance;
      if (finalPatch.reviewOptOut === true) {
        await ctx.runMutation(internal.review.internalRemoveFromReview, {
          memoryId: args.id,
          userId,
        });
      } else if (
        finalPatch.reviewOptOut === false &&
        effectiveEntryKind === "memory" &&
        (effectiveImportance === "critical" || effectiveImportance === "high")
      ) {
        await ctx.runMutation(internal.review.internalAddToReview, {
          memoryId: args.id,
          userId,
        });
      }
    }
  },
});

export const remove = mutation({
  args: { token: v.string(), id: v.id("memories") },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    // List for update/delete guards — check by status
    const memory = await ctx.db.get(args.id);
    if (!memory || memory.userId !== userId) throw new Error("Not found");
    if (memory.status === "deleted" || memory.status === "completed") return; // already inactive
    await softDeleteMemory(ctx, { memoryId: args.id, memory, userId });
    await ctx.runMutation(internal.analytics.recordProductEvent, {
      userId,
      event: "memory_deleted",
    });
  },
});

export const removeMany = mutation({
  args: {
    token: v.string(),
    ids: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const batch = args.ids.slice(0, 50);
    const remaining = args.ids.slice(50);
    let deleted = 0;
    let skippedInvalid = 0;

    for (const rawId of batch) {
      const id = ctx.db.normalizeId("memories", rawId);
      if (!id) {
        skippedInvalid += 1;
        continue;
      }

      const memory = await ctx.db.get(id);
      if (!memory || memory.userId !== userId || !isActiveMemory(memory)) {
        continue;
      }
      await softDeleteMemory(ctx, { memoryId: id, memory, userId });
      deleted += 1;
      await ctx.runMutation(internal.analytics.recordProductEvent, {
        userId,
        event: "memory_deleted",
      });
    }

    if (remaining.length > 0) {
      await ctx.scheduler.runAfter(0, api.memories.removeMany, {
        token: args.token,
        ids: remaining,
      });
    }

    return {
      deleted,
      scheduledRemaining: remaining.length,
      skippedInvalid,
    };
  },
});

export const listDeleted = query({
  args: {
    token: v.string(),
    limit: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const take = args.limit ? Math.min(args.limit, 200) : 50;
    return await ctx.db
      .query("memories")
      .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "deleted"))
      .order("desc")
      .take(take);
  },
});

export const restore = mutation({
  args: { token: v.string(), id: v.id("memories") },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const memory = await ctx.db.get(args.id);
    if (!memory || memory.userId !== userId) throw new Error("Not found");
    if (memory.status !== "deleted") return; // not deleted

    // Restore flag
    const nextMemory = {
      ...memory,
      status: "active" as const,
      deletedAt: undefined,
    };
    await ctx.db.patch(args.id, { status: "active", deletedAt: undefined });
    await applyUserMemoryStatsTransition(ctx, memory, nextMemory);

    // Re-increment topic counts
    const topicIds = Array.from(
      new Set(
        [memory.primaryTopicId, ...(memory.topicIds ?? [])].filter(
          (id): id is Id<"userTopics"> => id !== undefined,
        ),
      ),
    );
    if (topicIds.length > 0) {
      await ctx.runMutation(internal.userTopics.incrementTopicCounts, {
        topicIds,
      });
    }

    // Restore soft-deleted attachments
    const deletedAttachments = await ctx.db
      .query("memoryAttachments")
      .withIndex("by_memory_and_user_and_isDeleted", (q) =>
        q.eq("memoryId", args.id).eq("userId", userId).eq("isDeleted", true),
      )
      .collect();
    await Promise.all(deletedAttachments.map((a) => ctx.db.patch(a._id, { isDeleted: false })));
    if (deletedAttachments.length > 0) {
      await ctx.runMutation(internal.analytics.recordStorageDelta, {
        userId,
        bytesDelta: deletedAttachments.reduce((sum, attachment) => sum + attachment.sizeBytes, 0),
        fileCountDelta: deletedAttachments.length,
        imageCountDelta: deletedAttachments.filter((attachment) => attachment.type === "image")
          .length,
        documentCountDelta: deletedAttachments.filter(
          (attachment) => attachment.type === "document",
        ).length,
      });
    }

    if (nextMemory.entryKind === "reminder") {
      const googleIntegration = await getGoogleIntegrationForUser(ctx, userId);
      if (!isCalendarSyncEnabled(googleIntegration)) {
        return;
      }
      await ctx.runMutation(internal.integrations.queueReminderSync, {
        memoryId: args.id,
        pendingMessage: "Reminder restored. Syncing to Google Calendar...",
      });
    }
  },
});

export const permanentlyRemove = mutation({
  args: { token: v.string(), id: v.id("memories") },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const memory = await ctx.db.get(args.id);
    if (!memory || memory.userId !== userId) throw new Error("Not found");
    if (memory.status !== "deleted") {
      throw new Error("Memory must be in deleted state before permanent removal.");
    }
    await permanentlyDeleteMemory(ctx, memory);
  },
});

export const permanentlyRemoveAllDeleted = mutation({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const BATCH = 10;

    const deletedMemories = await ctx.db
      .query("memories")
      .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "deleted"))
      .take(BATCH);

    for (const memory of deletedMemories) {
      await permanentlyDeleteMemory(ctx, memory);
    }

    const hasMore = deletedMemories.length === BATCH;
    if (hasMore) {
      await ctx.scheduler.runAfter(0, api.memories.permanentlyRemoveAllDeleted, {
        token: args.token,
      });
    }

    return {
      success: !hasMore,
      deletedThisBatch: deletedMemories.length,
      scheduledContinuation: hasMore,
    };
  },
});

export const clearAllUserMemoryData = mutation({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const BATCH = 200;
    let deleted = 0;

    const memoryBatch = await ctx.db
      .query("memories")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(BATCH);
    for (const doc of memoryBatch) {
      await permanentlyDeleteMemory(ctx, doc);
      deleted += 1;
    }

    const topicBatch = await ctx.db
      .query("userTopics")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(BATCH);
    await Promise.all(topicBatch.map((doc) => ctx.db.delete(doc._id)));
    deleted += topicBatch.length;

    const statsBatch = await ctx.db
      .query("userMemoryStats")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(BATCH);
    await Promise.all(statsBatch.map((doc) => ctx.db.delete(doc._id)));
    deleted += statsBatch.length;

    const dailyCountsBatch = await ctx.db
      .query("userMemoryDailyCounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(BATCH);
    await Promise.all(dailyCountsBatch.map((doc) => ctx.db.delete(doc._id)));
    deleted += dailyCountsBatch.length;

    const hasMore =
      memoryBatch.length === BATCH ||
      topicBatch.length === BATCH ||
      statsBatch.length === BATCH ||
      dailyCountsBatch.length === BATCH;

    if (hasMore) {
      await ctx.scheduler.runAfter(0, api.memories.clearAllUserMemoryData, {
        token: args.token,
      });
    }

    return {
      success: !hasMore,
      deletedThisBatch: deleted,
      scheduledContinuation: hasMore,
    };
  },
});

export const getByShareToken = query({
  args: { shareToken: v.string() },
  handler: async (ctx, args) => {
    if (!args.shareToken) return null;
    const memory = await ctx.db
      .query("memories")
      .withIndex("by_share_token", (q) => q.eq("shareToken", args.shareToken))
      .first();
    if (!memory || !memory.isPublic || !isActiveMemory(memory)) return null;
    return memory;
  },
});

export const generateShareToken = mutation({
  args: { token: v.string(), id: v.id("memories") },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const memory = await ctx.db.get(args.id);
    if (!memory || memory.userId !== userId || !isActiveMemory(memory))
      throw new Error("Not found");
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const shareToken = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    await ctx.db.patch(args.id, { shareToken, isPublic: true });
    return shareToken;
  },
});

export const exportMemories = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const memories = await ctx.db
      .query("memories")
      .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "active"))
      .take(5000);
    return memories.filter(isActiveMemory).map((m) => ({
      title: m.title,
      content: m.content,
      people: m.people,
      locations: m.locations,
      importance: m.importance,
      primaryTopicId: m.primaryTopicId,
      topicIds: m.topicIds,
      createdAt: m._creationTime,
    }));
  },
});

export const stats = query({
  args: {
    token: v.string(),
    asOf: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const nowMs = args.asOf ?? Date.now();
    const statsDoc = await ctx.db
      .query("userMemoryStats")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    const dailyCounts = await ctx.db
      .query("userMemoryDailyCounts")
      .withIndex("by_user_and_day", (q) => q.eq("userId", userId))
      .order("desc")
      .take(366);
    const dailyCountByDay = new Map(dailyCounts.map((row) => [row.dayKey, row.count] as const));

    const today = new Date(nowMs);
    today.setUTCHours(0, 0, 0, 0);

    let recentCount = 0;
    let streakDays = 0;
    for (let offset = 0; offset < 365; offset += 1) {
      const day = new Date(today);
      day.setUTCDate(today.getUTCDate() - offset);
      const dayKey = day.toISOString().slice(0, 10);
      const count = dailyCountByDay.get(dayKey) ?? 0;
      if (offset < 7) {
        recentCount += count;
      }
      if (count > 0) {
        streakDays += 1;
      } else if (offset > 0) {
        break;
      }
    }

    return {
      totalMemories: statsDoc?.totalMemories ?? 0,
      totalReminders: statsDoc?.totalReminders ?? 0,
      recurringCount: statsDoc?.recurringCount ?? 0,
      recentCount,
      streakDays,
    };
  },
});

// --- Internal mutations for cron jobs ---

export const advanceRecurringReminders = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = new Date();
    const nowIso = now.toISOString();

    const batch = await ctx.db
      .query("memories")
      .withIndex("by_status_nextDueAt", (q) => q.eq("status", "active").lte("nextDueAt", nowIso))
      .take(500);

    const patches = batch.flatMap((memory) => {
      if (!isActiveMemory(memory)) return [];
      if (inferEntryKind(memory) !== "reminder") {
        return [];
      }

      const schedule = getMemorySchedule(memory);
      if (
        !schedule?.isRecurring ||
        !schedule.recurrenceType ||
        !schedule.dueAt ||
        schedule.dueAt > nowIso
      ) {
        return [];
      }

      let date = advanceDate(new Date(schedule.dueAt), schedule.recurrenceType);
      while (date <= now) {
        date = advanceDate(date, schedule.recurrenceType);
      }

      return [
        ctx.db.patch(
          memory._id,
          toStoredMemoryFields({
            entryKind: "reminder",
            schedule: {
              dueAt: date.toISOString(),
              isRecurring: true,
              recurrenceType: schedule.recurrenceType,
            },
          }),
        ),
      ];
    });
    await Promise.all(patches);

    return { advanced: patches.length };
  },
});

function advanceDate(date: Date, recurrenceType: "daily" | "weekly" | "monthly" | "yearly"): Date {
  const next = new Date(date);
  switch (recurrenceType) {
    case "daily":
      next.setDate(next.getDate() + 1);
      break;
    case "weekly":
      next.setDate(next.getDate() + 7);
      break;
    case "monthly":
      next.setMonth(next.getMonth() + 1);
      break;
    case "yearly":
      next.setFullYear(next.getFullYear() + 1);
      break;
  }
  return next;
}

export const getInternal = internalQuery({
  args: { memoryId: v.id("memories") },
  handler: async (ctx, args) => {
    const memory = await ctx.db.get(args.memoryId);
    if (!memory || !isActiveMemory(memory)) {
      return null;
    }
    return memory;
  },
});

/** Patches the denormalized attachment-text excerpt used for search (see foldAttachmentIntoMemory.ts). */
export const patchAttachmentExcerptInternal = internalMutation({
  args: {
    memoryId: v.id("memories"),
    attachmentExcerpt: v.string(),
  },
  handler: async (ctx, args) => {
    const memory = await ctx.db.get(args.memoryId);
    if (!memory || memory.status !== "active") return;
    await ctx.db.patch(args.memoryId, { attachmentExcerpt: args.attachmentExcerpt });
  },
});

export const listTopicRefsForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const memories = await ctx.db
      .query("memories")
      .withIndex("by_user_status", (q) => q.eq("userId", args.userId).eq("status", "active"))
      .collect();

    return memories.filter(isActiveMemory).map((memory) => ({
      _id: memory._id,
      primaryTopicId: memory.primaryTopicId,
      topicIds: memory.topicIds ?? [],
    }));
  },
});

export const setTopics = internalMutation({
  args: {
    memoryId: v.id("memories"),
    primaryTopicId: v.id("userTopics"),
    topicIds: v.array(v.id("userTopics")),
  },
  handler: async (ctx, args) => {
    const memory = await ctx.db.get(args.memoryId);
    if (!memory || !isActiveMemory(memory)) return;
    const previousTopicIds = Array.from(
      new Set(
        [memory.primaryTopicId, ...(memory.topicIds ?? [])].filter(
          (topicId): topicId is Id<"userTopics"> => topicId !== undefined,
        ),
      ),
    );
    const nextTopicIds = Array.from(new Set([args.primaryTopicId, ...args.topicIds]));
    const samePrimary = memory.primaryTopicId === args.primaryTopicId;
    const sameTopics =
      previousTopicIds.length === nextTopicIds.length &&
      previousTopicIds.every((topicId) => nextTopicIds.includes(topicId));
    if (samePrimary && sameTopics) {
      return;
    }
    await ctx.db.patch(args.memoryId, {
      primaryTopicId: args.primaryTopicId,
      topicIds: nextTopicIds,
    });
    await replaceTopicLinksForMemory(ctx, {
      ...memory,
      primaryTopicId: args.primaryTopicId,
      topicIds: nextTopicIds,
    });
    const previousSet = new Set(previousTopicIds);
    const nextSet = new Set(nextTopicIds);
    const addedTopicIds = nextTopicIds.filter((topicId) => !previousSet.has(topicId));
    const removedTopicIds = previousTopicIds.filter((topicId) => !nextSet.has(topicId));
    if (addedTopicIds.length > 0) {
      await ctx.runMutation(internal.userTopics.incrementTopicCounts, {
        topicIds: addedTopicIds,
      });
    }
    if (removedTopicIds.length > 0) {
      await ctx.runMutation(internal.userTopics.decrementOrArchiveTopics, {
        topicIds: removedTopicIds,
      });
    }
  },
});

export const syncTopicLinksForMemory = internalMutation({
  args: { memoryId: v.id("memories") },
  handler: async (ctx, args) => {
    const memory = await ctx.db.get(args.memoryId);
    if (!memory || !isActiveMemory(memory)) {
      await deleteTopicLinksForMemory(ctx, args.memoryId);
      return;
    }
    await replaceTopicLinksForMemory(ctx, memory);
  },
});

export const listWithoutEmbeddings = internalQuery({
  args: { limit: v.optional(v.float64()) },
  handler: async (ctx, args) => {
    const limit = args.limit ? Math.min(args.limit, 50) : 50;
    const memories = await ctx.db
      .query("memories")
      .withIndex("by_status_embeddingState", (q) =>
        q.eq("status", "active").eq("embeddingState", "missing"),
      )
      .take(limit);

    return memories.map((m) => ({
      _id: m._id,
      userId: m.userId,
      title: m.title,
      content: m.content,
      people: m.people,
      locations: m.locations,
      lifeArea: m.lifeArea,
      entryKind: m.entryKind,
      attachmentExcerpt: m.attachmentExcerpt,
      semanticSummary: m.semanticSummary,
      searchAliases: m.searchAliases,
      searchConcepts: m.searchConcepts,
    }));
  },
});

/**
 * Paginated query for re-embedding all active memories.
 * Returns a batch of memories with metadata needed for enriched embeddings.
 */
export const listForReembedding = internalQuery({
  args: {
    limit: v.optional(v.float64()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const batchSize = args.limit ? Math.min(args.limit, 50) : 25;
    const result = await ctx.db
      .query("memories")
      .withIndex("by_status_embeddingState", (q) => q.eq("status", "active"))
      .order("desc")
      .paginate({
        numItems: batchSize,
        cursor: (args.cursor ?? null) as string | null,
      });

    const batch = result.page.map((m) => ({
      _id: m._id,
      title: m.title,
      content: m.content,
      people: m.people,
      locations: m.locations,
      lifeArea: m.lifeArea,
      entryKind: m.entryKind,
      attachmentExcerpt: m.attachmentExcerpt,
      semanticSummary: m.semanticSummary,
      searchAliases: m.searchAliases,
      searchConcepts: m.searchConcepts,
      retrievalVersion: m.retrievalVersion,
    }));

    return {
      batch,
      hasMore: !result.isDone,
      nextCursor: result.continueCursor,
    };
  },
});

export const countActiveForEmbeddingRebuild = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const memories = await ctx.db
      .query("memories")
      .withIndex("by_user_status", (q) => q.eq("userId", args.userId).eq("status", "active"))
      .take(10_000);
    return memories.length;
  },
});

export const listActiveForEmbeddingRebuild = internalQuery({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.float64()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const batchSize = args.limit ? Math.min(args.limit, 50) : 25;
    const result = await ctx.db
      .query("memories")
      .withIndex("by_user_status", (q) => q.eq("userId", args.userId).eq("status", "active"))
      .paginate({
        numItems: batchSize,
        cursor: (args.cursor ?? null) as string | null,
      });
    return {
      batch: result.page.map((m) => ({
        _id: m._id,
        userId: m.userId,
        title: m.title,
        content: m.content,
        people: m.people,
        locations: m.locations,
        lifeArea: m.lifeArea,
        entryKind: m.entryKind,
        topicIds: m.topicIds ?? [],
        primaryTopicId: m.primaryTopicId,
        embeddingFingerprint: m.embeddingFingerprint,
        embeddingState: m.embeddingState,
        embedding: m.embedding,
      })),
      hasMore: !result.isDone,
      nextCursor: result.continueCursor,
    };
  },
});

// ─── Completed state mutations ─────────────────────────────────────────────

/**
 * Mark a reminder as completed. It will disappear from all active views
 * (same treatment as deleted) but is recoverable from Data → Completed.
 */
export const complete = mutation({
  args: { token: v.string(), id: v.id("memories") },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const memory = await ctx.db.get(args.id);
    if (!memory || memory.userId !== userId) throw new Error("Not found");
    if (memory.status === "completed") return; // already completed

    // Snapshot history
    await ctx.db.insert("memoryHistory", {
      memoryId: args.id,
      userId,
      previousTitle: memory.title ?? "",
      previousContent: memory.content ?? "",
      editedAt: Date.now(),
      changeReason: "completed",
      snapshotJson: serializeMemorySnapshot(memory),
    });

    // Remove review card — completed reminders don't need further review
    const reviewCards = await ctx.db
      .query("reviewCards")
      .withIndex("by_memory", (q) => q.eq("memoryId", args.id))
      .take(10);
    await Promise.all(reviewCards.map((card) => ctx.db.delete(card._id)));

    // Decrement topic counts so the filter bar hides topics with no active memories
    const topicIds = Array.from(
      new Set(
        [memory.primaryTopicId, ...(memory.topicIds ?? [])].filter(
          (id): id is Id<"userTopics"> => id !== undefined,
        ),
      ),
    );
    if (topicIds.length > 0) {
      await ctx.runMutation(internal.userTopics.decrementOrArchiveTopics, {
        topicIds,
      });
    }

    const googleEventIdToDelete = memory.googleEventId;
    const nextMemory = {
      ...memory,
      status: "completed" as const,
      completedAt: Date.now(),
    };
    await ctx.db.patch(args.id, {
      status: nextMemory.status,
      completedAt: nextMemory.completedAt,
      googleEventId: undefined,
      googleSyncStatus: undefined,
      googleSyncMessage: undefined,
      googleSyncUpdatedAt: Date.now(),
      googleSyncLockToken: undefined,
      googleSyncLockAt: undefined,
      googleSyncFingerprint: undefined,
      googleSyncDesiredFingerprint: undefined,
    });
    await applyUserMemoryStatsTransition(ctx, memory, nextMemory);

    // Remove from Google Calendar if it was a reminder
    if (googleEventIdToDelete) {
      await ctx.scheduler.runAfter(0, internal.integrations.deleteGoogleEvent, {
        userId,
        googleEventId: googleEventIdToDelete,
      });
    }
  },
});

/** Restore a completed reminder back to active. */
export const uncomplete = mutation({
  args: { token: v.string(), id: v.id("memories") },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const memory = await ctx.db.get(args.id);
    if (!memory || memory.userId !== userId) throw new Error("Not found");
    if (memory.status !== "completed") return; // not completed

    // Re-increment topic counts now that the memory is active again
    const topicIds = Array.from(
      new Set(
        [memory.primaryTopicId, ...(memory.topicIds ?? [])].filter(
          (id): id is Id<"userTopics"> => id !== undefined,
        ),
      ),
    );
    if (topicIds.length > 0) {
      await ctx.runMutation(internal.userTopics.incrementTopicCounts, {
        topicIds,
      });
    }

    const nextMemory = {
      ...memory,
      status: "active" as const,
      completedAt: undefined,
    };
    await ctx.db.patch(args.id, { status: "active", completedAt: undefined });
    await applyUserMemoryStatsTransition(ctx, memory, nextMemory);

    // Re-sync to Google Calendar if it's a reminder
    if (nextMemory.entryKind === "reminder") {
      const googleIntegration = await getGoogleIntegrationForUser(ctx, userId);
      if (!isCalendarSyncEnabled(googleIntegration)) {
        return;
      }
      await ctx.runMutation(internal.integrations.queueReminderSync, {
        memoryId: nextMemory._id,
        pendingMessage: "Reminder restored. Syncing to Google Calendar...",
      });
    }
  },
});

/** List all completed memories for the Data page. */
export const listCompleted = query({
  args: { token: v.string(), limit: v.optional(v.float64()) },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const take = args.limit ? Math.min(args.limit, 200) : 100;
    return await ctx.db
      .query("memories")
      .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "completed"))
      .order("desc")
      .take(take);
  },
});

/** Permanently wipe all completed memories for the current user. */
export const permanentlyRemoveAllCompleted = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const BATCH = 10;

    const completed = await ctx.db
      .query("memories")
      .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "completed"))
      .take(BATCH);

    for (const memory of completed) {
      await permanentlyDeleteMemory(ctx, memory);
    }

    const hasMore = completed.length === BATCH;
    if (hasMore) {
      await ctx.scheduler.runAfter(0, api.memories.permanentlyRemoveAllCompleted, {
        token: args.token,
      });
    }

    return {
      deletedThisBatch: completed.length,
      scheduledContinuation: hasMore,
    };
  },
});

/** Permanently remove a single completed memory. */
export const permanentlyRemoveCompleted = mutation({
  args: { token: v.string(), id: v.id("memories") },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const memory = await ctx.db.get(args.id);
    if (!memory || memory.userId !== userId) throw new Error("Not found");
    if (memory.status !== "completed") {
      throw new Error("Memory must be in completed state.");
    }
    await permanentlyDeleteMemory(ctx, memory);
  },
});

// ─── Search query cache TTL eviction ─────────────────────────────────────────

const QUERY_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const QUERY_CACHE_PURGE_BATCH = 50;

/**
 * Delete searchQueryCache entries that haven't been used in 30+ days.
 * Runs as a scheduled cron. Processes in bounded batches to stay within
 * Convex mutation transaction limits.
 */
export const purgeStaleQueryCache = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - QUERY_CACHE_TTL_MS;
    const stale = await ctx.db
      .query("searchQueryCache")
      .withIndex("by_last_used_at", (q) => q.lt("lastUsedAt", cutoff))
      .take(QUERY_CACHE_PURGE_BATCH);

    await Promise.all(stale.map((entry) => ctx.db.delete(entry._id)));

    // If a full batch was deleted, schedule another pass immediately
    if (stale.length === QUERY_CACHE_PURGE_BATCH) {
      await ctx.scheduler.runAfter(0, internal.memories.purgeStaleQueryCache, {});
    }
  },
});

export const getQueryCache = internalQuery({
  args: {
    userId: v.id("users"),
    queryHash: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("searchQueryCache")
      .withIndex("by_user_hash", (q) => q.eq("userId", args.userId).eq("queryHash", args.queryHash))
      .first();
  },
});

export const setQueryCache = internalMutation({
  args: {
    userId: v.id("users"),
    queryHash: v.string(),
    expandedQuery: v.optional(v.string()),
    embedding: v.optional(v.array(v.float64())),
    embeddingFingerprint: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("searchQueryCache")
      .withIndex("by_user_hash", (q) => q.eq("userId", args.userId).eq("queryHash", args.queryHash))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        expandedQuery: args.expandedQuery,
        embedding: args.embedding,
        // Only overwrite the stored fingerprint when this write actually
        // carries a fresh embedding — a touch-only write (below) must not
        // blank it out.
        ...(args.embedding !== undefined
          ? { embeddingFingerprint: args.embeddingFingerprint }
          : {}),
        lastUsedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("searchQueryCache", {
        userId: args.userId,
        queryHash: args.queryHash,
        expandedQuery: args.expandedQuery,
        embedding: args.embedding,
        embeddingFingerprint: args.embeddingFingerprint,
        lastUsedAt: Date.now(),
      });
    }
  },
});

export const clearQueryCacheForUser = internalMutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const batch = await ctx.db
      .query("searchQueryCache")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .take(100);
    await Promise.all(batch.map((entry) => ctx.db.delete(entry._id)));
    if (batch.length === 100) {
      await ctx.scheduler.runAfter(0, internal.memories.clearQueryCacheForUser, {
        userId: args.userId,
      });
    }
    return { deleted: batch.length };
  },
});
