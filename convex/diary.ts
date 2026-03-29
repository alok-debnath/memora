import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { api } from "./_generated/api";
import { resolveUser } from "./lib/withAuth";
import { moodValidator, energyLevelValidator, priorityValidator } from "./lib/validators";

export const list = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    return await ctx.db
      .query("diaryEntries")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(200);
  },
});

export const create = mutation({
  args: {
    token: v.string(),
    rawText: v.string(),
    correctedText: v.optional(v.string()),
    mood: v.optional(moodValidator),
    energyLevel: v.optional(energyLevelValidator),
    topics: v.optional(v.array(v.string())),
    structuredInsights: v.optional(
      v.array(v.object({ insight: v.string(), category: v.string() }))
    ),
  },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const entryId = await ctx.db.insert("diaryEntries", {
      userId,
      rawText: args.rawText,
      correctedText: args.correctedText,
      mood: args.mood,
      energyLevel: args.energyLevel,
      topics: args.topics ?? ["general"],
      structuredInsights: args.structuredInsights,
    });

    await ctx.scheduler.runAfter(0, api.actions.processDiary.processDiary, {
      entryId,
      rawText: args.rawText,
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

export const replaceNudgesFromDiary = internalMutation({
  args: {
    entryId: v.id("diaryEntries"),
    nudges: v.array(
      v.object({
        title: v.string(),
        message: v.string(),
        nudgeType: v.string(),
        priority: priorityValidator,
      })
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

    for (const nudge of existing) {
      if (!nudge.isDismissed) {
        await ctx.db.patch(nudge._id, { isDismissed: true });
      }
    }

    for (const nudge of args.nudges.slice(0, 2)) {
      await ctx.db.insert("nudges", {
        userId: entry.userId,
        title: nudge.title,
        message: nudge.message,
        nudgeType: nudge.nudgeType,
        priority: nudge.priority,
        isDismissed: false,
        isActedOn: false,
        basedOnDiaryEntryIds: [args.entryId],
      });
    }
  },
});
