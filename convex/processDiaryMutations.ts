import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

export const updateDiaryAnalysis = internalMutation({
  args: {
    entryId: v.id("diaryEntries"),
    correctedText: v.string(),
    mood: v.string(),
    energyLevel: v.string(),
    topics: v.array(v.string()),
    summary: v.optional(v.string()),
    insights: v.array(v.object({ insight: v.string(), category: v.string() })),
    habitsDetected: v.optional(
      v.array(
        v.object({
          habit: v.string(),
          sentiment: v.union(v.literal("positive"), v.literal("negative"), v.literal("neutral")),
          frequencyHint: v.optional(v.string()),
        }),
      ),
    ),
    personalityTraits: v.optional(v.array(v.object({ trait: v.string(), evidence: v.string() }))),
    likes: v.optional(v.array(v.string())),
    dislikes: v.optional(v.array(v.string())),
    actionItems: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.entryId, {
      correctedText: args.correctedText,
      mood: args.mood as
        | "happy"
        | "sad"
        | "anxious"
        | "excited"
        | "neutral"
        | "grateful"
        | "frustrated"
        | "hopeful"
        | "nostalgic"
        | "motivated",
      energyLevel: args.energyLevel as "high" | "medium" | "low",
      topics: args.topics,
      summary: args.summary,
      structuredInsights: args.insights,
      habitsDetected: args.habitsDetected,
      personalityTraits: args.personalityTraits,
      likes: args.likes,
      dislikes: args.dislikes,
      actionItems: args.actionItems,
    });
  },
});
