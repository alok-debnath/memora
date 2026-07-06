import type { Doc } from "../../_generated/dataModel";
import { toMemorySummaryFields } from "../memoryKind";
import { MEMORY_COMPACT_CONTENT_CHARS, STATUS_TEXT_MAX } from "./budgets";

type MemoryDoc = Doc<"memories">;

export function toMemorySummary(memory: MemoryDoc) {
  return {
    id: memory._id,
    title: memory.title,
    content: memory.content,
    people: memory.people,
    locations: memory.locations,
    primary_topic_id: memory.primaryTopicId ?? null,
    ...toMemorySummaryFields(memory),
    created_at: new Date(memory._creationTime).toISOString(),
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
