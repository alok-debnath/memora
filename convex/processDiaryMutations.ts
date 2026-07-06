import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";
import { buildDiarySearchText } from "./lib/diaryText";

const PROFILE_LIST_CAP = 30;

function mergeUnique(existing: string[], incoming: string[] | undefined, cap = PROFILE_LIST_CAP) {
  if (!incoming?.length) {
    return existing;
  }
  const seen = new Set(existing.map((item) => item.trim().toLowerCase()));
  const merged = [...existing];
  for (const item of incoming) {
    const normalized = item.trim();
    if (!normalized || seen.has(normalized.toLowerCase())) {
      continue;
    }
    seen.add(normalized.toLowerCase());
    merged.push(normalized);
  }
  // Keep the newest facts when over cap — later entries reflect the current user better
  return merged.slice(-cap);
}

async function mergeUserProfile(
  ctx: MutationCtx,
  userId: Id<"users">,
  incoming: {
    likes?: string[];
    dislikes?: string[];
    traits?: string[];
    habits?: Array<{ habit: string; sentiment: "positive" | "negative" | "neutral" }>;
  },
) {
  const existing = await ctx.db
    .query("userProfiles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();

  const base = existing ?? {
    likes: [] as string[],
    dislikes: [] as string[],
    traits: [] as string[],
    habits: [] as Array<{ habit: string; sentiment: "positive" | "negative" | "neutral" }>,
  };

  const habitSeen = new Set(base.habits.map((h) => h.habit.trim().toLowerCase()));
  const mergedHabits = [...base.habits];
  for (const habit of incoming.habits ?? []) {
    const normalized = habit.habit.trim();
    if (!normalized || habitSeen.has(normalized.toLowerCase())) {
      continue;
    }
    habitSeen.add(normalized.toLowerCase());
    mergedHabits.push({ habit: normalized, sentiment: habit.sentiment });
  }

  const patch = {
    likes: mergeUnique(base.likes, incoming.likes),
    dislikes: mergeUnique(base.dislikes, incoming.dislikes),
    traits: mergeUnique(base.traits, incoming.traits),
    habits: mergedHabits.slice(-PROFILE_LIST_CAP),
    updatedAt: Date.now(),
  };

  if (existing) {
    await ctx.db.patch(existing._id, patch);
  } else {
    await ctx.db.insert("userProfiles", { userId, ...patch });
  }
}

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
    const entry = await ctx.db.get(args.entryId);
    if (!entry) {
      return;
    }
    await ctx.db.patch(args.entryId, {
      searchText: buildDiarySearchText({
        rawText: entry.rawText,
        correctedText: args.correctedText,
        summary: args.summary,
        topics: args.topics,
      }),
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

    await mergeUserProfile(ctx, entry.userId, {
      likes: args.likes,
      dislikes: args.dislikes,
      traits: args.personalityTraits?.map((item) => item.trait),
      habits: args.habitsDetected?.map((item) => ({
        habit: item.habit,
        sentiment: item.sentiment,
      })),
    });
  },
});

export const updateDiaryEmbedding = internalMutation({
  args: {
    entryId: v.id("diaryEntries"),
    embedding: v.array(v.float64()),
    embeddingFingerprint: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const entry = await ctx.db.get(args.entryId);
    if (!entry) {
      return;
    }
    await ctx.db.patch(args.entryId, {
      embedding: args.embedding,
      embeddingFingerprint: args.embeddingFingerprint,
      embeddingState: "ready",
    });
  },
});
