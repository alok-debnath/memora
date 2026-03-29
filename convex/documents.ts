import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { api } from "./_generated/api";
import { resolveUser } from "./lib/withAuth";

export const list = query({
  args: {
    token: v.string(),
    type: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx, args.token);
    const docs =
      args.type && args.type !== "all"
        ? await ctx.db
            .query("documentExtractions")
            .withIndex("by_user_type", (q) =>
              q.eq("userId", user._id).eq("documentType", args.type)
            )
            .order("desc")
            .take(200)
        : await ctx.db
            .query("documentExtractions")
            .withIndex("by_user", (q) => q.eq("userId", user._id))
            .order("desc")
            .take(200);
    return docs;
  },
});

export const create = mutation({
  args: {
    token: v.string(),
    filename: v.string(),
    extractedText: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx, args.token);
    const id = await ctx.db.insert("documentExtractions", {
      userId: user._id,
      filename: args.filename,
      extractedText: args.extractedText,
      generatedMemoryIds: [],
      keyDetails: {},
      status: "pending",
    });

    await ctx.scheduler.runAfter(0, api.actions.processDocument.processDocument, {
      extractionId: id,
      text: args.extractedText,
      userId: user._id,
      userTimezone: user.timezone,
    });

    return id;
  },
});

export const remove = mutation({
  args: {
    token: v.string(),
    documentId: v.id("documentExtractions"),
  },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx, args.token);
    const doc = await ctx.db.get(args.documentId);
    if (!doc || doc.userId !== user._id) {
      throw new Error("Document not found");
    }
    await ctx.db.delete(args.documentId);
  },
});
