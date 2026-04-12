import { v } from "convex/values";
import { action, mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { resolveUser } from "./lib/withAuth";

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
          q.eq("userId", userId).eq("conversationId", args.conversationId),
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
    content: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const messageId = await ctx.db.insert("chatMessages", {
      userId: args.userId,
      role: args.role,
      content: args.content,
      conversationId: args.conversationId,
    });
    await ctx.runMutation(internal.analytics.recordProductEvent, {
      userId: args.userId,
      event: "chat_message",
    });
    return messageId;
  },
});

// ─── Chat search streaming status ─────────────────────────────────────────────

/** Written by the chat action when search_memories is invoked. */
export const setSearchStatus = internalMutation({
  args: {
    userId: v.id("users"),
    query: v.optional(v.string()),
    phase: v.optional(v.string()),
    toolName: v.optional(v.string()),
    detail: v.optional(v.string()),
    source: v.optional(v.string()),
    cacheState: v.optional(v.string()),
    resultCount: v.optional(v.number()),
    previewItems: v.optional(v.array(v.string())),
    events: v.optional(
      v.array(
        v.object({
          label: v.string(),
          value: v.optional(v.string()),
        }),
      ),
    ),
    step: v.optional(v.number()),
    totalSteps: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("chatSearchStatus")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    const patch = {
      ...(args.query !== undefined ? { query: args.query } : {}),
      ...(args.phase !== undefined ? { phase: args.phase } : {}),
      ...(args.toolName !== undefined ? { toolName: args.toolName } : {}),
      ...(args.detail !== undefined ? { detail: args.detail } : {}),
      ...(args.source !== undefined ? { source: args.source } : {}),
      ...(args.cacheState !== undefined ? { cacheState: args.cacheState } : {}),
      ...(args.resultCount !== undefined ? { resultCount: args.resultCount } : {}),
      ...(args.previewItems !== undefined ? { previewItems: args.previewItems } : {}),
      ...(args.events !== undefined ? { events: args.events } : {}),
      ...(args.step !== undefined ? { step: args.step } : {}),
      ...(args.totalSteps !== undefined ? { totalSteps: args.totalSteps } : {}),
      updatedAt: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("chatSearchStatus", {
        userId: args.userId,
        query: args.query,
        phase: args.phase,
        toolName: args.toolName,
        detail: args.detail,
        source: args.source,
        cacheState: args.cacheState,
        resultCount: args.resultCount,
        previewItems: args.previewItems,
        events: args.events,
        step: args.step,
        totalSteps: args.totalSteps,
        startedAt: Date.now(),
        updatedAt: Date.now(),
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
  handler: async (ctx, args): Promise<{ count: number }> => {
    // Actions don't have db access — resolve user via a query
    const session = await ctx.runQuery(api.auth.me, { token: args.token });
    if (!session) throw new Error("Unauthorized");

    await ctx.runMutation(internal.chat.setSearchStatus, {
      userId: session._id,
      query: args.query,
      phase: "searching",
      toolName: "deep_search",
      detail: args.query.trim()
        ? `Running deep scan for "${args.query.trim()}"`
        : "Running deep scan",
      source: "memories",
      cacheState: "fresh",
      events: [
        { label: "Mode", value: "forced deep scan" },
        { label: "Scope", value: "title, content, people, locations, topics" },
      ],
      step: 1,
      totalSteps: 2,
    });

    try {
      // Run a fresh semantic search bypassing the embedding cache
      const fresh: {
        results: Array<Doc<"memories"> & { _score?: number }>;
        isCached: boolean;
      } = await ctx.runAction(api.actions.semanticSearch.search, {
        token: args.token,
        query: args.query,
        limit: 10,
        forceDeepSearch: true,
      });

      await ctx.runMutation(internal.chat.setSearchStatus, {
        userId: session._id,
        query: args.query,
        phase: "finalizing",
        toolName: "deep_search",
        detail: "Applying deep scan results",
        source: "memories",
        cacheState: "fresh",
        resultCount: fresh.results.length,
        previewItems: fresh.results
          .slice(0, 3)
          .map((memory) => memory.title?.trim() || memory.content?.trim() || "Untitled memory")
          .filter(Boolean),
        events: [
          { label: "Mode", value: "deep scan complete" },
          { label: "Matches", value: `${fresh.results.length}` },
        ],
        step: 2,
        totalSteps: 2,
      });

      // Fetch the original message
      const original = await ctx.runQuery(internal.chat.getMessage, {
        id: args.messageId,
      });
      if (!original?.content) return { count: fresh.results.length };

      // Replace or append the hidden MEMORA_CARD_IDS block with fresh data
      const marker = "<!--MEMORA_CARD_IDS:";
      const endMarker = "-->";
      const startIdx = original.content.indexOf(marker);
      const endIdx =
        startIdx !== -1 ? original.content.indexOf(endMarker, startIdx + marker.length) : -1;

      const cardMetadata = {
        ids: fresh.results.map((r) => r._id),
        isCached: false,
        turns: 1, // Deep scan is an explicit single-purpose turn
        flow: {
          assistantProvider: "openai",
          toolSequence: ["deep_search", "surface_cards"],
          searches: [
            {
              source: "tool",
              query: args.query.trim() || undefined,
              resultCount: fresh.results.length,
              cacheState: "fresh",
              searchMode: "semantic_fresh",
            },
          ],
          attachments: [],
          summary: {
            assistantProvider: "openai",
            turns: 1,
            cardCount: fresh.results.length,
            pathMode: "fresh",
            hasFiles: false,
          },
          steps: [
            {
              kind: "search",
              query: args.query.trim() || undefined,
              resultCount: fresh.results.length,
              cacheState: "fresh",
              searchMode: "semantic_fresh",
            },
            {
              kind: "tool",
              toolName: "deep_search",
              label: "Deep scan",
            },
            {
              kind: "reasoning",
              turns: 1,
              assistantProvider: "openai",
            },
            {
              kind: "result",
              cardCount: fresh.results.length,
            },
          ],
        },
      };

      let newContent: string;
      if (startIdx !== -1 && endIdx !== -1) {
        const before = original.content.slice(0, startIdx);
        const after = original.content.slice(endIdx + endMarker.length);
        newContent = before + marker + JSON.stringify(cardMetadata) + endMarker + after;
      } else {
        // No existing block — append one
        newContent =
          original.content.trimEnd() + `\n${marker}${JSON.stringify(cardMetadata)}${endMarker}`;
      }

      await ctx.runMutation(internal.chat.patchMessageContent, {
        id: args.messageId,
        content: newContent,
      });

      return { count: fresh.results.length };
    } finally {
      await ctx.runMutation(internal.chat.clearSearchStatus, {
        userId: session._id,
      });
    }
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
            q.eq("userId", userId).eq("conversationId", args.conversationId),
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
