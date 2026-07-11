import { SEARCH_ALIASES_MAX, SEARCH_CONCEPTS_MAX, SEARCH_TEXT_CHARS } from "./chat/budgets";

export const MEMORY_RETRIEVAL_VERSION = 3;

export type MemoryRetrievalFields = {
  semanticSummary?: string;
  searchAliases: string[];
  searchConcepts: string[];
};

export type MemoryRetrievalSource = {
  title?: string;
  content?: string;
  people?: string[];
  locations?: string[];
  lifeArea?: string;
  entryKind?: string;
  attachmentExcerpt?: string;
  semanticSummary?: string;
  searchAliases?: string[];
  searchConcepts?: string[];
};

function boundedStrings(value: unknown, limit: number, chars: number): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().slice(0, chars))
        .filter(Boolean),
    ),
  ).slice(0, limit);
}

export function normalizeMemoryRetrievalFields(args: {
  semanticSummary?: unknown;
  searchAliases?: unknown;
  searchConcepts?: unknown;
}): MemoryRetrievalFields {
  return {
    ...(typeof args.semanticSummary === "string" && args.semanticSummary.trim()
      ? { semanticSummary: args.semanticSummary.trim().slice(0, 600) }
      : {}),
    searchAliases: boundedStrings(args.searchAliases, SEARCH_ALIASES_MAX, 100),
    searchConcepts: boundedStrings(args.searchConcepts, SEARCH_CONCEPTS_MAX, 80),
  };
}

export function buildMemorySearchText(args: MemoryRetrievalSource): string {
  return [
    args.title,
    args.content,
    args.semanticSummary,
    ...(args.searchAliases ?? []),
    ...(args.searchConcepts ?? []),
    ...(args.people ?? []),
    ...(args.locations ?? []),
    args.lifeArea,
    args.attachmentExcerpt,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, SEARCH_TEXT_CHARS);
}

export function buildMemoryEmbeddingText(args: MemoryRetrievalSource): string {
  const parts: string[] = [];
  if (args.title) parts.push(`Title: ${args.title}`);
  if (args.content) parts.push(`Content: ${args.content}`);
  if (args.people?.length) parts.push(`People: ${args.people.join(", ")}`);
  if (args.locations?.length) parts.push(`Locations: ${args.locations.join(", ")}`);
  if (args.lifeArea) parts.push(`Category: ${args.lifeArea}`);
  if (args.entryKind === "reminder") parts.push("Type: reminder");
  if (args.attachmentExcerpt) parts.push(`Attachment content: ${args.attachmentExcerpt}`);
  if (args.semanticSummary) parts.push(`Meaning: ${args.semanticSummary}`);
  if (args.searchAliases?.length) parts.push(`Recall phrases: ${args.searchAliases.join(", ")}`);
  if (args.searchConcepts?.length) {
    parts.push(`Related concepts: ${args.searchConcepts.join(", ")}`);
  }
  return parts.length > 0 ? parts.join("\n") : `${args.title ?? ""}\n${args.content ?? ""}`;
}
