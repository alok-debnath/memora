# AI Topic Taxonomy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace static `category` enum and `tags` array on memories with a fully AI-owned, per-user topic graph backed by vector centroids and knowledge-graph edges.

**Architecture:** A new `userTopics` Convex table holds AI-generated topic documents (name, icon, color, centroid, graph edges). Memories lose `category`/`tags` and gain `primaryTopicId` (indexed) + `topicIds[]`. An action assigns topics after every memory save using cosine similarity against stored centroids; a re-analysis action merges near-duplicate topics and builds graph edges. The user interacts with topics only through the AI chat panel.

**Tech Stack:** Convex (schema, queries, mutations, actions, scheduler), OpenAI (chat completions + embeddings), React Native / Tamagui (frontend)

---

## File Map

| Action | File |
|--------|------|
| Modify | `convex/schema.ts` |
| Modify | `convex/lib/validators.ts` |
| Modify | `convex/lib/aiNormalization.ts` |
| **Create** | `convex/userTopics.ts` |
| **Create** | `convex/actions/manageTopics.ts` |
| Modify | `convex/memories.ts` |
| Modify | `convex/actions/processMemory.ts` |
| Modify | `convex/actions/processDocument.ts` |
| Modify | `convex/actions/memoryChat.ts` |
| Modify | `convex/dataExport.ts` |
| Modify | `constants/categories.ts` |
| Modify | `constants/colors.ts` |
| Modify | `types/memory.ts` |
| Modify | `components/ui/CategoryPills.tsx` |
| Modify | `components/MemoryCard.tsx` |
| Modify | `components/EditMemorySheet.tsx` |
| Modify | `components/UnifiedCommandPanel.tsx` |
| Modify | `app/(protected)/(tabs)/index.tsx` |
| Modify | `app/(protected)/statistics.tsx` |
| Modify | `app/(protected)/knowledge-graph.tsx` |
| Modify | `app/(protected)/profile.tsx` |

---

## Task 1: Schema + Validators

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/lib/validators.ts`

- [ ] **Step 1: Add `userTopics` table and update `memories` in schema**

Replace the entire `memories` table definition and add `userTopics` in `convex/schema.ts`:

```ts
// Add to imports at top of schema.ts:
// remove: categoryValidator
// keep all others

// Add userTopics table (before closing brace of defineSchema):
userTopics: defineTable({
  userId: v.id("users"),
  name: v.string(),
  slug: v.string(),
  description: v.string(),
  icon: v.string(),
  color: v.string(),
  centroid: v.array(v.float64()),
  memoryCount: v.number(),
  relatedTopics: v.array(v.object({
    topicId: v.id("userTopics"),
    similarity: v.float64(),
    edgeType: v.union(v.literal("related"), v.literal("parent"), v.literal("child")),
  })),
  parentTopicId: v.optional(v.id("userTopics")),
  isArchived: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_user", ["userId"])
  .index("by_user_slug", ["userId", "slug"]),
```

In the `memories` table definition, make these field changes:
- Remove: `category: categoryValidator`
- Remove: `tags: v.optional(v.array(v.string()))`
- Remove: `encryptedTags: v.optional(encryptedEnvelopeValidator)`
- Add: `primaryTopicId: v.optional(v.id("userTopics"))`
- Add: `topicIds: v.optional(v.array(v.id("userTopics")))`
- Remove index: `.index("by_user_category", ["userId", "category"])`
- Add index: `.index("by_user_primaryTopic", ["userId", "primaryTopicId"])`

Also remove `categoryValidator` from the import at the top of `schema.ts`.

- [ ] **Step 2: Remove `categoryValidator` from validators.ts**

In `convex/lib/validators.ts`, delete the entire `categoryValidator` export (lines 16–22).

- [ ] **Step 3: Commit**

```bash
git add convex/schema.ts convex/lib/validators.ts
git commit -m "feat(schema): add userTopics table, remove category/tags from memories"
```

---

## Task 2: `userTopics.ts` — Convex Queries & Mutations

**Files:**
- Create: `convex/userTopics.ts`

- [ ] **Step 1: Create `convex/userTopics.ts`**

```ts
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { resolveUser } from "./lib/withAuth";

// ─── Public queries ───────────────────────────────────────────────────────────

export const list = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    return ctx.db
      .query("userTopics")
      .withIndex("by_user", q => q.eq("userId", userId))
      .filter(q => q.eq(q.field("isArchived"), false))
      .collect();
  },
});

export const get = query({
  args: { token: v.string(), topicId: v.id("userTopics") },
  handler: async (ctx, args) => {
    const { userId } = await resolveUser(ctx, args.token);
    const topic = await ctx.db.get(args.topicId);
    if (!topic || topic.userId !== userId) return null;
    return topic;
  },
});

// ─── Internal queries (used by actions) ──────────────────────────────────────

export const listWithCentroids = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("userTopics")
      .withIndex("by_user", q => q.eq("userId", args.userId))
      .filter(q => q.eq(q.field("isArchived"), false))
      .collect();
  },
});

export const getBySlug = internalQuery({
  args: { userId: v.id("users"), slug: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("userTopics")
      .withIndex("by_user_slug", q => q.eq("userId", args.userId).eq("slug", args.slug))
      .first();
  },
});

export const countActiveTopics = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const topics = await ctx.db
      .query("userTopics")
      .withIndex("by_user", q => q.eq("userId", args.userId))
      .filter(q => q.eq(q.field("isArchived"), false))
      .collect();
    return topics.length;
  },
});

// ─── Internal mutations ───────────────────────────────────────────────────────

export const createTopic = internalMutation({
  args: {
    userId: v.id("users"),
    name: v.string(),
    slug: v.string(),
    description: v.string(),
    icon: v.string(),
    color: v.string(),
    centroid: v.array(v.float64()),
  },
  handler: async (ctx, args) => {
    // Ensure slug is unique per user — append suffix if needed
    const existing = await ctx.db
      .query("userTopics")
      .withIndex("by_user_slug", q => q.eq("userId", args.userId).eq("slug", args.slug))
      .first();
    const slug = existing ? `${args.slug}-${Date.now()}` : args.slug;

    return ctx.db.insert("userTopics", {
      userId: args.userId,
      name: args.name,
      slug,
      description: args.description,
      icon: args.icon,
      color: args.color,
      centroid: args.centroid,
      memoryCount: 1,
      relatedTopics: [],
      isArchived: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const updateCentroidAndCount = internalMutation({
  args: {
    topicId: v.id("userTopics"),
    newCentroid: v.array(v.float64()),
    delta: v.number(), // +1 or -1
  },
  handler: async (ctx, args) => {
    const topic = await ctx.db.get(args.topicId);
    if (!topic) return;
    await ctx.db.patch(args.topicId, {
      centroid: args.newCentroid,
      memoryCount: Math.max(0, topic.memoryCount + args.delta),
      updatedAt: Date.now(),
    });
  },
});

export const updateRelations = internalMutation({
  args: {
    relations: v.array(v.object({
      a: v.id("userTopics"),
      b: v.id("userTopics"),
      similarity: v.float64(),
    })),
  },
  handler: async (ctx, args) => {
    for (const rel of args.relations) {
      const topicA = await ctx.db.get(rel.a);
      const topicB = await ctx.db.get(rel.b);
      if (!topicA || !topicB) continue;

      const upsertEdge = (
        existing: typeof topicA.relatedTopics,
        targetId: Id<"userTopics">,
        similarity: number
      ) => {
        const filtered = existing.filter(e => e.topicId !== targetId);
        return [...filtered, { topicId: targetId, similarity, edgeType: "related" as const }];
      };

      await ctx.db.patch(rel.a, {
        relatedTopics: upsertEdge(topicA.relatedTopics, rel.b, rel.similarity),
        updatedAt: Date.now(),
      });
      await ctx.db.patch(rel.b, {
        relatedTopics: upsertEdge(topicB.relatedTopics, rel.a, rel.similarity),
        updatedAt: Date.now(),
      });
    }
  },
});

export const mergeTopic = internalMutation({
  args: { keepId: v.id("userTopics"), mergeId: v.id("userTopics") },
  handler: async (ctx, args) => {
    const keep = await ctx.db.get(args.keepId);
    const merge = await ctx.db.get(args.mergeId);
    if (!keep || !merge || keep.isArchived || merge.isArchived) return;

    // Re-tag all memories: replace mergeId with keepId
    const allMemories = await ctx.db
      .query("memories")
      .withIndex("by_user", q => q.eq("userId", merge.userId))
      .collect();

    for (const m of allMemories) {
      const hasTopicIds = m.topicIds?.includes(args.mergeId);
      const isPrimary = m.primaryTopicId === args.mergeId;
      if (!hasTopicIds && !isPrimary) continue;

      const newTopicIds = (m.topicIds ?? [])
        .map((id: Id<"userTopics">) => (id === args.mergeId ? args.keepId : id))
        .filter((id: Id<"userTopics">, idx: number, arr: Id<"userTopics">[]) => arr.indexOf(id) === idx);

      await ctx.db.patch(m._id, {
        ...(isPrimary ? { primaryTopicId: args.keepId } : {}),
        topicIds: newTopicIds,
      });
    }

    // Update keep topic: weighted centroid + total count
    const totalCount = keep.memoryCount + merge.memoryCount;
    const newCentroid =
      totalCount > 0
        ? keep.centroid.map((v, i) =>
            (v * keep.memoryCount + merge.centroid[i] * merge.memoryCount) / totalCount
          )
        : keep.centroid;

    await ctx.db.patch(args.keepId, {
      centroid: newCentroid,
      memoryCount: totalCount,
      updatedAt: Date.now(),
    });

    // Archive merged topic
    await ctx.db.patch(args.mergeId, { isArchived: true, updatedAt: Date.now() });
  },
});

export const renameTopic = internalMutation({
  args: {
    topicId: v.id("userTopics"),
    name: v.string(),
    slug: v.string(),
    description: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.topicId, {
      name: args.name,
      slug: args.slug,
      description: args.description,
      updatedAt: Date.now(),
    });
  },
});

export const recolorTopic = internalMutation({
  args: { topicId: v.id("userTopics"), icon: v.string(), color: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.topicId, { icon: args.icon, color: args.color, updatedAt: Date.now() });
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add convex/userTopics.ts
git commit -m "feat(convex): add userTopics module with CRUD and merge logic"
```

---

## Task 3: `manageTopics.ts` — AI Assignment & Re-analysis

**Files:**
- Create: `convex/actions/manageTopics.ts`

- [ ] **Step 1: Create `convex/actions/manageTopics.ts`**

```ts
"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { getOpenAIClient, OPENAI_CHAT_MODEL } from "../lib/openai";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

function incrementalCentroid(old: number[], newVec: number[], oldCount: number): number[] {
  return old.map((v, i) => (v * oldCount + newVec[i]) / (oldCount + 1));
}

const TOPIC_ICONS = [
  "book", "briefcase", "heart", "home", "star", "coffee", "music", "camera",
  "globe", "map", "dollar-sign", "activity", "cpu", "users", "zap", "sun",
  "moon", "cloud", "code", "git-branch", "inbox", "mail", "shopping-cart",
  "tag", "tool", "trending-up", "truck", "tv", "user", "video", "smile",
  "award", "compass", "feather", "layers", "life-buoy", "package", "terminal",
];

const TOPIC_COLORS = [
  "#6366F1", "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6",
  "#EC4899", "#F97316", "#14B8A6", "#84CC16", "#06B6D4", "#A855F7",
];

async function aiCreateTopic(
  title: string,
  content: string,
  existingNames: string[]
): Promise<{ name: string; slug: string; description: string; icon: string; color: string }> {
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
        { role: "user", content: `Title: ${title}\nContent: ${content.slice(0, 400)}` },
      ],
      response_format: { type: "json_object" },
      max_tokens: 150,
    });

    const raw = resp.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    return {
      name: typeof parsed.name === "string" ? parsed.name : title,
      slug: typeof parsed.slug === "string" ? parsed.slug : title.toLowerCase().replace(/\s+/g, "-"),
      description: typeof parsed.description === "string" ? parsed.description : "",
      icon: TOPIC_ICONS.includes(parsed.icon) ? parsed.icon : "tag",
      color: TOPIC_COLORS.includes(parsed.color) ? parsed.color : TOPIC_COLORS[0],
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

    // Score existing topics
    const scored = topics
      .map(t => ({ ...t, similarity: cosineSimilarity(args.embedding, t.centroid) }))
      .sort((a, b) => b.similarity - a.similarity);

    const primaryMatch = scored[0]?.similarity >= PRIMARY_THRESHOLD ? scored[0] : null;
    const secondaryMatches = scored
      .filter(t => t._id !== primaryMatch?._id && t.similarity >= SECONDARY_THRESHOLD)
      .slice(0, 2);

    let primaryTopicId: Id<"userTopics">;

    if (!primaryMatch) {
      // Check topic cap — merge closest pair if needed
      if (topics.length >= MAX_TOPICS_PER_USER && topics.length >= 2) {
        let minSim = Infinity;
        let mergeA = topics[0]._id;
        let mergeB = topics[1]._id;
        for (let i = 0; i < topics.length; i++) {
          for (let j = i + 1; j < topics.length; j++) {
            const s = cosineSimilarity(topics[i].centroid, topics[j].centroid);
            if (s < minSim) { minSim = s; mergeA = topics[i]._id; mergeB = topics[j]._id; }
          }
        }
        const keep = topics.find(t => t._id === mergeA)!;
        const merge = topics.find(t => t._id === mergeB)!;
        const keepId = keep.memoryCount >= merge.memoryCount ? mergeA : mergeB;
        const mergeId = keepId === mergeA ? mergeB : mergeA;
        await ctx.runMutation(internal.userTopics.mergeTopic, { keepId, mergeId });
      }

      // Create new topic
      const existingNames = topics.map(t => t.name);
      const topicData = await aiCreateTopic(args.title, args.content, existingNames);
      primaryTopicId = await ctx.runMutation(internal.userTopics.createTopic, {
        userId: args.userId,
        ...topicData,
        centroid: args.embedding,
      });
    } else {
      primaryTopicId = primaryMatch._id;
      // Update primary topic centroid incrementally
      const newCentroid = incrementalCentroid(primaryMatch.centroid, args.embedding, primaryMatch.memoryCount);
      await ctx.runMutation(internal.userTopics.updateCentroidAndCount, {
        topicId: primaryTopicId,
        newCentroid,
        delta: 1,
      });
    }

    // Update secondary topic counts
    for (const t of secondaryMatches) {
      const newCentroid = incrementalCentroid(t.centroid, args.embedding, t.memoryCount);
      await ctx.runMutation(internal.userTopics.updateCentroidAndCount, {
        topicId: t._id,
        newCentroid,
        delta: 1,
      });
    }

    const topicIds = [primaryTopicId, ...secondaryMatches.map(t => t._id as Id<"userTopics">)];

    // Assign to memory
    await ctx.runMutation(internal.memories.setTopics, {
      memoryId: args.memoryId,
      primaryTopicId,
      topicIds,
    });

    // Trigger re-analysis every 15 new memories
    const updatedTopics = await ctx.runQuery(internal.userTopics.listWithCentroids, { userId: args.userId });
    const totalMemories = updatedTopics.reduce((sum, t) => sum + t.memoryCount, 0);
    if (totalMemories > 0 && totalMemories % 15 === 0) {
      await ctx.scheduler.runAfter(3000, internal.actions.manageTopics.reanalyzeUserTopics, {
        userId: args.userId,
      });
    }
  },
});

/** Periodic re-analysis: merge near-duplicates, build graph edges. */
export const reanalyzeUserTopics = internalAction({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const topics = await ctx.runQuery(internal.userTopics.listWithCentroids, { userId: args.userId });
    if (topics.length < 2) return;

    const MERGE_THRESHOLD = 0.92;
    const RELATE_THRESHOLD = 0.72;

    const merges: Array<{ keepId: Id<"userTopics">; mergeId: Id<"userTopics"> }> = [];
    const relations: Array<{ a: Id<"userTopics">; b: Id<"userTopics">; similarity: number }> = [];
    const mergedIds = new Set<string>();

    for (let i = 0; i < topics.length; i++) {
      for (let j = i + 1; j < topics.length; j++) {
        if (mergedIds.has(topics[i]._id) || mergedIds.has(topics[j]._id)) continue;
        const sim = cosineSimilarity(topics[i].centroid, topics[j].centroid);

        if (sim >= MERGE_THRESHOLD) {
          const keepIdx = topics[i].memoryCount >= topics[j].memoryCount ? i : j;
          const mergeIdx = keepIdx === i ? j : i;
          merges.push({ keepId: topics[keepIdx]._id, mergeId: topics[mergeIdx]._id });
          mergedIds.add(topics[mergeIdx]._id);
        } else if (sim >= RELATE_THRESHOLD) {
          relations.push({ a: topics[i]._id, b: topics[j]._id, similarity: sim });
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
    ),
    topicSlug: v.optional(v.string()),
    targetSlug: v.optional(v.string()),
    newName: v.optional(v.string()),
    newIcon: v.optional(v.string()),
    newColor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const topics = await ctx.runQuery(internal.userTopics.listWithCentroids, { userId: args.userId });

    if (args.operation === "list") {
      return topics.map(t => ({ name: t.name, slug: t.slug, memoryCount: t.memoryCount }));
    }

    if (args.operation === "trigger_reanalysis") {
      await ctx.scheduler.runAfter(0, internal.actions.manageTopics.reanalyzeUserTopics, { userId: args.userId });
      return { success: true, message: "Re-analysis scheduled" };
    }

    const topic = topics.find(t => t.slug === args.topicSlug);
    if (!topic) return { success: false, message: `Topic '${args.topicSlug}' not found` };

    if (args.operation === "rename" && args.newName) {
      const newSlug = args.newName.toLowerCase().replace(/\s+/g, "-");
      const client = getOpenAIClient();
      let description = topic.description;
      if (client) {
        try {
          const resp = await client.chat.completions.create({
            model: OPENAI_CHAT_MODEL,
            messages: [{ role: "user", content: `Write a one-sentence description for a personal memory topic called "${args.newName}". Be concise.` }],
            max_tokens: 60,
          });
          description = resp.choices[0]?.message?.content?.trim() ?? description;
        } catch { /* use existing */ }
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
      const target = topics.find(t => t.slug === args.targetSlug);
      if (!target) return { success: false, message: `Target topic '${args.targetSlug}' not found` };
      const keepId = topic.memoryCount >= target.memoryCount ? topic._id : target._id;
      const mergeId = keepId === topic._id ? target._id : topic._id;
      await ctx.runMutation(internal.userTopics.mergeTopic, { keepId, mergeId });
      return { success: true, message: `Merged into '${topics.find(t => t._id === keepId)?.name}'` };
    }

    if (args.operation === "recolor") {
      const icon = TOPIC_ICONS.includes(args.newIcon ?? "") ? args.newIcon! : topic.icon;
      const color = TOPIC_COLORS.includes(args.newColor ?? "") ? args.newColor! : topic.color;
      await ctx.runMutation(internal.userTopics.recolorTopic, { topicId: topic._id, icon, color });
      return { success: true, message: "Topic updated" };
    }

    return { success: false, message: "Unknown operation" };
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add convex/actions/manageTopics.ts
git commit -m "feat(convex): add manageTopics action — AI assignment + re-analysis"
```

---

## Task 4: Update `memories.ts`

**Files:**
- Modify: `convex/memories.ts`

- [ ] **Step 1: Add internal `setTopics` mutation**

Add this internal mutation to `convex/memories.ts`:

```ts
export const setTopics = internalMutation({
  args: {
    memoryId: v.id("memories"),
    primaryTopicId: v.id("userTopics"),
    topicIds: v.array(v.id("userTopics")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.memoryId, {
      primaryTopicId: args.primaryTopicId,
      topicIds: args.topicIds,
    });
  },
});
```

- [ ] **Step 2: Update `list` query — remove category/tags, add topic filtering**

In the `list` query in `convex/memories.ts`:
- Remove the `category` arg and the `by_user_category` index branch
- Remove any `tags` text search filtering
- Add `primaryTopicId` optional arg and filter:

```ts
// In list query args, replace:
//   category: v.optional(categoryValidator),
// with:
primaryTopicId: v.optional(v.id("userTopics")),
```

In the handler, replace the category index branch:
```ts
// Replace the category index branch with:
if (args.primaryTopicId) {
  page = await ctx.db
    .query("memories")
    .withIndex("by_user_primaryTopic", q =>
      q.eq("userId", args.userId).eq("primaryTopicId", args.primaryTopicId!)
    )
    .order("desc")
    .paginate(paginationOpts);
} else {
  page = await ctx.db
    .query("memories")
    .withIndex("by_user", q => q.eq("userId", args.userId))
    .order("desc")
    .paginate(paginationOpts);
}
```

Also remove the tag search line:
```ts
// Remove this line from text search:
// (m.tags ?? []).some((tag) => tag.toLowerCase().includes(queryLower)) ||
```

- [ ] **Step 3: Update `create` mutation — remove category/tags**

In the `create` mutation args, remove:
```ts
// Remove:
category: categoryValidator,
tags: v.optional(v.array(v.string())),
```

In the handler, remove `category` and `tags` from the `ctx.db.insert` call.

- [ ] **Step 4: Update `update` mutation — remove category/tags**

In the `update` mutation args, remove:
```ts
// Remove:
category: v.optional(categoryValidator),
tags: v.optional(v.array(v.string())),
```

In the handler, remove `...(args.category !== undefined ? { category: args.category } : {})` and the same for `tags`.

- [ ] **Step 5: Update `stats` query — topics instead of categories**

In `convex/memories.ts` `stats` query handler, replace the `categoryCounts` block:

```ts
// Replace the categoryCounts accumulation with topicCounts:
const topicCounts: Record<string, number> = {};
for (const m of allMemories) {
  for (const tid of m.topicIds ?? []) {
    const key = tid as string;
    topicCounts[key] = (topicCounts[key] ?? 0) + 1;
  }
}
```

And in the return object, replace:
```ts
// Replace:
//   categories: Object.keys(categoryCounts).length,
//   categoryCounts,
// with:
topicCount: Object.keys(topicCounts).length,
topicCounts,
```

- [ ] **Step 6: Remove `categoryValidator` import from `memories.ts`**

Remove `categoryValidator` from the import in `convex/memories.ts`.

- [ ] **Step 7: Commit**

```bash
git add convex/memories.ts
git commit -m "feat(convex): update memories — topic-based filtering, remove category/tags"
```

---

## Task 5: Update `aiNormalization.ts` + `processMemory.ts`

**Files:**
- Modify: `convex/lib/aiNormalization.ts`
- Modify: `convex/actions/processMemory.ts`

- [ ] **Step 1: Update `aiNormalization.ts` — remove category/tags**

In `convex/lib/aiNormalization.ts`:

Remove the `MEMORY_CATEGORIES` set and `MemoryCategory` type.

In `normalizeMemoryFields`, remove:
```ts
// Remove from return:
//   category: asEnumValue<MemoryCategory>(value.category, MEMORY_CATEGORIES),
//   tags: asStringArray(value.tags),
```

In `normalizeDocumentMemory`, change to:
```ts
export function normalizeDocumentMemory(value: Record<string, unknown>) {
  return {
    title: asTrimmedString(value.title),
    content: asTrimmedString(value.content),
    importance: asEnumValue<MemoryImportance>(value.importance, MEMORY_IMPORTANCE) ?? "normal",
    people: asStringArray(value.people) ?? [],
    locations: asStringArray(value.locations) ?? [],
  };
}
```

- [ ] **Step 2: Update `processMemory.ts` — remove category/tags from AI prompt and call assignTopicsToMemory**

In `convex/actions/processMemory.ts`:

Remove `category` and `tags` from the `AIExtractedMemory` type, the AI prompt description, the JSON schema in the tool call, and the `ctx.db.insert` call.

Add after the memory is saved (where `memoryId` is returned):
```ts
// Schedule topic assignment
if (memoryId && savedEmbedding) {
  await ctx.scheduler.runAfter(0, internal.actions.manageTopics.assignTopicsToMemory, {
    memoryId,
    userId: args.userId ?? resolvedUserId,
    title: normalized.title ?? "",
    content: normalized.content ?? "",
    embedding: savedEmbedding,
  });
}
```

Also update the system prompt to remove category/tags instructions. Replace the category line in the prompt with:
```
Do NOT include category or tags — those are handled separately.
```

- [ ] **Step 3: Commit**

```bash
git add convex/lib/aiNormalization.ts convex/actions/processMemory.ts
git commit -m "feat(convex): remove category/tags from AI extraction, schedule topic assignment"
```

---

## Task 6: Update `processDocument.ts`

**Files:**
- Modify: `convex/actions/processDocument.ts`

- [ ] **Step 1: Remove category/tags from document extraction**

In `convex/actions/processDocument.ts`:

Remove `category` and `tags` from `ExtractedDocumentResult.memories` type.

Update the AI prompt to remove `category, tags` from the memories array description.

Update the `normalizeDocumentMemory` call — it now returns no `category`/`tags`.

After saving each extracted memory document, schedule topic assignment:
```ts
// After ctx.runMutation to save each memory, get the returned memoryId and:
if (memoryId && memoryEmbedding) {
  await ctx.scheduler.runAfter(0, internal.actions.manageTopics.assignTopicsToMemory, {
    memoryId,
    userId: args.userId,
    title: m.title ?? "",
    content: m.content ?? "",
    embedding: memoryEmbedding,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add convex/actions/processDocument.ts
git commit -m "feat(convex): remove category/tags from document extraction, schedule topic assignment"
```

---

## Task 7: Update `memoryChat.ts` — `manage_topics` tool

**Files:**
- Modify: `convex/actions/memoryChat.ts`

- [ ] **Step 1: Remove `category`/`tags` from `create_memory` and `update_memory` tools**

In `convex/actions/memoryChat.ts`, in the `TOOLS` array:

For `create_memory`: remove `category` and `tags` from properties and from `required`.
For `update_memory`: remove `category` and `tags` from properties.

Also remove `MemoryCategory` local type declaration (line ~21).

- [ ] **Step 2: Add `manage_topics` tool**

Add to the `TOOLS` array in `memoryChat.ts`:

```ts
{
  type: "function",
  function: {
    name: "manage_topics",
    description:
      "Manage the user's AI topic taxonomy. Use when user wants to rename a topic, merge topics, ask about their topics, change a topic's appearance, or trigger a re-analysis pass.",
    parameters: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: ["rename", "merge", "recolor", "trigger_reanalysis", "list"],
          description: "The operation to perform",
        },
        topicSlug: {
          type: "string",
          description: "Slug of the topic to operate on (required for rename, merge, recolor)",
        },
        targetSlug: {
          type: "string",
          description: "For merge: the slug of the topic to merge INTO (the one to keep)",
        },
        newName: {
          type: "string",
          description: "For rename: the new topic name",
        },
        newIcon: {
          type: "string",
          description: "For recolor: Feather icon name",
        },
        newColor: {
          type: "string",
          description: "For recolor: hex color string",
        },
      },
      required: ["operation"],
      additionalProperties: false,
    },
  },
},
```

- [ ] **Step 3: Add handler for `manage_topics` in the tool dispatch block**

In the tool-call dispatch section (around line 572), add:

```ts
} else if (fnName === "manage_topics") {
  const parsed = JSON.parse(fnArgs);
  const result = await ctx.runAction(internal.actions.manageTopics.handleManageTopic, {
    userId: resolvedUserId,
    operation: parsed.operation,
    topicSlug: parsed.topicSlug,
    targetSlug: parsed.targetSlug,
    newName: parsed.newName,
    newIcon: parsed.newIcon,
    newColor: parsed.newColor,
  });
  toolResults.push({
    tool_call_id: toolCall.id,
    role: "tool" as const,
    content: JSON.stringify(result),
  });
```

Also update the `create_memory` and `update_memory` handlers to remove `category` and `tags` from the mutation args they pass.

- [ ] **Step 4: Commit**

```bash
git add convex/actions/memoryChat.ts
git commit -m "feat(convex): add manage_topics tool to AI chat, remove category/tags from memory tools"
```

---

## Task 8: Update `dataExport.ts`

**Files:**
- Modify: `convex/dataExport.ts`

- [ ] **Step 1: Replace category/tags with topics in export**

In `convex/dataExport.ts`, update the memories export to include `primaryTopicId` and `topicIds` instead of `category` and `tags`:

```ts
// In the memories map, replace:
//   category: m.category,
//   tags: m.tags,
// with:
primaryTopicId: m.primaryTopicId,
topicIds: m.topicIds ?? [],
```

Also add topics to the export:
```ts
// After memories fetch, add:
const topics = await ctx.db
  .query("userTopics")
  .withIndex("by_user", q => q.eq("userId", userId))
  .collect();

// Include in return:
topics: topics.map(t => ({
  id: t._id,
  name: t.name,
  slug: t.slug,
  description: t.description,
  icon: t.icon,
  color: t.color,
  memoryCount: t.memoryCount,
  relatedTopics: t.relatedTopics,
})),
```

- [ ] **Step 2: Commit**

```bash
git add convex/dataExport.ts
git commit -m "feat(convex): update data export to include topics, remove category/tags"
```

---

## Task 9: Frontend — Types + Constants Cleanup

**Files:**
- Modify: `constants/categories.ts`
- Modify: `constants/colors.ts`
- Modify: `types/memory.ts`

- [ ] **Step 1: Update `constants/categories.ts` — remove Category, keep Mood/LifeArea**

Replace the entire file contents with:

```ts
import { Feather } from "@expo/vector-icons";

// Category and tags have been replaced by AI-driven topics (userTopics).
// This file retains only mood, importance, and life area constants.

export type Mood =
  | "happy" | "sad" | "anxious" | "excited" | "neutral"
  | "grateful" | "frustrated" | "hopeful" | "nostalgic" | "motivated";

export type Importance = "critical" | "high" | "normal" | "low";

export type LifeArea =
  | "career" | "family" | "health" | "finance" | "social"
  | "hobbies" | "education" | "travel" | "self-care" | "relationships";

export const moodIcons: Record<Mood, keyof typeof Feather.glyphMap> = {
  happy: "smile", sad: "frown", anxious: "alert-circle", excited: "zap",
  neutral: "minus-circle", grateful: "gift", frustrated: "cloud-lightning",
  hopeful: "sunrise", nostalgic: "clock", motivated: "trending-up",
};

export const moodLabels: Record<Mood, string> = {
  happy: "Happy", sad: "Sad", anxious: "Anxious", excited: "Excited",
  neutral: "Neutral", grateful: "Grateful", frustrated: "Frustrated",
  hopeful: "Hopeful", nostalgic: "Nostalgic", motivated: "Motivated",
};

export const importanceLabels: Record<Importance, string> = {
  critical: "Critical", high: "High", normal: "Normal", low: "Low",
};

export const importanceColors: Record<Importance, string> = {
  critical: "#DC2626", high: "#F59E0B", normal: "#3B82F6", low: "#6B7280",
};

export const lifeAreaLabels: Record<LifeArea, string> = {
  career: "Career", family: "Family", health: "Health", finance: "Finance",
  social: "Social", hobbies: "Hobbies", education: "Education",
  travel: "Travel", "self-care": "Self-care", relationships: "Relationships",
};
```

- [ ] **Step 2: Remove `categoryColors` from `constants/colors.ts`**

Delete the `categoryColors` export from `constants/colors.ts` (the Record mapping personal/work/finance/health/other to hex colors).

- [ ] **Step 3: Update `types/memory.ts`**

In `types/memory.ts`, replace `category: Category` and `tags: string[]` with:

```ts
// Remove:
//   category: Category;
//   tags: string[];
// Add:
primaryTopicId?: string;
topicIds?: string[];
```

Also remove the `Category` import from `@/constants/categories`.

Add a new `UserTopic` type at the top of the file (or in a new `types/topic.ts`):

```ts
export type UserTopic = {
  _id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  color: string;
  memoryCount: number;
  relatedTopics: Array<{
    topicId: string;
    similarity: number;
    edgeType: "related" | "parent" | "child";
  }>;
  parentTopicId?: string;
  isArchived: boolean;
};
```

- [ ] **Step 4: Commit**

```bash
git add constants/categories.ts constants/colors.ts types/memory.ts
git commit -m "feat(frontend): remove Category/tags types, add UserTopic type"
```

---

## Task 10: `TopicPills` Component + `MemoryCard`

**Files:**
- Modify: `components/ui/CategoryPills.tsx`
- Modify: `components/MemoryCard.tsx`

- [ ] **Step 1: Rewrite `CategoryPills.tsx` as `TopicPills`**

Replace the entire file `components/ui/CategoryPills.tsx`:

```tsx
import React from "react";
import { ScrollView } from "react-native";
import { XStack, Text, YStack } from "tamagui";
import { Feather } from "@expo/vector-icons";
import { useAppTheme } from "@/hooks/useAppTheme";
import { PressableScale } from "@/components/ui/PressableScale";
import type { UserTopic } from "@/types/memory";

interface TopicPillsProps {
  topics: UserTopic[];
  selected: string | null; // topic _id or null
  onSelect: (topicId: string | null) => void;
}

export function CategoryPills({ topics, selected, onSelect }: TopicPillsProps) {
  const theme = useAppTheme();

  if (topics.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
    >
      {/* All pill */}
      <PressableScale onPress={() => onSelect(null)}>
        <XStack
          paddingHorizontal={12}
          paddingVertical={6}
          borderRadius={999}
          backgroundColor={selected === null ? theme.primary.val + "22" : "$secondary"}
          borderWidth={1}
          borderColor={selected === null ? theme.primary.val : "$borderColor"}
          alignItems="center"
          gap={5}
        >
          <Text
            fontSize={12}
            fontWeight="700"
            color={selected === null ? "$primary" : "$colorMuted"}
          >
            All
          </Text>
        </XStack>
      </PressableScale>

      {topics.map(topic => {
        const isActive = selected === topic._id;
        return (
          <PressableScale key={topic._id} onPress={() => onSelect(isActive ? null : topic._id)}>
            <XStack
              paddingHorizontal={12}
              paddingVertical={6}
              borderRadius={999}
              backgroundColor={isActive ? topic.color + "22" : "$secondary"}
              borderWidth={1}
              borderColor={isActive ? topic.color : "$borderColor"}
              alignItems="center"
              gap={5}
            >
              <Feather
                name={topic.icon as any}
                size={12}
                color={isActive ? topic.color : theme.colorMuted.val}
              />
              <Text
                fontSize={12}
                fontWeight="700"
                color={isActive ? topic.color : "$colorMuted" as any}
              >
                {topic.name}
              </Text>
              {topic.memoryCount > 0 && (
                <YStack
                  minWidth={18}
                  height={18}
                  borderRadius={999}
                  paddingHorizontal={4}
                  alignItems="center"
                  justifyContent="center"
                  backgroundColor={isActive ? topic.color + "33" : "$borderColor"}
                >
                  <Text fontSize={10} fontWeight="700" color={isActive ? topic.color : "$colorMuted" as any}>
                    {topic.memoryCount}
                  </Text>
                </YStack>
              )}
            </XStack>
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}
```

- [ ] **Step 2: Update `MemoryCard` — replace category chip + tags with topic pills**

In `components/MemoryCard.tsx`:

Add `topics` prop (array of `UserTopic`) to the component props interface:
```ts
topics?: UserTopic[];
```

Replace the category icon + label rendering with topic rendering:
```tsx
// Replace the category chip block with:
{props.topics && props.topics.length > 0 && (() => {
  const primaryTopic = props.topics!.find(t => t._id === memory.primaryTopicId);
  if (!primaryTopic) return null;
  return (
    <XStack
      paddingHorizontal={8}
      paddingVertical={3}
      borderRadius={999}
      backgroundColor={primaryTopic.color + "18"}
      alignItems="center"
      gap={4}
    >
      <Feather name={primaryTopic.icon as any} size={11} color={primaryTopic.color} />
      <Text fontSize={11} fontWeight="600" style={{ color: primaryTopic.color }}>
        {primaryTopic.name}
      </Text>
    </XStack>
  );
})()}
```

Replace the tags row (currently shows `memory.tags.slice(0,2)`) with secondary topic pills:
```tsx
// Replace tags section with:
{props.topics && (memory.topicIds ?? []).length > 1 && (
  <XStack gap={6} flexWrap="wrap">
    {(memory.topicIds ?? [])
      .filter(id => id !== memory.primaryTopicId)
      .slice(0, 2)
      .map(id => {
        const t = props.topics!.find(tp => tp._id === id);
        if (!t) return null;
        return (
          <XStack key={id} paddingHorizontal={6} paddingVertical={2} borderRadius={999}
            backgroundColor={t.color + "12"} alignItems="center" gap={3}>
            <Text fontSize={10} style={{ color: t.color }}>{t.name}</Text>
          </XStack>
        );
      })}
  </XStack>
)}
```

Remove `categoryColors`, `categoryLabels`, `categoryIcons` imports from MemoryCard.

- [ ] **Step 3: Commit**

```bash
git add components/ui/CategoryPills.tsx components/MemoryCard.tsx
git commit -m "feat(frontend): TopicPills component, MemoryCard uses AI topics"
```

---

## Task 11: `EditMemorySheet` + `UnifiedCommandPanel`

**Files:**
- Modify: `components/EditMemorySheet.tsx`
- Modify: `components/UnifiedCommandPanel.tsx`

- [ ] **Step 1: Update `EditMemorySheet` — remove category/tags, add topic display**

In `components/EditMemorySheet.tsx`:
- Remove `PickerField` for category
- Remove `TagInput` for tags
- Remove `MANUAL_OPTIONS` (Manual/Voice) is unrelated — keep it
- Remove `categoryOptions` and `moodOptions` that use category
- Remove `category` and `tags` from the state and `createInitialState`
- Remove `category` and `tags` from the `onSave` data

Add a topics read-only section. Add a prop `topics?: UserTopic[]`:
```tsx
// After the title/content inputs, add:
{props.topics && props.topics.length > 0 && (
  <YStack gap={8}>
    <Text fontSize={12} fontWeight="600" color="$colorMuted" textTransform="uppercase" letterSpacing={0.8}>
      Topics
    </Text>
    <XStack gap={8} flexWrap="wrap">
      {(memory.topicIds ?? []).map(id => {
        const t = props.topics!.find(tp => tp._id === id);
        if (!t) return null;
        return (
          <XStack key={id} paddingHorizontal={10} paddingVertical={5} borderRadius={999}
            backgroundColor={t.color + "18"} borderWidth={1} borderColor={t.color + "33"}
            alignItems="center" gap={5}>
            <Feather name={t.icon as any} size={12} color={t.color} />
            <Text fontSize={12} fontWeight="600" style={{ color: t.color }}>{t.name}</Text>
          </XStack>
        );
      })}
    </XStack>
    <Text fontSize={11} color="$colorMuted">
      Topics are AI-managed. Ask the AI to change them.
    </Text>
  </YStack>
)}
```

- [ ] **Step 2: Update `UnifiedCommandPanel` — remove category/tags from new memory form**

In `components/UnifiedCommandPanel.tsx`:
- Remove any `PickerField` or `SegmentedControl` for category
- Remove `TagInput` for tags
- Remove related state variables (`selectedCategory`, `noteTags`, etc.) if present

The note form should only have: Time Capsule toggle + note text input + save button.

- [ ] **Step 3: Commit**

```bash
git add components/EditMemorySheet.tsx components/UnifiedCommandPanel.tsx
git commit -m "feat(frontend): remove category/tags from edit sheet and new memory form"
```

---

## Task 12: Home Screen + Statistics + Knowledge Graph

**Files:**
- Modify: `app/(protected)/(tabs)/index.tsx`
- Modify: `app/(protected)/statistics.tsx`
- Modify: `app/(protected)/knowledge-graph.tsx`
- Modify: `app/(protected)/profile.tsx`

- [ ] **Step 1: Update `index.tsx` — TopicPills, topic-based filtering**

In `app/(protected)/(tabs)/index.tsx`:

Add `userTopics` query:
```ts
const userTopics = useQuery(api.userTopics.list, token ? { token } : "skip") ?? [];
```

Replace `selectedCategory` state with `selectedTopicId`:
```ts
const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
```

Update the `CategoryPills` component call:
```tsx
<CategoryPills
  topics={userTopics}
  selected={selectedTopicId}
  onSelect={setSelectedTopicId}
/>
```

Update the `memoryResult` query to pass `primaryTopicId`:
```ts
const memoryResult = useQuery(
  api.memories.list,
  token ? { token, limit: pageSize, ...(selectedTopicId ? { primaryTopicId: selectedTopicId as any } : {}) } : "skip"
);
```

Update `filteredMemories` to use `selectedTopicId` instead of `selectedCategory`:
```ts
// In the non-search path:
return selectedTopicId
  ? allMemories.filter(m => m.topicIds?.includes(selectedTopicId as any))
  : allMemories;
```

Pass `topics` to each `MemoryCard`:
```tsx
<MemoryCard
  key={raw._id}
  memory={note}
  topics={userTopics}
  // ... other props
/>
```

Remove `stats?.categoryCounts` usage from `CategoryPills` — it no longer needs it (counts come from topic.memoryCount).

Update the "coming up" footer to remove category references.

Remove `categoryLabels` import.

- [ ] **Step 2: Update `statistics.tsx` — topic breakdown**

In `app/(protected)/statistics.tsx`:

Add topics query:
```ts
const userTopics = useQuery(api.userTopics.list, token ? { token } : "skip") ?? [];
```

Replace the category breakdown section with a topic breakdown:
```tsx
{userTopics.length > 0 && (
  <SectionCard title="Topics">
    <YStack gap={8}>
      {[...userTopics].sort((a, b) => b.memoryCount - a.memoryCount).map(topic => (
        <XStack key={topic._id} alignItems="center" gap={12}>
          <YStack width={32} height={32} borderRadius={10} alignItems="center" justifyContent="center"
            backgroundColor={topic.color + "18"}>
            <Feather name={topic.icon as any} size={16} color={topic.color} />
          </YStack>
          <YStack flex={1} gap={2}>
            <Text fontSize={14} fontWeight="600" color="$color">{topic.name}</Text>
            <Text fontSize={11} color="$colorMuted">{topic.description}</Text>
          </YStack>
          <YStack minWidth={28} height={24} borderRadius={999} paddingHorizontal={8}
            backgroundColor={topic.color + "18"} alignItems="center" justifyContent="center">
            <Text fontSize={12} fontWeight="700" style={{ color: topic.color }}>
              {topic.memoryCount}
            </Text>
          </YStack>
        </XStack>
      ))}
    </YStack>
  </SectionCard>
)}
```

Remove `categoryLabels`, `categoryColors`, `categoryIcons` imports.

- [ ] **Step 3: Rebuild `knowledge-graph.tsx` — actual topic graph**

Replace the body of `app/(protected)/knowledge-graph.tsx` with a topic relationship view:

```tsx
// Fetch topics
const userTopics = useQuery(api.userTopics.list, token ? { token } : "skip") ?? [];

// Render: a grid of topic cards, each showing related topics
// For each topic, show its related topics as "linked" chips below it
return (
  <AppScreen title="Knowledge Graph" /* back button etc */>
    {userTopics.length === 0 ? (
      <EmptyState icon="share-2" title="No topics yet"
        description="Save some memories and the AI will build your topic graph." />
    ) : (
      <YStack gap={12}>
        {userTopics.map(topic => {
          const related = topic.relatedTopics
            .map(r => userTopics.find(t => t._id === r.topicId))
            .filter(Boolean);
          return (
            <SectionCard
              key={topic._id}
              title={topic.name}
              action={<Badge label={`${topic.memoryCount}`} color={topic.color} small />}
            >
              <XStack alignItems="center" gap={10} marginBottom={related.length > 0 ? 10 : 0}>
                <YStack width={40} height={40} borderRadius={14} alignItems="center"
                  justifyContent="center" backgroundColor={topic.color + "18"}>
                  <Feather name={topic.icon as any} size={20} color={topic.color} />
                </YStack>
                <Text fontSize={13} color="$colorMuted" flex={1}>{topic.description}</Text>
              </XStack>
              {related.length > 0 && (
                <YStack gap={6}>
                  <Text fontSize={11} color="$colorMuted" textTransform="uppercase" letterSpacing={0.8}>
                    Related
                  </Text>
                  <XStack gap={6} flexWrap="wrap">
                    {related.map(r => r && (
                      <XStack key={r._id} paddingHorizontal={10} paddingVertical={4} borderRadius={999}
                        backgroundColor={r.color + "15"} borderWidth={1} borderColor={r.color + "30"}
                        alignItems="center" gap={4}>
                        <Feather name={r.icon as any} size={11} color={r.color} />
                        <Text fontSize={12} fontWeight="600" style={{ color: r.color }}>{r.name}</Text>
                      </XStack>
                    ))}
                  </XStack>
                </YStack>
              )}
            </SectionCard>
          );
        })}
      </YStack>
    )}
  </AppScreen>
);
```

- [ ] **Step 4: Update `profile.tsx` — remove category references**

In `app/(protected)/profile.tsx`, remove any remaining imports or references to `categoryLabels`, `categoryColors`, `categoryIcons`, or `Category`. The stats cards already use `memoryStats.totalMemories` and `memoryStats.totalReminders` — no category-specific display needed.

- [ ] **Step 5: Commit**

```bash
git add app/(protected)/(tabs)/index.tsx app/(protected)/statistics.tsx \
  app/(protected)/knowledge-graph.tsx app/(protected)/profile.tsx
git commit -m "feat(frontend): home/stats/knowledge-graph use AI topic system"
```

---

## Task 13: Run `npx convex dev` + Fix Type Errors

- [ ] **Step 1: Run Convex dev to regenerate types and check for errors**

```bash
cd /home/alok/Documents/PersonalProjects/memora
npx convex dev --once
```

Expected: Convex pushes schema, regenerates `_generated/`. Watch for:
- Schema validation errors (field type mismatches)
- Missing index errors
- TypeScript errors in Convex functions

- [ ] **Step 2: Fix any remaining TypeScript errors**

Common issues to watch for:
- Any remaining `memory.category` or `memory.tags` access in frontend components — replace with `memory.primaryTopicId` / `memory.topicIds`
- `categoryValidator` still imported anywhere — remove it
- `categoryLabels[memory.category]` calls — remove or replace with topic name lookup
- `CategoryPills` prop interface mismatch — ensure callers pass `topics` array
- `MemoryCard` callers not passing `topics` prop — add the prop
- `stats.categoryCounts` usage — replace with `stats.topicCounts`

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "fix: resolve TypeScript errors after topic taxonomy migration"
```
