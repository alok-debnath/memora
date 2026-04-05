import { v } from "convex/values";
import { action, mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { api, internal } from "./_generated/api";
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

// ─── Chat search streaming status ─────────────────────────────────────────────

/** Written by the chat action when search_memories is invoked. */
export const setSearchStatus = internalMutation({
  args: { userId: v.id("users"), query: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("chatSearchStatus")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { query: args.query, startedAt: Date.now() });
    } else {
      await ctx.db.insert("chatSearchStatus", {
        userId: args.userId,
        query: args.query,
        startedAt: Date.now(),
      });
    }
  },
});

/** Cleared by the chat action after search_memories finishes. */
export const clearSearchStatus = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("chatSearchStatus")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (existing) await ctx.db.delete(existing._id);
  },
});

/** Client subscribes to this to show the live "Searching..." bubble. */
export const getSearchStatus = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    return await ctx.db
      .query("chatSearchStatus")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
  },
});

/** Called from the Deep Scan button — reruns search with forceDeepSearch=true
 *  and patches the assistant message that originally held the cached results. */
export const deepSearch = action({
  args: {
    token: v.string(),
    query: v.string(),
    messageId: v.id("chatMessages"),
  },
  handler: async (ctx, args) => {
    // Actions don't have db access — resolve user via a query
    const session = await ctx.runQuery(api.auth.me, { token: args.token });
    if (!session) throw new Error("Unauthorized");

    // Run a fresh semantic search bypassing the embedding cache
    const fresh = await ctx.runAction(api.actions.semanticSearch.search, {
      token: args.token,
      query: args.query,
      limit: 10,
      forceDeepSearch: true,
    });

    // Fetch the original message
    const original = await ctx.runQuery(internal.chat.getMessage, { id: args.messageId });
    if (!original?.content) return { count: fresh.results.length };

    // Replace the hidden MEMORA_SEARCH_RESULTS block with fresh data
    const marker = "<!--MEMORA_SEARCH_RESULTS:";
    const endMarker = "-->";
    const startIdx = original.content.indexOf(marker);
    const endIdx = startIdx !== -1
      ? original.content.indexOf(endMarker, startIdx + marker.length)
      : -1;

    let newContent: string;
    if (startIdx !== -1 && endIdx !== -1) {
      const before = original.content.slice(0, startIdx);
      const after = original.content.slice(endIdx + endMarker.length);
      newContent = before
        + marker
        + JSON.stringify({ items: fresh.results, isCached: false })
        + endMarker
        + after;
    } else {
      // No existing block — append one
      newContent =
        original.content.trimEnd() +
        `\n${marker}${JSON.stringify({ items: fresh.results, isCached: false })}${endMarker}`;
    }

    await ctx.runMutation(internal.chat.patchMessageContent, {
      id: args.messageId,
      content: newContent,
    });

    return { count: fresh.results.length };
  },
});

export const getMessage = internalQuery({
  args: { id: v.id("chatMessages") },
  handler: async (ctx, args) => ctx.db.get(args.id),
});

export const patchMessageContent = internalMutation({
  args: { id: v.id("chatMessages"), content: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { content: args.content });
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
