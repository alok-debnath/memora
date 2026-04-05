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

/**
 * True when a memory should appear in active/live views.
 */
function isActiveMemory(m: { status: string }): boolean {
  return m.status === "active";
}

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
      .withIndex("by_user_status", (q) =>
        q.eq("userId", userId).eq("status", "active")
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
    const rows = await ctx.db
      .query("memories")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", userId).eq("status", "active")
      )
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
      .withIndex("by_user_status", (q) =>
        q.eq("userId", userId).eq("status", "active")
      )
      .order("desc")
      .take(500);

    return memories.filter(isActiveMemory).filter((m) => {
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
      .withIndex("by_user_status_entryKind", (q) =>
        q.eq("userId", userId).eq("status", "active").eq("entryKind", "reminder")
      )
      .order("desc")
      .take(200);

    return memories
      .filter(isActiveMemory)
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
      .withIndex("by_user_status_entryKind", (q) =>
        q.eq("userId", userId).eq("status", "active").eq("entryKind", "reminder")
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
      .filter(isActiveMemory)
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
      if (!memory || memory.userId !== userId || !isActiveMemory(memory)) continue;
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
      (m): m is Doc<"memories"> => m !== null && m.userId === userId && isActiveMemory(m)
    );
  },
});

/**
 * Noise words to strip from search queries before passing to
 * Convex full-text search or keyword matching.
 * Kept here (query-side only) to avoid a "use node" dependency.
 */
const SEARCH_NOISE_WORDS = new Set([
  "a","an","the","and","or","but","in","on","at","to","for","of","with","by",
  "from","as","is","was","are","were","be","been","being","have","has","had",
  "do","does","did","will","would","could","should","may","might","shall",
  "can","need","it","its","this","that","these","those",
  "he","she","they","we","you","i","me","my","his","her","their","our","your",
  "him","them","us","what","which","who","whom","whose","where","when","why","how",
  "all","both","each","every","no","not","only","own","same","so","than","too",
  "very","just","more","most","other","some","such","then","there",
  // Intent/action words
  "forget","remember","remind","delete","remove","find","search","show","get",
  "tell","give","let","know","please","want","make","put","set","add","create",
  "save","store","note","list","look","see","check","about","any","also",
  "data","everything","anything","info","information","stuff","things","related",
]);

function cleanSearchQuery(raw: string): string {
  const terms = raw
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9']/g, "").trim())
    .filter((t) => t.length > 1 && !SEARCH_NOISE_WORDS.has(t));
  return terms.length > 0 ? terms.join(" ") : raw.trim();
}

function extractSearchTerms(raw: string): string[] {
  return raw
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9']/g, "").trim())
    .filter((t) => t.length > 1 && !SEARCH_NOISE_WORDS.has(t));
}

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

    const [contentResults, titleResults] = await Promise.all([
      ctx.db
        .query("memories")
        .withSearchIndex("search_content", (q) =>
          q.search("content", cleanedQuery).eq("userId", args.userId)
        )
        .take(maxResults),
      ctx.db
        .query("memories")
        .withSearchIndex("search_title", (q) =>
          q.search("title", cleanedQuery).eq("userId", args.userId)
        )
        .take(maxResults),
    ]);

    const seen = new Set<Id<"memories">>();
    const merged: Doc<"memories">[] = [];
    for (const m of [...contentResults, ...titleResults]) {
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

    // Scan recent memories for keyword matches across ALL text fields
    const memories = await ctx.db
      .query("memories")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(200);

    // Fetch user topics for integration
    const userTopics = await ctx.db
      .query("userTopics")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    const topicMap = new Map<Id<"userTopics">, string>();
    for (const t of userTopics) {
      if (!t.isArchived) topicMap.set(t._id, t.name.toLowerCase());
    }

    // Score each memory by proportion of query terms matched
    const scored = memories
      .filter(isActiveMemory)
      .map((m) => {
        const topicNames = (m.topicIds ?? [])
          .map((id) => topicMap.get(id))
          .filter(Boolean);
        const primaryTopic = m.primaryTopicId ? topicMap.get(m.primaryTopicId) : "";
        if (primaryTopic) topicNames.push(primaryTopic);

        const haystack = [
          m.title ?? "",
          m.content ?? "",
          ...(m.people ?? []),
          ...(m.locations ?? []),
          m.lifeArea,
          m.entryKind,
          ...topicNames,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        let matched = 0;
        for (const term of queryTerms) {
          let singular = term;
          if (term.endsWith("ies") && term.length > 4) {
            singular = term.substring(0, term.length - 3) + "y";
          } else if (term.endsWith("s") && term.length > 3) {
            singular = term.substring(0, term.length - 1);
          }
          
          if (haystack.includes(term) || (singular !== term && haystack.includes(singular))) {
            matched++;
          }
        }
        const proportion = matched / queryTerms.length;
        return { memory: m, proportion, matched };
      })
      // Require at least 1 term matched AND ≥40% of terms for multi-term queries
      .filter(({ matched, proportion }) => {
        if (queryTerms.length === 1) return matched >= 1;
        return proportion >= 0.4;
      })
      .sort((a, b) => b.proportion - a.proportion || b.matched - a.matched);

    return scored.slice(0, maxResults).map((s) => s.memory);
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
    return args.includeDeleted ? rows : rows.filter(isActiveMemory);
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
      importance: args.importance,
      lifeArea: args.lifeArea,
      contextTags: args.contextTags,
      sentimentScore: args.sentimentScore,
      linkedUrls: args.linkedUrls ?? [],
      extractedActions: args.extractedActions,
      entryKind: scheduling.entryKind,
      schedule: scheduling.schedule,
      capsuleUnlockDate: args.capsuleUnlockDate,
      status: "active",
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
    if (!memory || memory.userId !== userId || !isActiveMemory(memory)) throw new Error("Not found");

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
    // List for update/delete guards — check by status
    const memory = await ctx.db.get(args.id);
    if (!memory || memory.userId !== userId) throw new Error("Not found");
    if (memory.status === "deleted" || memory.status === "completed") return; // already inactive
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
    // Soft-delete via status field
    await ctx.db.patch(args.id, { status: "deleted", deletedAt: Date.now() });
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
      await ctx.db.patch(id, { status: "deleted", deletedAt: Date.now() });
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
      .withIndex("by_user_status", (q) =>
        q.eq("userId", userId).eq("status", "deleted")
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
    if (memory.status !== "deleted") return; // not deleted

    // Restore flag
    await ctx.db.patch(args.id, { status: "active", deletedAt: undefined });

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
      .withIndex("by_user_status", (q) =>
        q.eq("userId", userId).eq("status", "deleted")
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
    if (!memory || memory.userId !== userId || !isActiveMemory(memory)) {
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
    if (!memory || !memory.isPublic || !isActiveMemory(memory)) return null;
    return memory;
  },
});

export const generateShareToken = mutation({
  args: { token: v.string(), id: v.id("memories") },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const memory = await ctx.db.get(args.id);
    if (!memory || memory.userId !== userId || !isActiveMemory(memory)) throw new Error("Not found");
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
      .withIndex("by_user_status", (q) =>
        q.eq("userId", userId).eq("status", "active")
      )
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
    const memories = await ctx.db
      .query("memories")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", userId).eq("status", "active")
      )
      .take(1000);

    const topicCounts: Record<string, number> = {};
    let reminderCount = 0;
    let recurringCount = 0;
    let memoryOnlyCount = 0;

    // Collect creation days in a Set for O(n) streak calculation
    const dayMs = 24 * 60 * 60 * 1000;
    const creationDays = new Set<number>();

    for (const m of memories.filter(isActiveMemory)) {
      if (m.primaryTopicId) {
        topicCounts[m.primaryTopicId] = (topicCounts[m.primaryTopicId] ?? 0) + 1;
      }
      if (isReminder(m)) {
        reminderCount++;
      } else {
        memoryOnlyCount++;
      }
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
      totalMemories: memoryOnlyCount,
      totalReminders: reminderCount,
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
      if (!isActiveMemory(memory)) continue;
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
    if (!memory || !isActiveMemory(memory)) {
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
      .withIndex("by_user_status", (q) =>
        q.eq("userId", args.userId).eq("status", "active")
      )
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
      .order("desc")
      .take(500);

    return memories
      .filter((m) => isActiveMemory(m) && (!m.embedding || m.embedding.length === 0))
      .slice(0, limit)
      .map((m) => ({
        _id: m._id,
        title: m.title,
        content: m.content,
        people: m.people,
        locations: m.locations,
        lifeArea: m.lifeArea,
        entryKind: m.entryKind,
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
      .order("desc")
      .paginate({
        numItems: batchSize,
        cursor: (args.cursor ?? null) as string | null,
      });

    const batch = result.page
      .filter(isActiveMemory)
      .map((m) => ({
        _id: m._id,
        title: m.title,
        content: m.content,
        people: m.people,
        locations: m.locations,
        lifeArea: m.lifeArea,
        entryKind: m.entryKind,
      }));

    return {
      batch,
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
    for (const card of reviewCards) {
      await ctx.db.delete(card._id);
    }

    // Decrement topic counts so the filter bar hides topics with no active memories
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

    await ctx.db.patch(args.id, { status: "completed", completedAt: Date.now() });
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
          (id): id is Id<"userTopics"> => id !== undefined
        )
      )
    );
    if (topicIds.length > 0) {
      await ctx.runMutation(internal.userTopics.incrementTopicCounts, {
        topicIds,
      });
    }

    await ctx.db.patch(args.id, { status: "active", completedAt: undefined });
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
      .withIndex("by_user_status", (q) =>
        q.eq("userId", userId).eq("status", "completed")
      )
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
      .withIndex("by_user_status", (q) =>
        q.eq("userId", userId).eq("status", "completed")
      )
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

    return { deletedThisBatch: completed.length, scheduledContinuation: hasMore };
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
