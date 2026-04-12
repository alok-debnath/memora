import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { resolveUser } from "./lib/withAuth";

export const list = query({
  args: {
    token: v.string(),
    includeAll: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const nudges = await ctx.db
      .query("nudges")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(50);

    if (args.includeAll) return nudges;

    const now = Date.now();
    return nudges.filter((n) => !n.isDismissed && (!n.expiresAt || n.expiresAt > now));
  },
});

export const dismiss = mutation({
  args: { token: v.string(), id: v.id("nudges") },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const nudge = await ctx.db.get(args.id);
    if (!nudge || nudge.userId !== userId) throw new Error("Not found");
    await ctx.db.patch(args.id, { isDismissed: true });
  },
});

export const actOn = mutation({
  args: { token: v.string(), id: v.id("nudges") },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const nudge = await ctx.db.get(args.id);
    if (!nudge || nudge.userId !== userId) throw new Error("Not found");
    await ctx.db.patch(args.id, { isDismissed: true, isActedOn: true });
    return { nudgeType: nudge.nudgeType, message: nudge.message };
  },
});
