import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { toStoredMemoryFields } from "./lib/memoryKind";

export const updateExtractionStatus = internalMutation({
  args: {
    extractionId: v.id("documentExtractions"),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed")
    ),
  },
  handler: async (ctx, args) => {
    const extraction = await ctx.db.get(args.extractionId);
    if (!extraction || extraction.status === args.status) {
      return;
    }
    await ctx.db.patch(args.extractionId, { status: args.status });
  },
});

export const completeExtraction = internalMutation({
  args: {
    extractionId: v.id("documentExtractions"),
    summary: v.string(),
    memoryCount: v.optional(v.float64()),
    documentType: v.optional(v.string()),
    expiryDate: v.optional(v.string()),
    keyDetails: v.optional(v.record(v.string(), v.string())),
    embedding: v.optional(v.array(v.float64())),
    generatedMemoryIds: v.optional(v.array(v.id("memories"))),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.extractionId, {
      summary: args.summary,
      status: "completed" as const,
      documentType: args.documentType,
      expiryDate: args.expiryDate,
      keyDetails: args.keyDetails,
      embedding: args.embedding,
      memoryCount: args.memoryCount,
      ...(args.generatedMemoryIds
        ? { generatedMemoryIds: args.generatedMemoryIds }
        : {}),
    });
  },
});

export const setMemoryReminder = internalMutation({
  args: {
    memoryId: v.id("memories"),
    dueAt: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(
      args.memoryId,
      toStoredMemoryFields({
        entryKind: "reminder",
        schedule: {
          dueAt: args.dueAt,
          isRecurring: false,
        },
      })
    );
  },
});

export const createExtractedMemory = internalMutation({
  args: {
    userId: v.id("users"),
    title: v.string(),
    content: v.string(),
    people: v.array(v.string()),
    locations: v.array(v.string()),
    importance: v.string(),
    embedding: v.optional(v.array(v.float64())),
  },
  handler: async (ctx, args): Promise<Id<"memories">> => {
    return await ctx.db.insert("memories", {
      userId: args.userId,
      title: args.title,
      content: args.content,
      people: args.people,
      locations: args.locations,
      importance: args.importance as "critical" | "high" | "normal" | "low",
      embedding: args.embedding,
      linkedUrls: [],
      entryKind: "memory" as const,
      status: "active",
    });
  },
});
