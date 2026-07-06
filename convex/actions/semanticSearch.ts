"use node";

import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { action } from "../_generated/server";
import { api } from "../_generated/api";
import { runSemanticSearch } from "../lib/semanticSearch";

export const search = action({
  args: {
    token: v.string(),
    query: v.string(),
    limit: v.optional(v.float64()),
    forceDeepSearch: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<Awaited<ReturnType<typeof runSemanticSearch>>> => {
    const session: { _id: Id<"users"> } | null = await ctx.runQuery(api.auth.me, {
      token: args.token,
    });
    if (!session) {
      return { results: [], diaryResults: [], isCached: false };
    }

    return await runSemanticSearch(ctx, {
      token: args.token,
      userId: session._id,
      query: args.query,
      limit: args.limit,
      forceDeepSearch: args.forceDeepSearch,
    });
  },
});
