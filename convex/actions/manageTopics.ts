"use node";

import { v } from "convex/values";
import { action, internalAction } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { Doc, Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { embedText, getOpenAIClient, OPENAI_CHAT_MODEL } from "../lib/openai";

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

async function reconcileUserTopicUsage(
  ctx: {
    runQuery: ActionCtx["runQuery"];
    runMutation: ActionCtx["runMutation"];
  },
  userId: Id<"users">
) {
  const memoryTopicRefs: Array<{
    _id: Id<"memories">;
    primaryTopicId?: Id<"userTopics">;
    topicIds: Id<"userTopics">[];
  }> = await ctx.runQuery(internal.memories.listTopicRefsForUser, {
    userId,
  });

  const usageCounts = new Map<Id<"userTopics">, number>();
  for (const memory of memoryTopicRefs) {
    const uniqueTopicIds = new Set<Id<"userTopics">>();
    if (memory.primaryTopicId) {
      uniqueTopicIds.add(memory.primaryTopicId);
    }
    for (const topicId of memory.topicIds) {
      uniqueTopicIds.add(topicId);
    }
    for (const topicId of uniqueTopicIds) {
      usageCounts.set(topicId, (usageCounts.get(topicId) ?? 0) + 1);
    }
  }

  await ctx.runMutation(internal.userTopics.reconcileTopicUsage, {
    userId,
    usage: Array.from(usageCounts.entries()).map(([topicId, memoryCount]) => ({
      topicId,
      memoryCount,
    })),
  });

  return memoryTopicRefs;
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

type TopicData = {
  name: string;
  slug: string;
  description: string;
  icon: string;
  color: string;
};

type TopicRecord = {
  _id: Id<"userTopics">;
  name: string;
  slug: string;
  description: string;
  icon: string;
  color: string;
  centroid: number[];
  memoryCount: number;
  relatedTopics: Array<{
    topicId: Id<"userTopics">;
    similarity: number;
    edgeType: "related" | "parent" | "child";
  }>;
  parentTopicId?: Id<"userTopics">;
  isArchived: boolean;
  createdAt: number;
  updatedAt: number;
};

function normalizeTopicSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/['’]s\b/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .split("-")
    .filter(Boolean)
    .map((segment) => {
      if (segment.length > 3 && segment.endsWith("ies")) {
        return `${segment.slice(0, -3)}y`;
      }
      if (
        segment.length > 3 &&
        segment.endsWith("s") &&
        !segment.endsWith("ss")
      ) {
        return segment.slice(0, -1);
      }
      return segment;
    })
    .join("-");
}

function findNormalizedTopicMatch(
  topics: TopicRecord[],
  candidate: { name: string; slug: string }
): TopicRecord | null {
  const target = normalizeTopicSlug(candidate.slug || candidate.name);
  return (
    topics.find(
      (topic) =>
        normalizeTopicSlug(topic.slug) === target ||
        normalizeTopicSlug(topic.name) === target
    ) ?? null
  );
}

function fallbackTopicData(title: string): TopicData {
  const fallback = title.split(" ").slice(0, 3).join(" ") || "General";
  return {
    name: fallback,
    slug: normalizeTopicSlug(fallback),
    description: "AI-assigned topic",
    icon: "tag",
    color: TOPIC_COLORS[Math.floor(Math.random() * TOPIC_COLORS.length)],
  };
}

function topicDataFromRequestedName(name: string): TopicData {
  const cleaned = name.trim().replace(/\s+/g, " ");
  const titled =
    cleaned
      .split(" ")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(" ") || "General";
  const slug = normalizeTopicSlug(titled);
  const colorSeed = Array.from(slug).reduce(
    (sum, char) => sum + char.charCodeAt(0),
    0
  );
  return {
    name: titled,
    slug,
    description: `Memories related to ${titled.toLowerCase()}.`,
    icon: "tag",
    color: TOPIC_COLORS[colorSeed % TOPIC_COLORS.length],
  };
}

async function aiCreateTopic(
  title: string,
  content: string,
  existingTopics: Array<{ name: string; description: string }>
): Promise<TopicData> {
  const client = getOpenAIClient();
  if (!client) return fallbackTopicData(title);

  const existingSummary =
    existingTopics.length > 0
      ? existingTopics.map((t) => `"${t.name}" (${t.description || "no description"})`).join(", ")
      : "none";

  const prompt = `You are a personal knowledge organizer. Create a concise, reusable topic label for a memory.
Existing topics (avoid creating duplicates or near-duplicates): ${existingSummary}
Icons available: ${TOPIC_ICONS.join(", ")}
Colors: ${TOPIC_COLORS.join(", ")}
Rules:
- Name must be 2-4 words, broad enough to reuse for similar future memories
- e.g. "Family Names" not "Sister's Name", "Health Records" not "Blood Test Result"
- Do NOT create a topic that already exists or is covered by an existing one
Return ONLY valid JSON: { "name": "Title Case", "slug": "kebab-case", "description": "one sentence", "icon": "feather-icon-name", "color": "#hexcolor" }`;

  try {
    const resp = await client.chat.completions.create({
      model: OPENAI_CHAT_MODEL,
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: `Title: ${title}\nContent: ${content.slice(0, 400)}` },
      ],
      response_format: { type: "json_object" },
      max_tokens: 150,
      temperature: 0,
    });

    const parsed = JSON.parse(resp.choices[0]?.message?.content ?? "{}");
    const parsedName = typeof parsed.name === "string" ? parsed.name : title;
    return {
      name: parsedName,
      slug: normalizeTopicSlug(
        typeof parsed.slug === "string" ? parsed.slug : parsedName
      ),
      description: typeof parsed.description === "string" ? parsed.description : "",
      icon: TOPIC_ICONS.includes(parsed.icon) ? parsed.icon : "tag",
      color: TOPIC_COLORS.includes(parsed.color) ? parsed.color : TOPIC_COLORS[0],
    };
  } catch {
    return fallbackTopicData(title);
  }
}

/**
 * LLM-hybrid topic selection: shows top candidates to the AI and asks it to pick
 * the best existing topic or confirm that a new one is needed.
 * Only called when cosine similarity doesn't give a clear answer (< AUTO_ASSIGN_THRESHOLD).
 */
async function aiSelectOrCreateTopic(
  title: string,
  content: string,
  candidates: Array<{ _id: string; name: string; description: string; similarity: number }>,
  allExistingTopics: Array<{ name: string; description: string }>
): Promise<{ action: "existing"; topicId: string } | { action: "new"; topicData: TopicData }> {
  const client = getOpenAIClient();

  if (!client) {
    // No LLM: use best candidate if similarity is decent, else create new
    if (candidates.length > 0 && candidates[0].similarity >= 0.60) {
      return { action: "existing", topicId: candidates[0]._id };
    }
    return { action: "new", topicData: fallbackTopicData(title) };
  }

  const candidateList = candidates
    .map((c, i) => `${i + 1}. "${c.name}" — ${c.description || "a topic in the user's taxonomy"}`)
    .join("\n");

  const prompt = `You are a personal knowledge organizer assigning a memory to a topic.

Memory: "${title}"
Content: ${content.slice(0, 300)}

Candidate topics already in the user's taxonomy:
${candidateList}

Rules:
- STRONGLY prefer reusing an existing topic if it reasonably fits — even if the match isn't perfect
- "Family Names" fits ANY memory about a family member's name, not just one specific person
- "Health Records" fits any medical memory, even if it's about a different condition
- Only choose "new" if NO candidate is even loosely related to the memory's theme
- Return the index (1-based) of the best candidate, or 0 to create a new topic

Return ONLY valid JSON: {"choice": 0} to create new, or {"choice": 2} to use candidate #2`;

  try {
    const resp = await client.chat.completions.create({
      model: OPENAI_CHAT_MODEL,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 30,
      temperature: 0,
    });

    const raw = JSON.parse(resp.choices[0]?.message?.content ?? "{}");
    const choice = typeof raw.choice === "number" ? raw.choice : 0;
    if (choice >= 1 && choice <= candidates.length) {
      const picked = candidates[choice - 1];
      return { action: "existing", topicId: picked._id };
    }
  } catch {
    // Fall through to create new
  }

  const topicData = await aiCreateTopic(title, content, allExistingTopics);
  return { action: "new", topicData };
}

async function aiReconcileTopicProposal(
  title: string,
  content: string,
  proposedTopic: TopicData,
  existingTopics: TopicRecord[]
): Promise<{ action: "existing"; topicId: Id<"userTopics"> } | { action: "new" }> {
  const client = getOpenAIClient();
  if (!client) {
    const normalizedMatch = findNormalizedTopicMatch(existingTopics, proposedTopic);
    return normalizedMatch
      ? { action: "existing", topicId: normalizedMatch._id }
      : { action: "new" };
  }

  const taxonomy = existingTopics
    .map(
      (topic, index) =>
        `${index + 1}. "${topic.name}" — ${topic.description || "no description"}`
    )
    .join("\n");

  const prompt = `You are validating whether a newly proposed topic is actually necessary.

Memory title: "${title}"
Memory content: ${content.slice(0, 300)}

Proposed new topic:
- Name: ${proposedTopic.name}
- Description: ${proposedTopic.description || "none"}

Existing topics:
${taxonomy || "none"}

Rules:
- Prefer reusing an existing topic whenever the proposal is narrower, more specific, or just a wording variant
- Example: "Mother's Names" should reuse "Family Names"
- Example: "Dad Medical Test" should reuse "Health Records" if that exists
- Return 0 only if none of the existing topics are a reasonable umbrella for this memory

Return ONLY valid JSON: {"choice": 0} for a truly new topic, or {"choice": 3} to reuse topic #3.`;

  try {
    const response = await client.chat.completions.create({
      model: OPENAI_CHAT_MODEL,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 30,
      temperature: 0,
    });
    const parsed = JSON.parse(response.choices[0]?.message?.content ?? "{}");
    const choice = typeof parsed.choice === "number" ? parsed.choice : 0;
    if (choice >= 1 && choice <= existingTopics.length) {
      return {
        action: "existing",
        topicId: existingTopics[choice - 1]._id,
      };
    }
  } catch {
    // Fall through to normalized match / create.
  }

  const normalizedMatch = findNormalizedTopicMatch(existingTopics, proposedTopic);
  return normalizedMatch
    ? { action: "existing", topicId: normalizedMatch._id }
    : { action: "new" };
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
    const topics: TopicRecord[] = await ctx.runQuery(
      internal.userTopics.listWithCentroids,
      {
      userId: args.userId,
      }
    );

    // Cosine score all existing topics
    const scored: Array<TopicRecord & { similarity: number }> = topics
      .map((t: TopicRecord) => ({
        ...t,
        similarity: cosineSimilarity(args.embedding, t.centroid),
      }))
      .sort(
        (
          a: TopicRecord & { similarity: number },
          b: TopicRecord & { similarity: number }
        ) => b.similarity - a.similarity
      );

    // Thresholds:
    //   AUTO_ASSIGN  — clear vector match, skip LLM entirely
    //   SECONDARY    — assign as secondary topic without LLM
    const AUTO_ASSIGN_THRESHOLD = 0.82;
    const SECONDARY_THRESHOLD = 0.62;
    const MAX_TOPICS_PER_USER = 40;
    const MAX_LLM_CANDIDATES = 8;
    const bestMatch = scored[0];
    let primaryTopicId: Id<"userTopics">;

    if (topics.length === 0) {
      // No existing topics — create the first one
      const topicData = await aiCreateTopic(args.title, args.content, []);
      primaryTopicId = await ctx.runMutation(internal.userTopics.createTopic, {
        userId: args.userId,
        ...topicData,
        centroid: args.embedding,
        incrementExistingCount: false,
      });
    } else if (bestMatch.similarity >= AUTO_ASSIGN_THRESHOLD) {
      // Clear vector match — no LLM needed
      primaryTopicId = bestMatch._id;
    } else {
      // Ambiguous — let the LLM review only the strongest ranked candidates.
      const curatedTopics = scored.slice(0, MAX_LLM_CANDIDATES);
      const candidates = curatedTopics.map((t: TopicRecord & { similarity: number }) => ({
          _id: t._id,
          name: t.name,
          description: t.description ?? "",
          similarity: t.similarity,
      }));

      const allExisting = curatedTopics.map((t: TopicRecord & { similarity: number }) => ({
        name: t.name,
        description: t.description ?? "",
      }));

      const result = await aiSelectOrCreateTopic(
        args.title,
        args.content,
        candidates,
        allExisting
      );

      if (result.action === "existing") {
        const matched = scored.find(
          (t: TopicRecord & { similarity: number }) => t._id === result.topicId
        )!;
        primaryTopicId = matched._id;
      } else {
        const reconciled = await aiReconcileTopicProposal(
          args.title,
          args.content,
          result.topicData,
          curatedTopics
        );

        if (reconciled.action === "existing") {
          const matched = topics.find(
            (topic: TopicRecord) => topic._id === reconciled.topicId
          );
          if (!matched) {
            throw new Error("Reconciled topic no longer exists");
          }
          primaryTopicId = matched._id;
        } else {
          // Enforce topic cap by merging the most similar pair before creating
          if (topics.length >= MAX_TOPICS_PER_USER && topics.length >= 2) {
            let maxSim = -1;
            let mergeA = topics[0]._id;
            let mergeB = topics[1]._id;
            for (let i = 0; i < topics.length; i++) {
              for (let j = i + 1; j < topics.length; j++) {
                const s = cosineSimilarity(topics[i].centroid, topics[j].centroid);
                if (s > maxSim) {
                  maxSim = s;
                  mergeA = topics[i]._id;
                  mergeB = topics[j]._id;
                }
              }
            }
            const keepId =
              (topics.find((t: TopicRecord) => t._id === mergeA)?.memoryCount ?? 0) >=
              (topics.find((t: TopicRecord) => t._id === mergeB)?.memoryCount ?? 0)
                ? mergeA
                : mergeB;
            const mergeId = keepId === mergeA ? mergeB : mergeA;
            await ctx.runMutation(internal.userTopics.mergeTopic, {
              keepId,
              mergeId,
            });
          }

          primaryTopicId = await ctx.runMutation(internal.userTopics.createTopic, {
            userId: args.userId,
            ...result.topicData,
            centroid: args.embedding,
            incrementExistingCount: false,
          });
        }
      }
    }

    // Secondary topics: clear vector matches that aren't the primary
    const secondaryMatches = scored
      .filter(
        (t: TopicRecord & { similarity: number }) =>
          t._id !== primaryTopicId && t.similarity >= SECONDARY_THRESHOLD
      )
      .slice(0, 2);

    const nextTopicIds = [
      primaryTopicId,
      ...secondaryMatches.map(
        (t: TopicRecord & { similarity: number }) => t._id as Id<"userTopics">
      ),
    ];

    await ctx.runMutation(internal.memories.setTopics, {
      memoryId: args.memoryId,
      primaryTopicId,
      topicIds: nextTopicIds,
    });

    // Trigger re-analysis every 15 memories
    const updatedTopics = await ctx.runQuery(internal.userTopics.listWithCentroids, { userId: args.userId });
    const totalMemories = updatedTopics.reduce(
      (sum: number, t: TopicRecord) => sum + t.memoryCount,
      0
    );
    if (totalMemories > 0 && totalMemories % 15 === 0) {
      await ctx.scheduler.runAfter(3000, internal.actions.manageTopics.reanalyzeUserTopics, { userId: args.userId });
    }
  },
});

/** Periodic re-analysis: merge near-duplicates, build graph edges. */
export const reanalyzeUserTopics = internalAction({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const memoryTopicRefs = await reconcileUserTopicUsage(ctx, args.userId);

    for (const memory of memoryTopicRefs) {
      await ctx.runMutation(internal.memories.syncTopicLinksForMemory, {
        memoryId: memory._id,
      });
    }

    const topics: TopicRecord[] = await ctx.runQuery(
      internal.userTopics.listWithCentroids,
      {
      userId: args.userId,
      }
    );
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
      v.literal("list"),
      v.literal("retag_memory")
    ),
    topicSlug: v.optional(v.string()),
    targetSlug: v.optional(v.string()),
    newName: v.optional(v.string()),
    newIcon: v.optional(v.string()),
    newColor: v.optional(v.string()),
    memoryId: v.optional(v.id("memories")),
    topicName: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const topics: TopicRecord[] = await ctx.runQuery(
      internal.userTopics.listWithCentroids,
      {
      userId: args.userId,
      }
    );

    if (args.operation === "list") {
      return topics.map((t: TopicRecord) => ({
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

    if (args.operation === "retag_memory") {
      if (!args.memoryId || !args.topicName?.trim()) {
        return {
          success: false,
          message: "retag_memory requires memoryId and topicName",
        };
      }

      const memory: Doc<"memories"> | null = await ctx.runQuery(
        internal.memories.getInternal,
        { memoryId: args.memoryId }
      );
      if (!memory || memory.userId !== args.userId) {
        return { success: false, message: "Memory not found" };
      }

      const requestedTopic = topicDataFromRequestedName(args.topicName);
      const matchedTopic =
        findNormalizedTopicMatch(topics, requestedTopic) ??
        null;

      let targetTopicId: Id<"userTopics">;
      if (matchedTopic) {
        targetTopicId = matchedTopic._id;
      } else {
        const embedding =
          memory.embedding ??
          (await embedText(
            [memory.title ?? "", memory.content ?? ""].filter(Boolean).join("\n\n")
          ));
        targetTopicId = await ctx.runMutation(internal.userTopics.createTopic, {
          userId: args.userId,
          ...requestedTopic,
          centroid: embedding,
          incrementExistingCount: false,
        });
      }

      const retainedSecondaryTopics = (memory.topicIds ?? []).filter(
        (topicId) => topicId !== memory.primaryTopicId && topicId !== targetTopicId
      );
      const nextTopicIds = [targetTopicId, ...retainedSecondaryTopics].slice(0, 3);

      await ctx.runMutation(internal.memories.setTopics, {
        memoryId: memory._id,
        primaryTopicId: targetTopicId,
        topicIds: nextTopicIds,
      });

      return {
        success: true,
        message: `Retagged memory to '${requestedTopic.name}'`,
        topicName: requestedTopic.name,
        topicId: targetTopicId,
      };
    }

    const topic = topics.find((t: TopicRecord) => t.slug === args.topicSlug);
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
      const target = topics.find((t: TopicRecord) => t.slug === args.targetSlug);
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

/** Reconcile topic memory counts for the current user. */
export const reconcileTopics = action({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.runQuery(api.auth.me, { token: args.token });
    if (!session) return;
    await reconcileUserTopicUsage(ctx, session._id);
  },
});
