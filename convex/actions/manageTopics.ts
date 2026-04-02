"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { getOpenAIClient, OPENAI_CHAT_MODEL } from "../lib/openai";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0,
    magA = 0,
    magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

function incrementalCentroid(
  old: number[],
  newVec: number[],
  oldCount: number
): number[] {
  return old.map((v, i) => (v * oldCount + newVec[i]) / (oldCount + 1));
}

const TOPIC_ICONS = [
  "book",
  "briefcase",
  "heart",
  "home",
  "star",
  "coffee",
  "music",
  "camera",
  "globe",
  "map",
  "dollar-sign",
  "activity",
  "cpu",
  "users",
  "zap",
  "sun",
  "moon",
  "cloud",
  "code",
  "git-branch",
  "inbox",
  "mail",
  "shopping-cart",
  "tag",
  "tool",
  "trending-up",
  "truck",
  "tv",
  "user",
  "video",
  "smile",
  "award",
  "compass",
  "feather",
  "layers",
  "life-buoy",
  "package",
  "terminal",
];

const TOPIC_COLORS = [
  "#6366F1",
  "#3B82F6",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#EC4899",
  "#F97316",
  "#14B8A6",
  "#84CC16",
  "#06B6D4",
  "#A855F7",
];

async function aiCreateTopic(
  title: string,
  content: string,
  existingNames: string[]
): Promise<{
  name: string;
  slug: string;
  description: string;
  icon: string;
  color: string;
}> {
  const client = getOpenAIClient();
  if (!client) {
    const fallback = title.split(" ").slice(0, 2).join(" ") || "General";
    return {
      name: fallback,
      slug: fallback.toLowerCase().replace(/\s+/g, "-"),
      description: "AI-assigned topic",
      icon: "tag",
      color: TOPIC_COLORS[Math.floor(Math.random() * TOPIC_COLORS.length)],
    };
  }

  const prompt = `You are a personal knowledge organizer. Given a memory, create a topic that categorizes it.
Existing topics (do NOT duplicate): ${existingNames.join(", ") || "none"}
Icons available: ${TOPIC_ICONS.join(", ")}
Colors available: ${TOPIC_COLORS.join(", ")}
Return ONLY valid JSON with these exact keys:
{ "name": "2-3 words Title Case", "slug": "kebab-case", "description": "one sentence describing what memories share this topic", "icon": "feather-icon-name", "color": "#hexcolor" }`;

  try {
    const resp = await client.chat.completions.create({
      model: OPENAI_CHAT_MODEL,
      messages: [
        { role: "system", content: prompt },
        {
          role: "user",
          content: `Title: ${title}\nContent: ${content.slice(0, 400)}`,
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 150,
    });

    const raw = resp.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    return {
      name: typeof parsed.name === "string" ? parsed.name : title,
      slug:
        typeof parsed.slug === "string"
          ? parsed.slug
          : title.toLowerCase().replace(/\s+/g, "-"),
      description:
        typeof parsed.description === "string" ? parsed.description : "",
      icon: TOPIC_ICONS.includes(parsed.icon) ? parsed.icon : "tag",
      color: TOPIC_COLORS.includes(parsed.color)
        ? parsed.color
        : TOPIC_COLORS[0],
    };
  } catch {
    const fallback = title.split(" ").slice(0, 2).join(" ") || "General";
    return {
      name: fallback,
      slug: fallback.toLowerCase().replace(/\s+/g, "-"),
      description: "",
      icon: "tag",
      color: TOPIC_COLORS[0],
    };
  }
}

// ─── Main actions ─────────────────────────────────────────────────────────────

/** Called after every memory save. Assigns 1–3 topics to a memory. */
export const assignTopicsToMemory = internalAction({
  args: {
    memoryId: v.id("memories"),
    userId: v.id("users"),
    title: v.string(),
    content: v.string(),
    embedding: v.array(v.float64()),
  },
  handler: async (ctx, args) => {
    const topics = await ctx.runQuery(internal.userTopics.listWithCentroids, {
      userId: args.userId,
    });

    const PRIMARY_THRESHOLD = 0.82;
    const SECONDARY_THRESHOLD = 0.65;
    const MAX_TOPICS_PER_USER = 40;

    const scored = topics
      .map((t) => ({
        ...t,
        similarity: cosineSimilarity(args.embedding, t.centroid),
      }))
      .sort((a, b) => b.similarity - a.similarity);

    const primaryMatch =
      scored[0]?.similarity >= PRIMARY_THRESHOLD ? scored[0] : null;
    const secondaryMatches = scored
      .filter(
        (t) => t._id !== primaryMatch?._id && t.similarity >= SECONDARY_THRESHOLD
      )
      .slice(0, 2);

    let primaryTopicId: Id<"userTopics">;

    if (!primaryMatch) {
      if (topics.length >= MAX_TOPICS_PER_USER && topics.length >= 2) {
        let minSim = Infinity;
        let mergeA = topics[0]._id;
        let mergeB = topics[1]._id;
        for (let i = 0; i < topics.length; i++) {
          for (let j = i + 1; j < topics.length; j++) {
            const s = cosineSimilarity(topics[i].centroid, topics[j].centroid);
            if (s < minSim) {
              minSim = s;
              mergeA = topics[i]._id;
              mergeB = topics[j]._id;
            }
          }
        }
        const keep = topics.find((t) => t._id === mergeA)!;
        const merge = topics.find((t) => t._id === mergeB)!;
        const keepId =
          keep.memoryCount >= merge.memoryCount ? mergeA : mergeB;
        const mergeId = keepId === mergeA ? mergeB : mergeA;
        await ctx.runMutation(internal.userTopics.mergeTopic, {
          keepId,
          mergeId,
        });
      }

      const existingNames = topics.map((t) => t.name);
      const topicData = await aiCreateTopic(
        args.title,
        args.content,
        existingNames
      );
      primaryTopicId = await ctx.runMutation(internal.userTopics.createTopic, {
        userId: args.userId,
        ...topicData,
        centroid: args.embedding,
      });
    } else {
      primaryTopicId = primaryMatch._id;
      const newCentroid = incrementalCentroid(
        primaryMatch.centroid,
        args.embedding,
        primaryMatch.memoryCount
      );
      await ctx.runMutation(internal.userTopics.updateCentroidAndCount, {
        topicId: primaryTopicId,
        newCentroid,
        delta: 1,
      });
    }

    for (const t of secondaryMatches) {
      const newCentroid = incrementalCentroid(
        t.centroid,
        args.embedding,
        t.memoryCount
      );
      await ctx.runMutation(internal.userTopics.updateCentroidAndCount, {
        topicId: t._id,
        newCentroid,
        delta: 1,
      });
    }

    const topicIds = [
      primaryTopicId,
      ...secondaryMatches.map((t) => t._id as Id<"userTopics">),
    ];

    await ctx.runMutation(internal.memories.setTopics, {
      memoryId: args.memoryId,
      primaryTopicId,
      topicIds,
    });

    // Trigger re-analysis every 15 new memories
    const updatedTopics = await ctx.runQuery(
      internal.userTopics.listWithCentroids,
      { userId: args.userId }
    );
    const totalMemories = updatedTopics.reduce(
      (sum, t) => sum + t.memoryCount,
      0
    );
    if (totalMemories > 0 && totalMemories % 15 === 0) {
      await ctx.scheduler.runAfter(
        3000,
        internal.actions.manageTopics.reanalyzeUserTopics,
        { userId: args.userId }
      );
    }
  },
});

/** Periodic re-analysis: merge near-duplicates, build graph edges. */
export const reanalyzeUserTopics = internalAction({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const topics = await ctx.runQuery(internal.userTopics.listWithCentroids, {
      userId: args.userId,
    });
    if (topics.length < 2) return;

    const MERGE_THRESHOLD = 0.92;
    const RELATE_THRESHOLD = 0.72;

    const merges: Array<{
      keepId: Id<"userTopics">;
      mergeId: Id<"userTopics">;
    }> = [];
    const relations: Array<{
      a: Id<"userTopics">;
      b: Id<"userTopics">;
      similarity: number;
    }> = [];
    const mergedIds = new Set<string>();

    for (let i = 0; i < topics.length; i++) {
      for (let j = i + 1; j < topics.length; j++) {
        if (mergedIds.has(topics[i]._id) || mergedIds.has(topics[j]._id))
          continue;
        const sim = cosineSimilarity(topics[i].centroid, topics[j].centroid);

        if (sim >= MERGE_THRESHOLD) {
          const keepIdx =
            topics[i].memoryCount >= topics[j].memoryCount ? i : j;
          const mergeIdx = keepIdx === i ? j : i;
          merges.push({
            keepId: topics[keepIdx]._id,
            mergeId: topics[mergeIdx]._id,
          });
          mergedIds.add(topics[mergeIdx]._id);
        } else if (sim >= RELATE_THRESHOLD) {
          relations.push({
            a: topics[i]._id,
            b: topics[j]._id,
            similarity: sim,
          });
        }
      }
    }

    for (const m of merges) {
      await ctx.runMutation(internal.userTopics.mergeTopic, m);
    }

    if (relations.length > 0) {
      await ctx.runMutation(internal.userTopics.updateRelations, { relations });
    }
  },
});

/** Triggered by AI chat manage_topics tool. */
export const handleManageTopic = internalAction({
  args: {
    userId: v.id("users"),
    operation: v.union(
      v.literal("rename"),
      v.literal("merge"),
      v.literal("recolor"),
      v.literal("trigger_reanalysis"),
      v.literal("list")
    ),
    topicSlug: v.optional(v.string()),
    targetSlug: v.optional(v.string()),
    newName: v.optional(v.string()),
    newIcon: v.optional(v.string()),
    newColor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const topics = await ctx.runQuery(internal.userTopics.listWithCentroids, {
      userId: args.userId,
    });

    if (args.operation === "list") {
      return topics.map((t) => ({
        name: t.name,
        slug: t.slug,
        memoryCount: t.memoryCount,
      }));
    }

    if (args.operation === "trigger_reanalysis") {
      await ctx.scheduler.runAfter(
        0,
        internal.actions.manageTopics.reanalyzeUserTopics,
        { userId: args.userId }
      );
      return { success: true, message: "Re-analysis scheduled" };
    }

    const topic = topics.find((t) => t.slug === args.topicSlug);
    if (!topic)
      return { success: false, message: `Topic '${args.topicSlug}' not found` };

    if (args.operation === "rename" && args.newName) {
      const newSlug = args.newName.toLowerCase().replace(/\s+/g, "-");
      const client = getOpenAIClient();
      let description = topic.description;
      if (client) {
        try {
          const resp = await client.chat.completions.create({
            model: OPENAI_CHAT_MODEL,
            messages: [
              {
                role: "user",
                content: `Write a one-sentence description for a personal memory topic called "${args.newName}". Be concise.`,
              },
            ],
            max_tokens: 60,
          });
          description =
            resp.choices[0]?.message?.content?.trim() ?? description;
        } catch {
          /* use existing */
        }
      }
      await ctx.runMutation(internal.userTopics.renameTopic, {
        topicId: topic._id,
        name: args.newName,
        slug: newSlug,
        description,
      });
      return { success: true, message: `Renamed to '${args.newName}'` };
    }

    if (args.operation === "merge" && args.targetSlug) {
      const target = topics.find((t) => t.slug === args.targetSlug);
      if (!target)
        return {
          success: false,
          message: `Target topic '${args.targetSlug}' not found`,
        };
      const keepId =
        topic.memoryCount >= target.memoryCount ? topic._id : target._id;
      const mergeId = keepId === topic._id ? target._id : topic._id;
      await ctx.runMutation(internal.userTopics.mergeTopic, { keepId, mergeId });
      return {
        success: true,
        message: `Merged '${args.topicSlug}' into '${args.targetSlug}'`,
      };
    }

    if (args.operation === "recolor" && args.newIcon && args.newColor) {
      await ctx.runMutation(internal.userTopics.recolorTopic, {
        topicId: topic._id,
        icon: args.newIcon,
        color: args.newColor,
      });
      return { success: true, message: "Topic appearance updated" };
    }

    return { success: false, message: "Invalid operation or missing arguments" };
  },
});
