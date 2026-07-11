import type { Doc } from "../../_generated/dataModel";
import { toDiaryCompact } from "../diaryText";
import { toMemorySummaryFields } from "../memoryKind";
import {
  CARD_SNAPSHOT_CONTENT_CHARS,
  CARD_SNAPSHOT_TITLE_CHARS,
  MEMORY_COMPACT_CONTENT_CHARS,
  STATUS_TEXT_MAX,
} from "./budgets";
import type { CardSnapshot } from "./types";

type MemoryDoc = Doc<"memories">;

export function toMemorySummary(memory: MemoryDoc) {
  const match = (
    memory as MemoryDoc & {
      _match?: {
        confidence: "strong" | "related" | "weak";
        relation: "direct" | "related";
        channels: string[];
        matchedConcepts: string[];
      };
    }
  )._match;
  return {
    id: memory._id,
    title: memory.title,
    content: memory.content,
    people: memory.people,
    locations: memory.locations,
    primary_topic_id: memory.primaryTopicId ?? null,
    ...toMemorySummaryFields(memory),
    created_at: new Date(memory._creationTime).toISOString(),
    ...(match ? { match } : {}),
  };
}

export type MemorySummary = ReturnType<typeof toMemorySummary>;

// Compact form used for bulk tool results (list/analyze) to avoid context bloat
export function toMemoryCompact(memory: MemoryDoc) {
  return {
    id: memory._id,
    title: memory.title,
    content: (memory.content ?? "").slice(0, MEMORY_COMPACT_CONTENT_CHARS),
    ...toMemorySummaryFields(memory),
  };
}

export type MemoryCompact = ReturnType<typeof toMemoryCompact>;

export function toMemoryCardSnapshot(memory: MemoryDoc): CardSnapshot {
  const summaryFields = toMemorySummaryFields(memory);
  return {
    table: "memories",
    id: String(memory._id),
    ...(memory.title ? { title: memory.title.slice(0, CARD_SNAPSHOT_TITLE_CHARS) } : {}),
    ...(memory.content ? { content: memory.content.slice(0, CARD_SNAPSHOT_CONTENT_CHARS) } : {}),
    entry_kind: summaryFields.entry_kind,
    schedule_due_at: summaryFields.schedule?.due_at ?? null,
    ...(memory.googleEventId ? { google_event_id: memory.googleEventId } : {}),
    ...(memory.googleSyncStatus ? { google_sync_status: memory.googleSyncStatus } : {}),
    ...(memory.googleSyncMessage ? { google_sync_message: memory.googleSyncMessage } : {}),
    ...(memory.googleSyncUpdatedAt !== undefined
      ? { google_sync_updated_at: memory.googleSyncUpdatedAt }
      : {}),
  };
}

export function toDiaryCardSnapshot(entry: Doc<"diaryEntries">): CardSnapshot {
  const compact = toDiaryCompact(entry, 280);
  return {
    table: "diaryEntries",
    id: String(entry._id),
    creation_time: entry._creationTime,
    mood: entry.mood ?? null,
    energy_level: entry.energyLevel ?? null,
    topics: entry.topics ?? [],
    summary: entry.summary ?? null,
    excerpt: compact.excerpt,
  };
}

export function truncateStatusText(value: string | undefined, maxLength = STATUS_TEXT_MAX) {
  const normalized = (value ?? "").trim().replace(/\s+/g, " ");
  if (!normalized) {
    return "";
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}...`;
}

export function toPreviewItems(
  items: Array<{
    title?: string | null;
    content?: string | null;
    filename?: string | null;
  }>,
  fallbackLabel: string,
) {
  return items
    .map((item) =>
      truncateStatusText(
        item.title?.trim() || item.filename?.trim() || item.content?.trim() || fallbackLabel,
      ),
    )
    .filter(Boolean)
    .slice(0, 3);
}
