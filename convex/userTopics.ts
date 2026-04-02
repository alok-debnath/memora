import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { resolveUser } from "./lib/withAuth";

// ─── Public queries ───────────────────────────────────────────────────────────

export const list = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    return ctx.db
      .query("userTopics")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("isArchived"), false))
      .collect();
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
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("isArchived"), false))
      .collect();
  },
});

export const getBySlug = internalQuery({
  args: { userId: v.id("users"), slug: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("userTopics")
      .withIndex("by_user_slug", (q) =>
        q.eq("userId", args.userId).eq("slug", args.slug)
      )
      .first();
  },
});

export const countActiveTopics = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const topics = await ctx.db
      .query("userTopics")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("isArchived"), false))
      .collect();
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
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("userTopics")
      .withIndex("by_user_slug", (q) =>
        q.eq("userId", args.userId).eq("slug", args.slug)
      )
      .first();
    const slug = existing ? `${args.slug}-${Date.now()}` : args.slug;

    return ctx.db.insert("userTopics", {
      userId: args.userId,
      name: args.name,
      slug,
      description: args.description,
      icon: args.icon,
      color: args.color,
      centroid: args.centroid,
      memoryCount: 1,
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
    delta: v.number(),
  },
  handler: async (ctx, args) => {
    const topic = await ctx.db.get(args.topicId);
    if (!topic) return;
    await ctx.db.patch(args.topicId, {
      centroid: args.newCentroid,
      memoryCount: Math.max(0, topic.memoryCount + args.delta),
      updatedAt: Date.now(),
    });
  },
});

export const updateRelations = internalMutation({
  args: {
    relations: v.array(
      v.object({
        a: v.id("userTopics"),
        b: v.id("userTopics"),
        similarity: v.float64(),
      })
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
        similarity: number
      ) => {
        const filtered = existing.filter((e) => e.topicId !== targetId);
        return [
          ...filtered,
          { topicId: targetId, similarity, edgeType: "related" as const },
        ];
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

export const mergeTopic = internalMutation({
  args: { keepId: v.id("userTopics"), mergeId: v.id("userTopics") },
  handler: async (ctx, args) => {
    const keep = await ctx.db.get(args.keepId);
    const merge = await ctx.db.get(args.mergeId);
    if (!keep || !merge || keep.isArchived || merge.isArchived) return;

    const allMemories = await ctx.db
      .query("memories")
      .withIndex("by_user", (q) => q.eq("userId", merge.userId))
      .collect();

    for (const m of allMemories) {
      const hasTopicIds = m.topicIds?.includes(args.mergeId);
      const isPrimary = m.primaryTopicId === args.mergeId;
      if (!hasTopicIds && !isPrimary) continue;

      const newTopicIds = (m.topicIds ?? [])
        .map((id: Id<"userTopics">) => (id === args.mergeId ? args.keepId : id))
        .filter(
          (id: Id<"userTopics">, idx: number, arr: Id<"userTopics">[]) =>
            arr.indexOf(id) === idx
        );

      await ctx.db.patch(m._id, {
        ...(isPrimary ? { primaryTopicId: args.keepId } : {}),
        topicIds: newTopicIds,
      });
    }

    const totalCount = keep.memoryCount + merge.memoryCount;
    const newCentroid =
      totalCount > 0
        ? keep.centroid.map(
            (v, i) =>
              (v * keep.memoryCount + merge.centroid[i] * merge.memoryCount) /
              totalCount
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
