import type { Doc } from "../_generated/dataModel";

const SEARCH_TEXT_LIMIT = 6000;

/**
 * Denormalized text powering the diaryEntries search index and embeddings.
 * Combines the best available body text with summary and topics so both
 * fulltext and vector search can match on any of them.
 */
export function buildDiarySearchText(entry: {
  rawText?: string;
  correctedText?: string;
  summary?: string;
  topics?: string[];
}): string {
  const body = (entry.correctedText ?? entry.rawText ?? "").trim();
  const parts = [
    body,
    (entry.summary ?? "").trim(),
    (entry.topics ?? []).filter(Boolean).join(", "),
  ].filter(Boolean);
  return parts.join("\n").slice(0, SEARCH_TEXT_LIMIT);
}

/** Compact projection used for AI context — keeps token cost bounded. */
export function toDiaryCompact(entry: Doc<"diaryEntries">, excerptLength = 400) {
  const body = (entry.correctedText ?? entry.rawText ?? "").trim();
  return {
    id: entry._id,
    source: "diary" as const,
    date: new Date(entry._creationTime).toISOString().slice(0, 10),
    mood: entry.mood ?? null,
    energy_level: entry.energyLevel ?? null,
    topics: entry.topics ?? [],
    summary: entry.summary ?? null,
    excerpt: body.slice(0, excerptLength),
  };
}
