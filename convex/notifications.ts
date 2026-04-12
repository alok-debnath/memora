import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { resolveUser } from "./lib/withAuth";

export const get = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    return await ctx.db
      .query("notificationPreferences")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
  },
});

export const upsert = mutation({
  args: {
    token: v.string(),
    dailyReview: v.optional(v.boolean()),
    dailyReviewTime: v.optional(v.string()),
    weeklyDigest: v.optional(v.boolean()),
    weeklyDigestDay: v.optional(v.string()),
    memoryNudges: v.optional(v.boolean()),
    capsuleAlerts: v.optional(v.boolean()),
    pushEnabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const existing = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    const defaults = {
      dailyReview: true,
      dailyReviewTime: "09:00",
      weeklyDigest: true,
      weeklyDigestDay: "sunday",
      memoryNudges: true,
      capsuleAlerts: true,
      pushEnabled: false,
    };

    const updates = {
      dailyReview: args.dailyReview ?? existing?.dailyReview ?? defaults.dailyReview,
      dailyReviewTime:
        args.dailyReviewTime ?? existing?.dailyReviewTime ?? defaults.dailyReviewTime,
      weeklyDigest: args.weeklyDigest ?? existing?.weeklyDigest ?? defaults.weeklyDigest,
      weeklyDigestDay:
        args.weeklyDigestDay ?? existing?.weeklyDigestDay ?? defaults.weeklyDigestDay,
      memoryNudges: args.memoryNudges ?? existing?.memoryNudges ?? defaults.memoryNudges,
      capsuleAlerts: args.capsuleAlerts ?? existing?.capsuleAlerts ?? defaults.capsuleAlerts,
      pushEnabled: args.pushEnabled ?? existing?.pushEnabled ?? defaults.pushEnabled,
    };

    if (existing) {
      const unchanged = Object.entries(updates).every(
        ([key, value]) => existing[key as keyof typeof updates] === value,
      );
      if (unchanged) {
        return existing._id;
      }
      await ctx.db.patch(existing._id, updates);
      return existing._id;
    }

    return await ctx.db.insert("notificationPreferences", {
      userId,
      ...updates,
    });
  },
});
