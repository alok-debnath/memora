import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { api } from "./_generated/api";
import { resolveUser } from "./lib/withAuth";
import { encryptedEnvelopeValidator } from "./lib/validators";

export const list = query({
  args: {
    token: v.string(),
    conversationId: v.optional(v.string()),
    limit: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const limit = args.limit ? Math.min(args.limit, 100) : 100;

    if (args.conversationId) {
      return await ctx.db
        .query("chatMessages")
        .withIndex("by_user_conversation", (q) =>
          q.eq("userId", userId).eq("conversationId", args.conversationId)
        )
        .order("asc")
        .take(limit);
    }

    return await ctx.db
      .query("chatMessages")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("asc")
      .take(limit);
  },
});

export const send = internalMutation({
  args: {
    userId: v.id("users"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    conversationId: v.optional(v.string()),
    // Plaintext field (legacy, optional)
    content: v.optional(v.string()),
    // Encrypted field
    encryptedContent: v.optional(encryptedEnvelopeValidator),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("chatMessages", {
      userId: args.userId,
      role: args.role,
      content: args.content,
      encryptedContent: args.encryptedContent,
      conversationId: args.conversationId,
    });
  },
});

export const clear = mutation({
  args: {
    token: v.string(),
    conversationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);

    const messages = args.conversationId
      ? await ctx.db
          .query("chatMessages")
          .withIndex("by_user_conversation", (q) =>
            q.eq("userId", userId).eq("conversationId", args.conversationId)
          )
          .take(500)
      : await ctx.db
          .query("chatMessages")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .take(500);

    for (const msg of messages) {
      await ctx.db.delete(msg._id);
    }

    // If there are more, schedule continuation
    if (messages.length >= 500) {
      await ctx.scheduler.runAfter(0, api.chat.clear, {
        token: args.token,
        conversationId: args.conversationId,
      });
    }
  },
});
