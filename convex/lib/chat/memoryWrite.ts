import { normalizeMemoryFields } from "../aiNormalization";

export function normalizeForMemoryDedupe(value: string | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function buildCreateMemoryDedupeKey(args: { title?: string; content: string }): string {
  const normalizedContent = normalizeForMemoryDedupe(args.content);
  return JSON.stringify({
    content: normalizedContent,
    fallbackTitle: normalizedContent ? "" : normalizeForMemoryDedupe(args.title),
  });
}

export function hasExplicitSchedulingFields(value: Record<string, unknown>) {
  return (
    value.entryKind !== undefined || value.entry_kind !== undefined || value.schedule !== undefined
  );
}

export function normalizeAiMemoryWriteFields(value: Record<string, unknown>) {
  const normalized = normalizeMemoryFields(value);
  if (normalized.schedule?.dueAt) {
    return {
      ...normalized,
      entryKind: "reminder" as const,
    };
  }
  return normalized;
}
