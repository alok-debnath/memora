import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { resolveUser } from "./lib/withAuth";

function normalizeTopicSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/['’]s\b/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .split("-")
    .filter(Boolean)
    .map((segment) => {
      if (segment.length > 3 && segment.endsWith("ies")) {
        return `${segment.slice(0, -3)}y`;
      }
      if (segment.length > 3 && segment.endsWith("s") && !segment.endsWith("ss")) {
        return segment.slice(0, -1);
      }
      return segment;
    })
    .join("-");
}

// ─── Public queries ───────────────────────────────────────────────────────────

export const list = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const topics = await ctx.db
      .query("userTopics")
      .withIndex("by_user_and_isArchived", (q) => q.eq("userId", userId).eq("isArchived", false))
      .take(100);
    return topics.filter((topic) => topic.memoryCount > 0);
  },
});

export const activeSummaries = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const hasAnyMemory = await ctx.db
      .query("memories")
      .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "active"))
      .take(1);
    if (hasAnyMemory.length === 0) {
      return [];
    }

    const topics = await ctx.db
      .query("userTopics")
      .withIndex("by_user_and_isArchived", (q) => q.eq("userId", userId).eq("isArchived", false))
      .take(100);
    return topics
      .filter((topic) => topic.memoryCount > 0)
      .map((topic) => ({
        _id: topic._id,
        name: topic.name,
        icon: topic.icon,
        color: topic.color,
        memoryCount: topic.memoryCount,
      }))
      .sort((a, b) => b.memoryCount - a.memoryCount);
  },
});

export const get = query({
  args: { token: v.string(), topicId: v.id("userTopics") },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const topic = await ctx.db.get(args.topicId);
    if (!topic || topic.userId !== userId) return null;
    return topic;
  },
});

// ─── Internal queries (used by actions) ──────────────────────────────────────

export const listWithCentroids = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("userTopics")
      .withIndex("by_user_and_isArchived", (q) =>
        q.eq("userId", args.userId).eq("isArchived", false),
      )
      .take(100);
  },
});

export const listActiveNames = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const topics = await ctx.db
      .query("userTopics")
      .withIndex("by_user_and_isArchived", (q) =>
        q.eq("userId", args.userId).eq("isArchived", false),
      )
      .take(100);
    return topics
      .filter((topic) => topic.memoryCount > 0)
      .map((topic) => ({ _id: topic._id, name: topic.name }));
  },
});

export const getBySlug = internalQuery({
  args: { userId: v.id("users"), slug: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("userTopics")
      .withIndex("by_user_slug", (q) => q.eq("userId", args.userId).eq("slug", args.slug))
      .first();
  },
});

export const countActiveTopics = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const topics = await ctx.db
      .query("userTopics")
      .withIndex("by_user_and_isArchived", (q) =>
        q.eq("userId", args.userId).eq("isArchived", false),
      )
      .take(100);
    return topics.length;
  },
});

// ─── Internal mutations ───────────────────────────────────────────────────────

export const createTopic = internalMutation({
  args: {
    userId: v.id("users"),
    name: v.string(),
    slug: v.string(),
    description: v.string(),
    icon: v.string(),
    color: v.string(),
    centroid: v.array(v.float64()),
    embeddingFingerprint: v.optional(v.string()),
    incrementExistingCount: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const normalizedSlug = normalizeTopicSlug(args.slug || args.name);
    const activeTopics = await ctx.db
      .query("userTopics")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .take(100);
    const normalizedMatch = activeTopics.find(
      (topic) =>
        !topic.isArchived &&
        (normalizeTopicSlug(topic.slug) === normalizedSlug ||
          normalizeTopicSlug(topic.name) === normalizedSlug),
    );

    if (normalizedMatch) {
      if (args.incrementExistingCount !== false) {
        const nextCount = normalizedMatch.memoryCount + 1;
        const nextCentroid = normalizedMatch.centroid.map(
          (value, index) =>
            (value * normalizedMatch.memoryCount + args.centroid[index]) / nextCount,
        );
        await ctx.db.patch(normalizedMatch._id, {
          centroid: nextCentroid,
          ...(args.embeddingFingerprint ? { embeddingFingerprint: args.embeddingFingerprint } : {}),
          memoryCount: nextCount,
          updatedAt: Date.now(),
        });
      }
      return normalizedMatch._id;
    }

    const exactSlugMatch = await ctx.db
      .query("userTopics")
      .withIndex("by_user_slug", (q) => q.eq("userId", args.userId).eq("slug", normalizedSlug))
      .first();
    const slug = exactSlugMatch ? `${normalizedSlug}-${Date.now()}` : normalizedSlug;

    return ctx.db.insert("userTopics", {
      userId: args.userId,
      name: args.name,
      slug,
      description: args.description,
      icon: args.icon,
      color: args.color,
      centroid: args.centroid,
      embeddingFingerprint: args.embeddingFingerprint,
      memoryCount: 0,
      relatedTopics: [],
      isArchived: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const updateCentroidAndCount = internalMutation({
  args: {
    topicId: v.id("userTopics"),
    newCentroid: v.array(v.float64()),
    embeddingFingerprint: v.optional(v.string()),
    delta: v.number(),
  },
  handler: async (ctx, args) => {
    const topic = await ctx.db.get(args.topicId);
    if (!topic) return;
    await ctx.db.patch(args.topicId, {
      centroid: args.newCentroid,
      ...(args.embeddingFingerprint ? { embeddingFingerprint: args.embeddingFingerprint } : {}),
      memoryCount: Math.max(0, topic.memoryCount + args.delta),
      updatedAt: Date.now(),
    });
  },
});

export const replaceUserTopicCentroids = internalMutation({
  args: {
    userId: v.id("users"),
    embeddingFingerprint: v.string(),
    centroids: v.array(
      v.object({
        topicId: v.id("userTopics"),
        centroid: v.array(v.float64()),
        memoryCount: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const centroidMap = new Map(args.centroids.map((entry) => [entry.topicId, entry] as const));
    const topics = await ctx.db
      .query("userTopics")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .take(200);
    for (const topic of topics) {
      const next = centroidMap.get(topic._id);
      if (next) {
        await ctx.db.patch(topic._id, {
          centroid: next.centroid,
          memoryCount: next.memoryCount,
          embeddingFingerprint: args.embeddingFingerprint,
          updatedAt: Date.now(),
        });
      }
    }
  },
});

export const updateRelations = internalMutation({
  args: {
    relations: v.array(
      v.object({
        a: v.id("userTopics"),
        b: v.id("userTopics"),
        similarity: v.float64(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    for (const rel of args.relations) {
      const topicA = await ctx.db.get(rel.a);
      const topicB = await ctx.db.get(rel.b);
      if (!topicA || !topicB) continue;

      const upsertEdge = (
        existing: typeof topicA.relatedTopics,
        targetId: Id<"userTopics">,
        similarity: number,
      ) => {
        const filtered = existing.filter((e) => e.topicId !== targetId);
        return [...filtered, { topicId: targetId, similarity, edgeType: "related" as const }];
      };

      await ctx.db.patch(rel.a, {
        relatedTopics: upsertEdge(topicA.relatedTopics, rel.b, rel.similarity),
        updatedAt: Date.now(),
      });
      await ctx.db.patch(rel.b, {
        relatedTopics: upsertEdge(topicB.relatedTopics, rel.a, rel.similarity),
        updatedAt: Date.now(),
      });
    }
  },
});

export const decrementOrArchiveTopics = internalMutation({
  args: {
    topicIds: v.array(v.id("userTopics")),
  },
  handler: async (ctx, args) => {
    const uniqueTopicIds = Array.from(new Set(args.topicIds));

    for (const topicId of uniqueTopicIds) {
      const topic = await ctx.db.get(topicId);
      if (!topic || topic.isArchived) continue;

      const nextCount = Math.max(0, topic.memoryCount - 1);
      if (nextCount > 0) {
        await ctx.db.patch(topicId, {
          memoryCount: nextCount,
          updatedAt: Date.now(),
        });
        continue;
      }

      await ctx.db.patch(topicId, {
        memoryCount: 0,
        isArchived: true,
        relatedTopics: [],
        parentTopicId: undefined,
        updatedAt: Date.now(),
      });

      const siblingTopics = await ctx.db
        .query("userTopics")
        .withIndex("by_user", (q) => q.eq("userId", topic.userId))
        .take(100);

      for (const sibling of siblingTopics) {
        if (sibling._id === topicId) continue;
        const filteredRelations = sibling.relatedTopics.filter(
          (relation) => relation.topicId !== topicId,
        );
        const shouldClearParent = sibling.parentTopicId === topicId;
        if (filteredRelations.length !== sibling.relatedTopics.length || shouldClearParent) {
          await ctx.db.patch(sibling._id, {
            relatedTopics: filteredRelations,
            ...(shouldClearParent ? { parentTopicId: undefined } : {}),
            updatedAt: Date.now(),
          });
        }
      }
    }
  },
});

export const incrementTopicCounts = internalMutation({
  args: {
    topicIds: v.array(v.id("userTopics")),
  },
  handler: async (ctx, args) => {
    const uniqueTopicIds = Array.from(new Set(args.topicIds));
    for (const topicId of uniqueTopicIds) {
      const topic = await ctx.db.get(topicId);
      if (!topic) continue;
      await ctx.db.patch(topicId, {
        memoryCount: topic.memoryCount + 1,
        isArchived: false,
        updatedAt: Date.now(),
      });
    }
  },
});

export const reconcileTopicUsage = internalMutation({
  args: {
    userId: v.id("users"),
    usage: v.array(
      v.object({
        topicId: v.id("userTopics"),
        memoryCount: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const usageByTopic = new Map(
      args.usage.map((entry) => [entry.topicId, entry.memoryCount] as const),
    );
    const topics = await ctx.db
      .query("userTopics")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .take(100);

    const archivedTopicIds = new Set<Id<"userTopics">>();

    for (const topic of topics) {
      const nextCount = usageByTopic.get(topic._id) ?? 0;
      const nextArchived = nextCount === 0;
      if (
        topic.memoryCount === nextCount &&
        topic.isArchived === nextArchived &&
        !(nextArchived && topic.relatedTopics.length > 0)
      ) {
        continue;
      }

      await ctx.db.patch(topic._id, {
        memoryCount: nextCount,
        isArchived: nextArchived,
        relatedTopics: nextArchived ? [] : topic.relatedTopics,
        ...(nextArchived ? { parentTopicId: undefined } : {}),
        updatedAt: Date.now(),
      });

      if (nextArchived) {
        archivedTopicIds.add(topic._id);
      }
    }

    if (archivedTopicIds.size === 0) {
      return;
    }

    for (const topic of topics) {
      if (archivedTopicIds.has(topic._id)) continue;
      const filteredRelations = topic.relatedTopics.filter(
        (relation) => !archivedTopicIds.has(relation.topicId),
      );
      const shouldClearParent = !!topic.parentTopicId && archivedTopicIds.has(topic.parentTopicId);
      if (filteredRelations.length !== topic.relatedTopics.length || shouldClearParent) {
        await ctx.db.patch(topic._id, {
          relatedTopics: filteredRelations,
          ...(shouldClearParent ? { parentTopicId: undefined } : {}),
          updatedAt: Date.now(),
        });
      }
    }
  },
});

export const mergeTopic = internalMutation({
  args: { keepId: v.id("userTopics"), mergeId: v.id("userTopics") },
  handler: async (ctx, args) => {
    const keep = await ctx.db.get(args.keepId);
    const merge = await ctx.db.get(args.mergeId);
    if (!keep || !merge || keep.isArchived || merge.isArchived) return;

    const allMemories = ctx.db
      .query("memories")
      .withIndex("by_user_status", (q) => q.eq("userId", merge.userId).eq("status", "active"));

    for await (const m of allMemories) {
      const hasTopicIds = m.topicIds?.includes(args.mergeId);
      const isPrimary = m.primaryTopicId === args.mergeId;
      if (!hasTopicIds && !isPrimary) continue;

      const newTopicIds = (m.topicIds ?? [])
        .map((id: Id<"userTopics">) => (id === args.mergeId ? args.keepId : id))
        .filter(
          (id: Id<"userTopics">, idx: number, arr: Id<"userTopics">[]) => arr.indexOf(id) === idx,
        );

      await ctx.db.patch(m._id, {
        ...(isPrimary ? { primaryTopicId: args.keepId } : {}),
        topicIds: newTopicIds,
      });
      await ctx.runMutation(internal.memories.syncTopicLinksForMemory, {
        memoryId: m._id,
      });
    }

    const keepLinks = await ctx.db
      .query("memoryTopicLinks")
      .withIndex("by_topic", (q) => q.eq("topicId", args.keepId))
      .take(10000);
    const totalCount = keepLinks.length;
    const newCentroid =
      totalCount > 0
        ? keep.centroid.map(
            (v, i) => (v * keep.memoryCount + merge.centroid[i] * merge.memoryCount) / totalCount,
          )
        : keep.centroid;

    await ctx.db.patch(args.keepId, {
      centroid: newCentroid,
      memoryCount: totalCount,
      updatedAt: Date.now(),
    });

    await ctx.db.patch(args.mergeId, {
      isArchived: true,
      updatedAt: Date.now(),
    });
  },
});

export const renameTopic = internalMutation({
  args: {
    topicId: v.id("userTopics"),
    name: v.string(),
    slug: v.string(),
    description: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.topicId, {
      name: args.name,
      slug: args.slug,
      description: args.description,
      updatedAt: Date.now(),
    });
  },
});

export const recolorTopic = internalMutation({
  args: {
    topicId: v.id("userTopics"),
    icon: v.string(),
    color: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.topicId, {
      icon: args.icon,
      color: args.color,
      updatedAt: Date.now(),
    });
  },
});
