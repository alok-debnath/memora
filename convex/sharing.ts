import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { resolveUser } from "./lib/withAuth";

export const createShareLink = mutation({
  args: {
    token: v.string(),
    memoryId: v.id("memories"),
    expiresInDays: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const memory = await ctx.db.get(args.memoryId);
    if (!memory || memory.userId !== userId || memory.isDeleted) {
      throw new Error("Not found");
    }

    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const shareToken = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
    const expiresAt = args.expiresInDays
      ? Date.now() + args.expiresInDays * 86400000
      : undefined;

    await ctx.db.insert("sharedMemories", {
      memoryId: args.memoryId,
      sharedByUserId: userId,
      shareToken,
      expiresAt,
      viewCount: 0,
      isActive: true,
    });

    await ctx.db.patch(args.memoryId, { shareToken, isPublic: true });

    return shareToken;
  },
});

export const revokeShareLink = mutation({
  args: {
    token: v.string(),
    memoryId: v.id("memories"),
  },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const shares = await ctx.db
      .query("sharedMemories")
      .withIndex("by_memory", (q) => q.eq("memoryId", args.memoryId))
      .take(50);

    for (const share of shares) {
      if (share.sharedByUserId === userId) {
        await ctx.db.patch(share._id, { isActive: false });
      }
    }

    await ctx.db.patch(args.memoryId, { isPublic: false, shareToken: undefined });
  },
});

export const listShared = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    return await ctx.db
      .query("sharedMemories")
      .withIndex("by_user", (q) => q.eq("sharedByUserId", userId))
      .take(200);
  },
});

export const getByToken = query({
  args: { shareToken: v.string() },
  handler: async (ctx, args) => {
    const share = await ctx.db
      .query("sharedMemories")
      .withIndex("by_token", (q) => q.eq("shareToken", args.shareToken))
      .first();
    if (!share || !share.isActive) return null;
    if (share.expiresAt && share.expiresAt < Date.now()) return null;
    const memory = await ctx.db.get(share.memoryId);
    if (!memory || memory.isDeleted) return null;
    return memory;
  },
});
