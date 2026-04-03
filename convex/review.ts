import { v } from "convex/values";
import { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { resolveUser } from "./lib/withAuth";

export const list = query({
  args: {
    token: v.string(),
    limit: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const limit = args.limit ? Math.min(args.limit, 100) : 100;
    const cards = await ctx.db
      .query("reviewCards")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(limit);

    // Batch-fetch all memories in parallel to eliminate N+1
    const memoryResults = await Promise.all(
      cards.map((card) => ctx.db.get(card.memoryId))
    );

    const result: Array<Doc<"reviewCards"> & { memory: Doc<"memories"> }> = [];
    for (let i = 0; i < cards.length; i++) {
      const memory = memoryResults[i];
      if (memory && !memory.isDeleted) {
        result.push({ ...cards[i], memory });
      }
    }
    return result;
  },
});

export const getDue = query({
  args: {
    token: v.string(),
    limit: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const now = new Date().toISOString();
    const limit = args.limit ? Math.min(args.limit, 50) : 50;

    const cards = await ctx.db
      .query("reviewCards")
      .withIndex("by_user_nextReviewAt", (q) =>
        q.eq("userId", userId).lte("nextReviewAt", now)
      )
      .take(limit);

    // Batch-fetch all memories in parallel to eliminate N+1
    const memoryResults = await Promise.all(
      cards.map((card) => ctx.db.get(card.memoryId))
    );

    const result: Array<Doc<"reviewCards"> & { memory: Doc<"memories"> }> = [];
    for (let i = 0; i < cards.length; i++) {
      const memory = memoryResults[i];
      if (memory && !memory.isDeleted) {
        result.push({ ...cards[i], memory });
      }
    }
    return result;
  },
});

export const addToReview = mutation({
  args: {
    token: v.string(),
    memoryId: v.id("memories"),
  },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const memory = await ctx.db.get(args.memoryId);
    if (!memory || memory.userId !== userId || memory.isDeleted) {
      throw new Error("Not found");
    }
    const existing = await ctx.db
      .query("reviewCards")
      .withIndex("by_memory", (q) => q.eq("memoryId", args.memoryId))
      .first();
    if (existing) return existing._id;

    return await ctx.db.insert("reviewCards", {
      userId,
      memoryId: args.memoryId,
      nextReviewAt: new Date().toISOString(),
      intervalDays: 1,
      easeFactor: 2.5,
      repetitions: 0,
    });
  },
});

export const removeFromReview = mutation({
  args: { token: v.string(), memoryId: v.id("memories") },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const card = await ctx.db
      .query("reviewCards")
      .withIndex("by_memory", (q) => q.eq("memoryId", args.memoryId))
      .first();
    if (card && card.userId === userId) {
      await ctx.db.delete(card._id);
    }
  },
});

export const review = mutation({
  args: {
    token: v.string(),
    cardId: v.id("reviewCards"),
    quality: v.float64(),
  },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const card = await ctx.db.get(args.cardId);
    if (!card || card.userId !== userId) return;

    let newEF =
      card.easeFactor +
      (0.1 - (5 - args.quality) * (0.08 + (5 - args.quality) * 0.02));
    if (newEF < 1.3) newEF = 1.3;

    let newInterval: number;
    let newReps: number;
    if (args.quality < 3) {
      newInterval = 1;
      newReps = 0;
    } else {
      if (card.repetitions === 0) newInterval = 1;
      else if (card.repetitions === 1) newInterval = 6;
      else newInterval = Math.round(card.intervalDays * newEF);
      newReps = card.repetitions + 1;
    }

    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + newInterval);

    await ctx.db.patch(args.cardId, {
      intervalDays: newInterval,
      easeFactor: newEF,
      repetitions: newReps,
      lastReviewedAt: new Date().toISOString(),
      nextReviewAt: nextDate.toISOString(),
    });
  },
});
