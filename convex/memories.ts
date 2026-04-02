import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { resolveUser } from "./lib/withAuth";
import { serializeMemorySnapshot } from "./lib/memorySnapshot";
import {
  moodValidator,
  importanceValidator,
  lifeAreaValidator,
  recurrenceValidator,
  extractedActionsValidator,
  contextTagsValidator,
  encryptedEnvelopeValidator,
} from "./lib/validators";

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
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .paginate({ numItems: pageSize, cursor: (args.cursor ?? null) as string | null });
    return {
      memories: result.page,
      nextCursor: result.continueCursor,
      isDone: result.isDone,
    };
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
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(500);

    return memories.filter((m) => {
      if (m._creationTime > cutoff) return false;
      const created = new Date(m._creationTime);
      const diffDays = Math.abs(
        (created.getMonth() - todayMonth) * 30 + (created.getDate() - todayDay)
      );
      return diffDays <= 3 || diffDays >= 362;
    }).slice(0, 5);
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

    const memories = await ctx.db
      .query("memories")
      .withIndex("by_user_reminderDate", (q) =>
        q.eq("userId", userId).lte("reminderDate", now)
      )
      .order("desc")
      .take(40);

    return memories
      .filter((memory) => !!memory.reminderDate && memory.reminderDate <= now)
      .slice(0, 20);
  },
});

export const upcomingReminders = query({
  args: {
    token: v.string(),
    asOf: v.optional(v.string()),
    range: v.optional(v.union(v.literal("week"), v.literal("month"), v.literal("year"), v.literal("all"))),
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
      const memories = await ctx.db
        .query("memories")
        .withIndex("by_user_reminderDate", (q) =>
          q.eq("userId", userId).gte("reminderDate", nowIso)
        )
        .order("asc")
        .take(100);
      return memories.filter((m) => !!m.reminderDate && m.reminderDate >= nowIso).slice(0, 50);
    }

    const endIso = new Date(now.getTime() + rangeMs[range]).toISOString();

    const memories = await ctx.db
      .query("memories")
      .withIndex("by_user_reminderDate", (q) =>
        q.eq("userId", userId)
          .gte("reminderDate", nowIso)
          .lte("reminderDate", endIso)
      )
      .order("asc")
      .take(100);

    return memories
      .filter(
        (memory) =>
          !!memory.reminderDate &&
          memory.reminderDate >= nowIso &&
          memory.reminderDate <= endIso
      )
      .slice(0, 50);
  },
});

export const get = query({
  args: { token: v.string(), id: v.id("memories") },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const memory = await ctx.db.get(args.id);
    if (!memory || memory.userId !== userId) return null;
    return memory;
  },
});

export const listByIds = query({
  args: {
    token: v.string(),
    ids: v.array(v.id("memories")),
  },
  handler: async (ctx, args): Promise<Doc<"memories">[]> => {
    const { userId } = await resolveUser(ctx, args.token);
    const results = await Promise.all(args.ids.map((id) => ctx.db.get(id)));
    return results.filter(
      (m): m is Doc<"memories"> => m !== null && m.userId === userId
    );
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
    const [contentResults, titleResults] = await Promise.all([
      ctx.db
        .query("memories")
        .withSearchIndex("search_content", (q) =>
          q.search("content", args.query).eq("userId", args.userId)
        )
        .take(maxResults),
      ctx.db
        .query("memories")
        .withSearchIndex("search_title", (q) =>
          q.search("title", args.query).eq("userId", args.userId)
        )
        .take(maxResults),
    ]);

    const seen = new Set<Id<"memories">>();
    const merged: Doc<"memories">[] = [];
    for (const m of [...contentResults, ...titleResults]) {
      if (!seen.has(m._id)) {
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
    const maxResults = args.limit ? Math.min(args.limit, 20) : 10;
    const queryLower = args.query.toLowerCase();
    const memories = await ctx.db
      .query("memories")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(100);

    return memories.filter(
      (m) =>
        (m.people ?? []).some((person) => person.toLowerCase().includes(queryLower)) ||
        (m.locations ?? []).some((loc) => loc.toLowerCase().includes(queryLower))
    ).slice(0, maxResults);
  },
});

export const listForAI = internalQuery({
  args: {
    userId: v.id("users"),
    primaryTopicId: v.optional(v.id("userTopics")),
    limit: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const take = args.limit ? Math.min(args.limit, 100) : 20;
    if (args.primaryTopicId) {
      return ctx.db
        .query("memories")
        .withIndex("by_user_primaryTopic", (q) =>
          q.eq("userId", args.userId).eq("primaryTopicId", args.primaryTopicId!)
        )
        .order("desc")
        .take(take);
    }
    return ctx.db
      .query("memories")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(take);
  },
});

export const create = mutation({
  args: {
    token: v.string(),
    // Plaintext fields (legacy, optional)
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    people: v.optional(v.array(v.string())),
    locations: v.optional(v.array(v.string())),
    // Encrypted fields
    encryptedTitle: v.optional(encryptedEnvelopeValidator),
    encryptedContent: v.optional(encryptedEnvelopeValidator),
    encryptedPeople: v.optional(encryptedEnvelopeValidator),
    encryptedLocations: v.optional(encryptedEnvelopeValidator),
    titleBlindIndex: v.optional(v.string()),
    // Other fields
    mood: v.optional(moodValidator),
    importance: importanceValidator,
    lifeArea: v.optional(lifeAreaValidator),
    contextTags: v.optional(contextTagsValidator),
    sentimentScore: v.optional(v.float64()),
    linkedUrls: v.optional(v.array(v.string())),
    extractedActions: v.optional(extractedActionsValidator),
    reminderDate: v.optional(v.string()),
    isRecurring: v.optional(v.boolean()),
    recurrenceType: v.optional(recurrenceValidator),
    capsuleUnlockDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx, args.token);
    const userId = user.userId;
    const memoryId = await ctx.db.insert("memories", {
      userId,
      // Plaintext fields (optional)
      title: args.title,
      content: args.content,
      people: args.people,
      locations: args.locations,
      // Encrypted fields
      encryptedTitle: args.encryptedTitle,
      encryptedContent: args.encryptedContent,
      encryptedPeople: args.encryptedPeople,
      encryptedLocations: args.encryptedLocations,
      titleBlindIndex: args.titleBlindIndex,
      // Other fields
      mood: args.mood,
      importance: args.importance,
      lifeArea: args.lifeArea,
      contextTags: args.contextTags,
      sentimentScore: args.sentimentScore,
      linkedUrls: args.linkedUrls ?? [],
      extractedActions: args.extractedActions,
      reminderDate: args.reminderDate,
      isRecurring: args.isRecurring ?? false,
      recurrenceType: args.recurrenceType,
      capsuleUnlockDate: args.capsuleUnlockDate,
    });

    await ctx.scheduler.runAfter(0, api.actions.processMemory.processMemory, {
      memoryId,
      title: args.title ?? "",
      content: args.content ?? "",
      userTimezone: user.timezone,
    });

    return memoryId;
  },
});

export const update = mutation({
  args: {
    token: v.string(),
    id: v.id("memories"),
    // Plaintext fields (legacy, optional)
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    people: v.optional(v.array(v.string())),
    locations: v.optional(v.array(v.string())),
    // Encrypted fields
    encryptedTitle: v.optional(encryptedEnvelopeValidator),
    encryptedContent: v.optional(encryptedEnvelopeValidator),
    encryptedPeople: v.optional(encryptedEnvelopeValidator),
    encryptedLocations: v.optional(encryptedEnvelopeValidator),
    titleBlindIndex: v.optional(v.string()),
    // Other fields
    mood: v.optional(v.union(moodValidator, v.null())),
    importance: v.optional(importanceValidator),
    lifeArea: v.optional(v.union(lifeAreaValidator, v.null())),
    contextTags: v.optional(v.union(contextTagsValidator, v.null())),
    sentimentScore: v.optional(v.union(v.float64(), v.null())),
    linkedUrls: v.optional(v.array(v.string())),
    extractedActions: v.optional(extractedActionsValidator),
    reminderDate: v.optional(v.union(v.string(), v.null())),
    isRecurring: v.optional(v.boolean()),
    recurrenceType: v.optional(v.union(recurrenceValidator, v.null())),
    capsuleUnlockDate: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx, args.token);
    const userId = user.userId;
    const memory = await ctx.db.get(args.id);
    if (!memory || memory.userId !== userId) throw new Error("Not found");

    // Save history snapshot before modifying
    await ctx.db.insert("memoryHistory", {
      memoryId: args.id,
      userId,
      previousTitle: memory.title ?? "",
      previousContent: memory.content ?? "",
      editedAt: Date.now(),
      snapshotJson: serializeMemorySnapshot(memory),
    });

    // Build patch object — only include defined, non-null fields
    const { id, token, ...updates } = args;
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        patch[key] = value === null ? undefined : value;
      }
    }
    await ctx.db.patch(args.id, patch);

    if (args.title !== undefined || args.content !== undefined) {
      await ctx.scheduler.runAfter(0, api.actions.processMemory.processMemory, {
        memoryId: args.id,
        title: args.title ?? memory.title ?? "",
        content: args.content ?? memory.content ?? "",
        userTimezone: user.timezone,
      });
    }
  },
});

export const remove = mutation({
  args: { token: v.string(), id: v.id("memories") },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const memory = await ctx.db.get(args.id);
    if (!memory || memory.userId !== userId) throw new Error("Not found");
    await ctx.db.insert("memoryHistory", {
      memoryId: args.id,
      userId,
      previousTitle: memory.title,
      previousContent: memory.content,
      editedAt: Date.now(),
      changeReason: "deleted",
      snapshotJson: serializeMemorySnapshot(memory),
    });
    // Clean up review cards (bounded — a memory should have at most 1 card)
    const reviewCards = await ctx.db
      .query("reviewCards")
      .withIndex("by_memory", (q) => q.eq("memoryId", args.id))
      .take(10);
    for (const card of reviewCards) {
      await ctx.db.delete(card._id);
    }
    await ctx.db.delete(args.id);
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
      if (!memory || memory.userId !== userId) {
        continue;
      }

      await ctx.db.insert("memoryHistory", {
        memoryId: id,
        userId,
        previousTitle: memory.title,
        previousContent: memory.content,
        editedAt: Date.now(),
        changeReason: "deleted",
        snapshotJson: serializeMemorySnapshot(memory),
      });

      const reviewCards = await ctx.db
        .query("reviewCards")
        .withIndex("by_memory", (q) => q.eq("memoryId", id))
        .take(10);
      for (const card of reviewCards) {
        await ctx.db.delete(card._id);
      }

      await ctx.db.delete(id);
      deleted += 1;
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

export const attachFile = mutation({
  args: {
    token: v.string(),
    memoryId: v.id("memories"),
    url: v.string(),
    filename: v.string(),
    mimeType: v.string(),
    sizeBytes: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const memory = await ctx.db.get(args.memoryId);
    if (!memory || memory.userId !== userId) {
      throw new Error("Memory not found");
    }

    const mimeType = args.mimeType.trim().toLowerCase();
    const type = mimeType.startsWith("image/")
      ? "image"
      : mimeType.startsWith("audio/")
        ? "audio"
        : mimeType === "text/uri-list" || args.url.startsWith("http")
          ? "link"
          : "document";

    return await ctx.db.insert("memoryAttachments", {
      memoryId: args.memoryId,
      userId,
      type,
      url: args.url,
      filename: args.filename.trim() || "Attachment",
      mimeType: args.mimeType,
      sizeBytes: args.sizeBytes,
    });
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
    if (!memory || !memory.isPublic) return null;
    return memory;
  },
});

export const generateShareToken = mutation({
  args: { token: v.string(), id: v.id("memories") },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const memory = await ctx.db.get(args.id);
    if (!memory || memory.userId !== userId) throw new Error("Not found");
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const shareToken = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
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
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(5000);
    return memories.map((m) => ({
      title: m.title,
      content: m.content,
      mood: m.mood,
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
    const memories = await ctx.db
      .query("memories")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(1000);

    const moodCounts: Record<string, number> = {};
    const topicCounts: Record<string, number> = {};
    let reminderCount = 0;
    let recurringCount = 0;

    // Collect creation days in a Set for O(n) streak calculation
    const dayMs = 24 * 60 * 60 * 1000;
    const creationDays = new Set<number>();

    for (const m of memories) {
      if (m.mood) {
        moodCounts[m.mood] = (moodCounts[m.mood] ?? 0) + 1;
      }
      if (m.primaryTopicId) {
        topicCounts[m.primaryTopicId] = (topicCounts[m.primaryTopicId] ?? 0) + 1;
      }
      if (m.reminderDate) reminderCount++;
      if (m.isRecurring) recurringCount++;
      creationDays.add(Math.floor(m._creationTime / dayMs));
    }

    const weekAgo = nowMs - 7 * dayMs;
    const recentCount = memories.reduce(
      (count, memory) => count + (memory._creationTime >= weekAgo ? 1 : 0),
      0
    );

    // O(streak) streak calculation using Set lookups
    const todayDayNum = Math.floor(nowMs / dayMs);
    let streakDays = 0;
    for (let d = 0; d < 365; d++) {
      if (creationDays.has(todayDayNum - d)) {
        streakDays++;
      } else if (d > 0) {
        break;
      }
    }

    return {
      totalMemories: memories.length,
      totalReminders: reminderCount,
      moodCounts,
      topicCounts,
      recurringCount,
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
      .take(500);

    let advanced = 0;
    for (const memory of batch) {
      if (
        !memory.isRecurring ||
        !memory.recurrenceType ||
        !memory.reminderDate ||
        memory.reminderDate > nowIso
      ) {
        continue;
      }

      let date = advanceDate(new Date(memory.reminderDate), memory.recurrenceType);
      while (date <= now) {
        date = advanceDate(date, memory.recurrenceType);
      }

      await ctx.db.patch(memory._id, {
        reminderDate: date.toISOString(),
      });
      advanced++;
    }

    return { advanced };
  },
});

function advanceDate(
  date: Date,
  recurrenceType: "daily" | "weekly" | "monthly" | "yearly"
): Date {
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
    return ctx.db.get(args.memoryId);
  },
});

export const setTopics = internalMutation({
  args: {
    memoryId: v.id("memories"),
    primaryTopicId: v.id("userTopics"),
    topicIds: v.array(v.id("userTopics")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.memoryId, {
      primaryTopicId: args.primaryTopicId,
      topicIds: args.topicIds,
    });
  },
});

export const listWithoutEmbeddings = internalQuery({
  args: { limit: v.optional(v.float64()) },
  handler: async (ctx, args) => {
    const limit = args.limit ? Math.min(args.limit, 50) : 50;
    const memories = await ctx.db
      .query("memories")
      .order("desc")
      .take(500);

    return memories
      .filter((m) => !m.embedding || m.embedding.length === 0)
      .slice(0, limit)
      .map((m) => ({
        _id: m._id,
        title: m.title,
        content: m.content,
      }));
  },
});
