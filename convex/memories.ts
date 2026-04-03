import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  MutationCtx,
} from "./_generated/server";
import { api, internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { resolveUser } from "./lib/withAuth";
import { serializeMemorySnapshot } from "./lib/memorySnapshot";
import {
  moodValidator,
  importanceValidator,
  lifeAreaValidator,
  recurrenceValidator,
  memoryEntryKindValidator,
  memoryScheduleValidator,
  extractedActionsValidator,
  contextTagsValidator,
  encryptedEnvelopeValidator,
} from "./lib/validators";
import {
  getMemorySchedule,
  getReminderDate,
  inferEntryKind,
  isReminder,
  toStoredMemoryFields,
} from "./lib/memoryKind";

async function replaceTopicLinksForMemory(
  ctx: MutationCtx,
  memory: Doc<"memories">
) {
  const existingLinks = await ctx.db
    .query("memoryTopicLinks")
    .withIndex("by_memory", (q) => q.eq("memoryId", memory._id))
    .take(10);
  for (const link of existingLinks) {
    await ctx.db.delete(link._id);
  }

  const uniqueTopicIds = Array.from(
    new Set(
      [memory.primaryTopicId, ...(memory.topicIds ?? [])].filter(
        (topicId): topicId is Id<"userTopics"> => topicId !== undefined
      )
    )
  );

  for (const topicId of uniqueTopicIds) {
    await ctx.db.insert("memoryTopicLinks", {
      userId: memory.userId,
      memoryId: memory._id,
      topicId,
      isPrimary: memory.primaryTopicId === topicId,
      assignedAt: memory._creationTime,
    });
  }
}

async function deleteTopicLinksForMemory(
  ctx: MutationCtx,
  memoryId: Id<"memories">
) {
  const batchSize = 50;
  while (true) {
    const existingLinks = await ctx.db
      .query("memoryTopicLinks")
      .withIndex("by_memory", (q) => q.eq("memoryId", memoryId))
      .take(batchSize);
    for (const link of existingLinks) {
      await ctx.db.delete(link._id);
    }
    if (existingLinks.length < batchSize) break;
  }
}

const RELATED_DELETE_BATCH = 200;

async function deleteMemoryRelatedData(
  ctx: MutationCtx,
  memoryId: Id<"memories">
) {
  while (true) {
    const attachments = await ctx.db
      .query("memoryAttachments")
      .withIndex("by_memory", (q) => q.eq("memoryId", memoryId))
      .take(RELATED_DELETE_BATCH);
    for (const doc of attachments) {
      await ctx.db.delete(doc._id);
    }
    if (attachments.length < RELATED_DELETE_BATCH) break;
  }

  while (true) {
    const historyItems = await ctx.db
      .query("memoryHistory")
      .withIndex("by_memory", (q) => q.eq("memoryId", memoryId))
      .take(RELATED_DELETE_BATCH);
    for (const doc of historyItems) {
      await ctx.db.delete(doc._id);
    }
    if (historyItems.length < RELATED_DELETE_BATCH) break;
  }

  while (true) {
    const reviewCards = await ctx.db
      .query("reviewCards")
      .withIndex("by_memory", (q) => q.eq("memoryId", memoryId))
      .take(RELATED_DELETE_BATCH);
    for (const doc of reviewCards) {
      await ctx.db.delete(doc._id);
    }
    if (reviewCards.length < RELATED_DELETE_BATCH) break;
  }

  while (true) {
    const sharedMemories = await ctx.db
      .query("sharedMemories")
      .withIndex("by_memory", (q) => q.eq("memoryId", memoryId))
      .take(RELATED_DELETE_BATCH);
    for (const doc of sharedMemories) {
      await ctx.db.delete(doc._id);
    }
    if (sharedMemories.length < RELATED_DELETE_BATCH) break;
  }

  await deleteTopicLinksForMemory(ctx, memoryId);
}

async function permanentlyDeleteMemory(
  ctx: MutationCtx,
  memory: Doc<"memories">
) {
  await deleteMemoryRelatedData(ctx, memory._id);
  await ctx.db.delete(memory._id);
}

function hasSchedulingInput(value: {
  entryKind?: "memory" | "reminder" | null;
  schedule?: unknown;
}) {
  return (
    value.entryKind !== undefined ||
    value.schedule !== undefined
  );
}

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
      .withIndex("by_user_isDeleted", (q) =>
        q.eq("userId", userId).eq("isDeleted", false)
      )
      .order("desc")
      .paginate({ numItems: pageSize, cursor: (args.cursor ?? null) as string | null });
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
    return await ctx.db
      .query("memories")
      .withIndex("by_user_isDeleted", (q) =>
        q.eq("userId", userId).eq("isDeleted", false)
      )
      .order("desc")
      .take(take);
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
      .withIndex("by_user_isDeleted", (q) =>
        q.eq("userId", userId).eq("isDeleted", false)
      )
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
      .withIndex("by_user_isDeleted_entryKind", (q) =>
        q.eq("userId", userId).eq("isDeleted", false).eq("entryKind", "reminder")
      )
      .order("desc")
      .take(200);

    return memories
      .filter((memory) => {
        const dueAt = getReminderDate(memory);
        return isReminder(memory) && !!dueAt && dueAt <= now;
      })
      .sort((a, b) => {
        const aDue = getReminderDate(a) ?? "";
        const bDue = getReminderDate(b) ?? "";
        return bDue.localeCompare(aDue);
      })
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

    const memories = await ctx.db
      .query("memories")
      .withIndex("by_user_isDeleted_entryKind", (q) =>
        q.eq("userId", userId).eq("isDeleted", false).eq("entryKind", "reminder")
      )
      .order("desc")
      .take(300);

    if (range === "all") {
      return memories
        .filter((memory) => {
          const dueAt = getReminderDate(memory);
          return isReminder(memory) && !!dueAt && dueAt >= nowIso;
        })
        .sort((a, b) => (getReminderDate(a) ?? "").localeCompare(getReminderDate(b) ?? ""))
        .slice(0, 50);
    }

    const endIso = new Date(now.getTime() + rangeMs[range]).toISOString();

    return memories
      .filter((memory) => {
        const dueAt = getReminderDate(memory);
        return isReminder(memory) && !!dueAt && dueAt >= nowIso && dueAt <= endIso;
      })
      .sort((a, b) => (getReminderDate(a) ?? "").localeCompare(getReminderDate(b) ?? ""))
      .slice(0, 50);
  },
});

export const get = query({
  args: { token: v.string(), id: v.id("memories") },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const memory = await ctx.db.get(args.id);
    if (!memory || memory.userId !== userId || memory.isDeleted) return null;
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
      .withIndex("by_user_and_topic", (q) =>
        q.eq("userId", userId).eq("topicId", args.topicId)
      )
      .order("desc")
      .take(Math.max(take * 3, 30));

    const seen = new Set<Id<"memories">>();
    const memories: Doc<"memories">[] = [];
    for (const link of links) {
      if (seen.has(link.memoryId)) continue;
      const memory = await ctx.db.get(link.memoryId);
      if (!memory || memory.userId !== userId || memory.isDeleted) continue;
      seen.add(memory._id);
      memories.push(memory);
    }

    return memories
      .sort((a, b) => b._creationTime - a._creationTime)
      .slice(0, take);
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
      (m): m is Doc<"memories"> => m !== null && m.userId === userId && !m.isDeleted
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
      if (!seen.has(m._id) && !m.isDeleted) {
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
        !m.isDeleted &&
        ((m.people ?? []).some((person) => person.toLowerCase().includes(queryLower)) ||
        (m.locations ?? []).some((loc) => loc.toLowerCase().includes(queryLower)))
    ).slice(0, maxResults);
  },
});

export const listForAI = internalQuery({
  args: {
    userId: v.id("users"),
    primaryTopicId: v.optional(v.id("userTopics")),
    limit: v.optional(v.float64()),
    includeDeleted: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const take = args.limit ? Math.min(args.limit, 100) : 20;
    let rows: Doc<"memories">[];
    if (args.primaryTopicId) {
      rows = await ctx.db
        .query("memories")
        .withIndex("by_user_primaryTopic", (q) =>
          q.eq("userId", args.userId).eq("primaryTopicId", args.primaryTopicId!)
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
    return args.includeDeleted ? rows : rows.filter((m) => !m.isDeleted);
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
    entryKind: v.optional(memoryEntryKindValidator),
    schedule: v.optional(memoryScheduleValidator),
    capsuleUnlockDate: v.optional(v.string()),
    skipAiProcessing: v.optional(v.boolean()),
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
      entryKind: scheduling.entryKind,
      schedule: scheduling.schedule,
      capsuleUnlockDate: args.capsuleUnlockDate,
      isDeleted: false,
    });

    if (!args.skipAiProcessing) {
      await ctx.scheduler.runAfter(0, api.actions.processMemory.processMemory, {
        memoryId,
        title: args.title ?? "",
        content: args.content ?? "",
        userTimezone: user.timezone,
        currentTime: new Date().toISOString(),
      });
    }

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
    entryKind: v.optional(v.union(memoryEntryKindValidator, v.null())),
    schedule: v.optional(v.union(memoryScheduleValidator, v.null())),
    capsuleUnlockDate: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx, args.token);
    const userId = user.userId;
    const memory = await ctx.db.get(args.id);
    if (!memory || memory.userId !== userId || memory.isDeleted) throw new Error("Not found");

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
    if (hasSchedulingInput(args)) {
      const scheduling = toStoredMemoryFields({
        entryKind: args.entryKind === null ? undefined : args.entryKind,
        schedule: args.schedule === null ? undefined : args.schedule,
      });
      if (scheduling.entryKind === "reminder" && !scheduling.schedule?.dueAt) {
        throw new Error("Reminders require a due date.");
      }
      Object.assign(patch, scheduling);
    }
    await ctx.db.patch(args.id, patch);

    if (args.title !== undefined || args.content !== undefined) {
      await ctx.scheduler.runAfter(0, api.actions.processMemory.processMemory, {
        memoryId: args.id,
        title: args.title ?? memory.title ?? "",
        content: args.content ?? memory.content ?? "",
        userTimezone: user.timezone,
        currentTime: new Date().toISOString(),
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
    if (memory.isDeleted) return; // already soft-deleted
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
    const topicIds = Array.from(
      new Set(
        [memory.primaryTopicId, ...(memory.topicIds ?? [])].filter(
          (id): id is Id<"userTopics"> => id !== undefined
        )
      )
    );
    if (topicIds.length > 0) {
      await ctx.runMutation(internal.userTopics.decrementOrArchiveTopics, {
        topicIds,
      });
    }
    // Soft-delete: mark as deleted instead of removing from DB
    await ctx.db.patch(args.id, { deletedAt: Date.now(), isDeleted: true });
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
      if (!memory || memory.userId !== userId || memory.isDeleted) {
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

      const topicIds = Array.from(
        new Set(
          [memory.primaryTopicId, ...(memory.topicIds ?? [])].filter(
            (topicId): topicId is Id<"userTopics"> => topicId !== undefined
          )
        )
      );
      if (topicIds.length > 0) {
        await ctx.runMutation(internal.userTopics.decrementOrArchiveTopics, {
          topicIds,
        });
      }

      // Soft-delete
      await ctx.db.patch(id, { deletedAt: Date.now(), isDeleted: true });
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
      .withIndex("by_user_isDeleted", (q) =>
        q.eq("userId", userId).eq("isDeleted", true)
      )
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
    if (!memory.isDeleted) return; // not deleted

    // Clear soft-delete flag
    await ctx.db.patch(args.id, { deletedAt: undefined, isDeleted: false });

    // Re-increment topic counts
    const topicIds = Array.from(
      new Set(
        [memory.primaryTopicId, ...(memory.topicIds ?? [])].filter(
          (id): id is Id<"userTopics"> => id !== undefined
        )
      )
    );
    if (topicIds.length > 0) {
      await ctx.runMutation(internal.userTopics.incrementTopicCounts, {
        topicIds,
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
    if (!memory.isDeleted) {
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
      .withIndex("by_user_isDeleted", (q) =>
        q.eq("userId", userId).eq("isDeleted", true)
      )
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

    const memoryAttachmentBatch = await ctx.db
      .query("memoryAttachments")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(BATCH);
    for (const doc of memoryAttachmentBatch) {
      await ctx.db.delete(doc._id);
      deleted += 1;
    }

    const memoryHistoryBatch = await ctx.db
      .query("memoryHistory")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(BATCH);
    for (const doc of memoryHistoryBatch) {
      await ctx.db.delete(doc._id);
      deleted += 1;
    }

    const reviewCardBatch = await ctx.db
      .query("reviewCards")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(BATCH);
    for (const doc of reviewCardBatch) {
      await ctx.db.delete(doc._id);
      deleted += 1;
    }

    const sharedBatch = await ctx.db
      .query("sharedMemories")
      .withIndex("by_user", (q) => q.eq("sharedByUserId", userId))
      .take(BATCH);
    for (const doc of sharedBatch) {
      await ctx.db.delete(doc._id);
      deleted += 1;
    }

    const topicLinkBatch = await ctx.db
      .query("memoryTopicLinks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(BATCH);
    for (const doc of topicLinkBatch) {
      await ctx.db.delete(doc._id);
      deleted += 1;
    }

    const memoryBatch = await ctx.db
      .query("memories")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(BATCH);
    for (const doc of memoryBatch) {
      await ctx.db.delete(doc._id);
      deleted += 1;
    }

    const topicBatch = await ctx.db
      .query("userTopics")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(BATCH);
    for (const doc of topicBatch) {
      await ctx.db.delete(doc._id);
      deleted += 1;
    }

    const hasMore =
      memoryAttachmentBatch.length === BATCH ||
      memoryHistoryBatch.length === BATCH ||
      reviewCardBatch.length === BATCH ||
      sharedBatch.length === BATCH ||
      topicLinkBatch.length === BATCH ||
      memoryBatch.length === BATCH ||
      topicBatch.length === BATCH;

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
    if (!memory || memory.userId !== userId || memory.isDeleted) {
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
    if (!memory || !memory.isPublic || memory.isDeleted) return null;
    return memory;
  },
});

export const generateShareToken = mutation({
  args: { token: v.string(), id: v.id("memories") },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const memory = await ctx.db.get(args.id);
    if (!memory || memory.userId !== userId || memory.isDeleted) throw new Error("Not found");
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
      .withIndex("by_user_isDeleted", (q) =>
        q.eq("userId", userId).eq("isDeleted", false)
      )
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
      .withIndex("by_user_isDeleted", (q) =>
        q.eq("userId", userId).eq("isDeleted", false)
      )
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
      if (isReminder(m)) reminderCount++;
      if (getMemorySchedule(m)?.isRecurring) recurringCount++;
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
      if (memory.isDeleted) continue;
      if (
        inferEntryKind(memory) !== "reminder"
      ) {
        continue;
      }

      const schedule = getMemorySchedule(memory);
      if (
        !schedule?.isRecurring ||
        !schedule.recurrenceType ||
        !schedule.dueAt ||
        schedule.dueAt > nowIso
      ) {
        continue;
      }

      let date = advanceDate(new Date(schedule.dueAt), schedule.recurrenceType);
      while (date <= now) {
        date = advanceDate(date, schedule.recurrenceType);
      }

      await ctx.db.patch(
        memory._id,
        toStoredMemoryFields({
          entryKind: "reminder",
          schedule: {
            dueAt: date.toISOString(),
            isRecurring: true,
            recurrenceType: schedule.recurrenceType,
          },
        })
      );
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
    const memory = await ctx.db.get(args.memoryId);
    if (!memory || memory.isDeleted) {
      return null;
    }
    return memory;
  },
});

export const listTopicRefsForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const memories = await ctx.db
      .query("memories")
      .withIndex("by_user_isDeleted", (q) =>
        q.eq("userId", args.userId).eq("isDeleted", false)
      )
      .collect();

    return memories.map((memory) => ({
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
    if (!memory || memory.isDeleted) return;
    const previousTopicIds = Array.from(
      new Set(
        [memory.primaryTopicId, ...(memory.topicIds ?? [])].filter(
          (topicId): topicId is Id<"userTopics"> => topicId !== undefined
        )
      )
    );
    const nextTopicIds = Array.from(
      new Set([args.primaryTopicId, ...args.topicIds])
    );
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
    if (!memory || memory.isDeleted) {
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
      .order("desc")
      .take(500);

    return memories
      .filter((m) => !m.isDeleted && (!m.embedding || m.embedding.length === 0))
      .slice(0, limit)
      .map((m) => ({
        _id: m._id,
        title: m.title,
        content: m.content,
      }));
  },
});
