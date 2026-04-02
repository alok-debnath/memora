# AI-Driven Topic Taxonomy Design

**Date:** 2026-04-03
**Status:** Approved

## Overview

Replace the static `category` enum and free-form `tags` array on memories with a fully AI-owned, per-user topic graph. Topics are named, coloured, icon-tagged documents with vector centroids and graph edges to related topics. The user never edits topics directly — they speak to the AI, which manages the taxonomy on their behalf.

## Data Model

### New `userTopics` table

```ts
{
  userId: Id<"users">
  name: string                  // "Machine Learning", "Morning Routines"
  slug: string                  // "machine-learning" — unique per user
  description: string           // AI-written one-liner
  icon: string                  // Feather icon name
  color: string                 // hex color
  centroid: float64[]           // averaged embedding of member memories
  memoryCount: number           // maintained incrementally
  relatedTopics: Array<{
    topicId: Id<"userTopics">
    similarity: number
    edgeType: "related" | "parent" | "child"
  }>
  parentTopicId?: Id<"userTopics">
  isArchived: boolean
  createdAt: number
  updatedAt: number
}
```

Indexes: `by_user` on `["userId"]`, `by_user_slug` on `["userId", "slug"]`.

### `memories` table changes

- **Remove:** `category` (union), `tags` (string[]), `encryptedTags`
- **Add:** `primaryTopicId?: Id<"userTopics">` — indexed via `by_user_primaryTopic`
- **Add:** `topicIds: Id<"userTopics">[]` — 1–3 per memory
- **Keep:** `mood`, `people`, `locations`, `lifeArea`, `contextTags`, `importance`

## AI Behaviour

### On every memory save

1. Load user's existing topics (slug + centroid)
2. Reuse the memory's embedding (already computed)
3. Cosine-compare against all centroids
4. `> 0.82` → assign as primary topic; update centroid incrementally, increment `memoryCount`
5. `0.65–0.82` → assign as secondary topic (in `topicIds`, not `primaryTopicId`)
6. `< 0.65` (or no topics exist) → AI creates a new topic: name, icon, color, description; centroid = this embedding
7. Cap: max 3 topics per memory, max 40 topics per user (merge closest pair before creating when cap hit)

### Re-analysis pass

Triggered every 15 new memories or via AI chat `trigger_reanalysis`.

1. Load all topic centroids — O(topics²) comparisons, ≤ 1600 for 40 topics
2. Similarity `> 0.92` → silent merge: absorb smaller into larger, re-tag all its memories, archive it
3. Similarity `0.72–0.92` → upsert `relatedTopics` graph edge
4. Centroid of merged topic = weighted average of both centroids

### AI chat tools

New `manage_topics` tool added to `memoryChat.ts`:

```
operations: rename | merge | describe | recolor | trigger_reanalysis
```

User can say "rename Travel to Adventures", "merge Cooking and Food", "what topics do I have", "re-analyse my topics".

## Backend Files Changed

| File | Change |
|------|--------|
| `convex/schema.ts` | Add `userTopics` table; update `memories` (remove category/tags, add topicIds/primaryTopicId) |
| `convex/lib/validators.ts` | Remove `categoryValidator`; add topic validators |
| `convex/userTopics.ts` | New file: CRUD queries + mutations |
| `convex/actions/manageTopics.ts` | New file: `assignTopicsToMemory`, `reanalyzeTopics` actions |
| `convex/actions/processMemory.ts` | Remove category/tags extraction; call `assignTopicsToMemory` after save |
| `convex/actions/memoryChat.ts` | Replace category/tags tools with `manage_topics` tool |
| `convex/memories.ts` | Update list/create/update/stats; swap index |
| `convex/migrations.ts` | Clear category/tags fields (user OK with data loss) |

## Frontend Files Changed

| File | Change |
|------|--------|
| `constants/categories.ts` | Remove Category, categoryLabels, categoryIcons, categoryColors |
| `types/memory.ts` | Replace `category`/`tags` with `topicIds`/`primaryTopicId` |
| `components/ui/CategoryPills.tsx` | Rewrite as `TopicPills` — reads from `userTopics.list` |
| `components/MemoryCard.tsx` | Replace category chip + tags with topic pills |
| `components/EditMemorySheet.tsx` | Remove category picker + tags input; add read-only topic pills + "Ask AI" button |
| `components/UnifiedCommandPanel.tsx` | Remove category + tags fields from new memory form |
| `app/(protected)/(tabs)/index.tsx` | Swap CategoryPills → TopicPills; filter by primaryTopicId |
| `app/(protected)/statistics.tsx` | Topic breakdown instead of category breakdown |
| `app/(protected)/knowledge-graph.tsx` | Render actual topic graph (nodes + edges) |
| `app/(protected)/profile.tsx` | Remove memory count from category, use topic count |

## Constraints

- No manual topic editing in UI — AI-only writes
- User interacts via AI chat for any taxonomy changes
- Silent merge (no confirmation) — user approved
- No migration of existing data — schema reset acceptable
- `lifeArea` and `contextTags` are kept (structural metadata, not taxonomy)
