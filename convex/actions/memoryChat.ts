"use node";

import { v } from "convex/values";
import type OpenAI from "openai";
import { api, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { action, type ActionCtx } from "../_generated/server";
import {
  embedText,
  extractTextContent,
  getOpenAIClient,
  OPENAI_CHAT_MODEL,
} from "../lib/openai";
import { runSemanticSearch } from "../lib/semanticSearch";
import { normalizeSearchQueryHash } from "../lib/search";
import { normalizeMemoryFields } from "../lib/aiNormalization";
import {
  getMemorySchedule,
  isReminder,
  toMemorySummaryFields,
  toStoredMemoryFields,
} from "../lib/memoryKind";
import { getReminderTitleWithoutSchedule } from "../lib/reminderTitle";


type MemoryDoc = Doc<"memories">;
type DocumentDoc = Doc<"documentExtractions">;

type ParsedAttachment = {
  name: string;
  fileType: string;
  url: string;
};

type StreamingEvent = {
  label: string;
  value?: string;
};

type StreamingStatus = {
  query?: string;
  phase?: string;
  toolName?: string;
  detail?: string;
  source?: string;
  cacheState?: string;
  resultCount?: number;
  previewItems?: string[];
  events?: StreamingEvent[];
  step?: number;
  totalSteps?: number;
};

type MemorySearchResult = {
  results: ReturnType<typeof toMemorySummary>[];
  count: number;
  isCached?: boolean;
  searchMode: "recent_only" | "semantic_fresh" | "semantic_cached";
};

type DocumentSearchResult = {
  results: ReturnType<typeof toDocumentSummary>[];
  count: number;
  searchMode: "recent_only" | "vector_keyword" | "keyword_only";
};

type GroundingContext = {
  shouldGround: boolean;
  shouldPreferUpdate: boolean;
  isGenericOnly: boolean;
  searchCount: number;
  searchResults: ReturnType<typeof toMemorySummary>[];
  recentMemories: ReturnType<typeof toMemoryCompact>[];
  isCached: boolean;
};

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_memories",
      description:
        "Search through the user's memories using semantic plus fuzzy search. Use whenever the user asks about stored facts, counts, or wants to recall information. You MUST call this (or list_memories) before answering any factual question about stored data — never answer from inference.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query." },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_documents",
      description:
        "Search through the user's uploaded documents using semantic search.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The document search query." },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_memory",
      description:
        "Create a new memory note for the user. Use when they ask to remember something or casually share a durable fact.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Concise title, max 8 words, objective note-style (no 'I', 'me', 'my'). For reminders, keep title topic-only and never include date/time." },
          content: { type: "string", description: "Full memory content in objective note-style language (no 'I', 'me', 'my')" },
          entry_kind: {
            type: "string",
            enum: ["memory", "reminder"],
            description: "Default to memory. Use reminder only for explicit reminder intent with a resolvable schedule.",
          },
          schedule: {
            type: "object",
            properties: {
              due_at: {
                type: "string",
                description:
                  "Exact ISO 8601 UTC datetime for an explicit reminder. Omit for normal memories.",
              },
              is_recurring: { type: "boolean" },
              recurrence_type: {
                type: "string",
                enum: ["yearly", "monthly", "weekly", "daily"],
              },
            },
            additionalProperties: false,
          },
          people: { type: "array", items: { type: "string" } },
          locations: { type: "array", items: { type: "string" } },
        },
        required: ["content"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_memory",
      description:
        "Update an existing memory. Search first to identify the right memory, then update it.",
      parameters: {
        type: "object",
        properties: {
          memory_id: { type: "string" },
          title: { type: "string", description: "Concise title, max 8 words, objective note-style (no 'I', 'me', 'my'). For reminders, keep title topic-only and never include date/time." },
          content: { type: "string", description: "Full memory content in objective note-style language (no 'I', 'me', 'my')" },
          entry_kind: {
            type: "string",
            enum: ["memory", "reminder"],
          },
          schedule: {
            type: "object",
            properties: {
              due_at: { type: "string" },
              is_recurring: { type: "boolean" },
              recurrence_type: {
                type: "string",
                enum: ["yearly", "monthly", "weekly", "daily"],
              },
            },
            additionalProperties: false,
          },
          people: { type: "array", items: { type: "string" } },
          locations: { type: "array", items: { type: "string" } },
        },
        required: ["memory_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "sync_reminder",
      description:
        "Manually trigger or retry Google Calendar sync for an existing reminder.",
      parameters: {
        type: "object",
        properties: {
          memory_id: {
            type: "string",
            description: "Reminder memory ID if already known.",
          },
          query: {
            type: "string",
            description:
              "Reminder reference text to resolve the target when memory ID is unknown.",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remove_reminder_sync",
      description:
        "Remove Google Calendar sync for an existing reminder. This deletes linked Google Calendar event data and clears local sync metadata.",
      parameters: {
        type: "object",
        properties: {
          memory_id: {
            type: "string",
            description: "Reminder memory ID if already known.",
          },
          query: {
            type: "string",
            description:
              "Reminder reference text to resolve the target when memory ID is unknown.",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_deletion",
      description:
        "Search for memories or reminders to delete and surface them to the user for confirmation. You do NOT delete directly — the user will review and confirm in the app UI. Use this whenever the user asks to delete one or more items.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query to find the matching items." },
          entry_kind: {
            type: "string",
            enum: ["memory", "reminder", "any"],
            description: "Filter by item type. Default: any.",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_deleted_memories",
      description:
        "List memories that have been soft-deleted (moved to trash). Use when the user asks to see deleted memories or wants to restore something.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max items to return (default 20)" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "restore_memory",
      description:
        "Restore a soft-deleted memory, bringing it back from the trash.",
      parameters: {
        type: "object",
        properties: {
          memory_id: { type: "string" },
        },
        required: ["memory_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_memories",
      description:
        "List memories with optional filters for browsing or counting. Use this for count questions ('how many X'), existence checks, or when the user asks to see/list stored items. You MUST call this (or search_memories) before answering any factual question about stored data.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number" },
          sort: { type: "string", enum: ["newest", "oldest"] },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_stats",
      description:
        "Get statistics about the user's memories including reminders, recurring items, and recent activity.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analyze_memories",
      description:
        "Retrieve memories for analysis, summaries, trends, and insights.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "history",
      description:
        "Version control for memories. Actions: list, undo, or restore.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["list", "undo", "restore"] },
          memory_id: { type: "string" },
          history_id: { type: "string" },
          limit: { type: "number" },
        },
        required: ["action"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "attach_file_to_memory",
      description:
        "Attach a file shared in chat to a memory after creating or identifying the right memory.",
      parameters: {
        type: "object",
        properties: {
          memory_id: { type: "string" },
          file_url: { type: "string" },
          file_name: { type: "string" },
          file_type: { type: "string" },
        },
        required: ["memory_id", "file_url", "file_name", "file_type"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "manage_topics",
      description:
        "Manage the AI-generated topic taxonomy. List topics, rename, merge, recolor, retag a specific memory to a requested topic, or trigger a full re-analysis.",
      parameters: {
        type: "object",
        properties: {
          operation: {
            type: "string",
            enum: ["list", "rename", "merge", "recolor", "trigger_reanalysis", "retag_memory"],
          },
          topic_slug: { type: "string", description: "Slug of the topic to operate on." },
          target_slug: { type: "string", description: "For merge: the slug of the topic to merge into topic_slug." },
          new_name: { type: "string", description: "For rename: the new display name." },
          new_icon: { type: "string", description: "For recolor: Feather icon name." },
          new_color: { type: "string", description: "For recolor: hex color string." },
          memory_id: { type: "string", description: "For retag_memory: actual memory id if already known. If not known, search memories first or refer to the most recent matching memory." },
          topic_name: { type: "string", description: "For retag_memory: requested topic name to reuse or create." },
        },
        required: ["operation"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "surface_cards",
      description:
        "Show specific memories as interactive cards in the UI. Call this with only the IDs of memories you actually used or referenced in your response. Do NOT include memories you searched but didn't use to answer.",
      parameters: {
        type: "object",
        properties: {
          ids: {
            type: "array",
            items: { type: "string" },
            description: "IDs of memories to surface as cards.",
          },
        },
        required: ["ids"],
        additionalProperties: false,
      },
    },
  },
];

function parseAttachments(message: string): ParsedAttachment[] {
  const matches = message.matchAll(
    /\[Attached file:\s*(.+?)\s*\((.+?)\)\s*-\s*URL:\s*(.+?)\]/g
  );

  return Array.from(matches, (match) => ({
    name: match[1]?.trim() || "Attachment",
    fileType: match[2]?.trim() || "application/octet-stream",
    url: match[3]?.trim() || "",
  })).filter((item) => item.url);
}

const GENERIC_QUERY_PATTERNS = [
  /\bwhat is\b/i,
  /\bwho is\b/i,
  /\bexplain\b/i,
  /\bdefine\b/i,
  /\bwrite\b/i,
  /\bpoem\b/i,
  /\bstory\b/i,
  /\bbrainstorm\b/i,
  /\btranslate\b/i,
  /\bsummarize\b/i,
  /\bcode\b/i,
  /\bdebug\b/i,
];

const PERSONAL_QUERY_PATTERNS = [
  /\bmy\b/i,
  /\bi have\b/i,
  /\bdo i have\b/i,
  /\bhow many\b/i,
  /\bwhat are\b/i,
  /\bwhich\b/i,
  /\bwhen did\b/i,
  /\breminder\b/i,
  /\bremind\b/i,
  /\bmemory\b/i,
  /\bmemories\b/i,
  /\bfriend\b/i,
  /\bfriends\b/i,
  /\bpeople\b/i,
  /\bname\b/i,
  /\bnames\b/i,
  /\bappointment\b/i,
  /\bmeeting\b/i,
  /\bbirthday\b/i,
  /\bpassport\b/i,
  /\bdeadline\b/i,
];

const UPDATE_INTENT_PATTERNS = [
  /\bedit\b/i,
  /\bupdate\b/i,
  /\bchange\b/i,
  /\bmodify\b/i,
  /\bfix\b/i,
  /\breschedul(?:e|ing)\b/i,
  /\brename\b/i,
  /\bmove\b/i,
  /\bconvert\b/i,
  /\bturn\b/i,
  /\bmake\b/i,
];

const UPDATE_TARGET_HINT_PATTERNS = [
  /\bmemory\b/i,
  /\breminder\b/i,
  /\bthis\b/i,
  /\bthat\b/i,
  /\bit\b/i,
  /\bsame\b/i,
  /\bexisting\b/i,
  /\bwith id\b/i,
  /\bprevious\b/i,
  /\babove\b/i,
];

const CREATE_ONLY_INTENT_PATTERNS = [
  /\bremember\b/i,
  /\bsave\b/i,
  /\bnote\b/i,
  /\badd\b/i,
  /\bcapture\b/i,
  /\bstore\b/i,
  /\bremind me\b/i,
];

const FACTUAL_GROUNDING_PATTERNS = [
  /\?/,
  /\bhow many\b/i,
  /\bhow\b/i,
  /\bwhat\b/i,
  /\bwhich\b/i,
  /\bwho\b/i,
  /\bwhen\b/i,
  /\bdo i have\b/i,
  /\blist\b/i,
  /\bshow\b/i,
  /\bfind\b/i,
  /\bdelete\b/i,
  /\bremove\b/i,
  /\brestore\b/i,
  /\bundo\b/i,
];

function isGenericOnlyQuery(message: string) {
  const trimmed = message.trim();
  return (
    GENERIC_QUERY_PATTERNS.some((pattern) => pattern.test(trimmed)) &&
    !PERSONAL_QUERY_PATTERNS.some((pattern) => pattern.test(trimmed))
  );
}

function shouldGroundAgainstDb(message: string) {
  const trimmed = message.trim();
  if (!trimmed) {
    return false;
  }

  if (shouldPreferUpdatingExisting(trimmed)) {
    return true;
  }

  if (isGenericOnlyQuery(trimmed)) {
    return false;
  }

  return PERSONAL_QUERY_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function shouldPreferUpdatingExisting(message: string) {
  const trimmed = message.trim();
  if (!trimmed) {
    return false;
  }

  return (
    UPDATE_INTENT_PATTERNS.some((pattern) => pattern.test(trimmed)) &&
    UPDATE_TARGET_HINT_PATTERNS.some((pattern) => pattern.test(trimmed))
  );
}

function isReferentialUpdate(message: string) {
  const trimmed = message.trim();
  if (!trimmed) {
    return false;
  }
  return (
    shouldPreferUpdatingExisting(trimmed) &&
    (/\bthis\b/i.test(trimmed) ||
      /\bthat\b/i.test(trimmed) ||
      /\bit\b/i.test(trimmed) ||
      /\bsame\b/i.test(trimmed) ||
      /\bprevious\b/i.test(trimmed) ||
      /\babove\b/i.test(trimmed))
  );
}

function shouldRunInitialGroundingSearch(message: string) {
  const trimmed = message.trim();
  if (!trimmed) {
    return false;
  }
  if (shouldPreferUpdatingExisting(trimmed)) {
    return true;
  }
  if (
    CREATE_ONLY_INTENT_PATTERNS.some((pattern) => pattern.test(trimmed)) &&
    !FACTUAL_GROUNDING_PATTERNS.some((pattern) => pattern.test(trimmed))
  ) {
    return false;
  }
  return FACTUAL_GROUNDING_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function normalizeForMemoryDedupe(value: string | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function buildCreateMemoryDedupeKey(args: {
  title?: string;
  content: string;
}): string {
  const normalizedContent = normalizeForMemoryDedupe(args.content);
  return JSON.stringify({
    content: normalizedContent,
    fallbackTitle: normalizedContent ? "" : normalizeForMemoryDedupe(args.title),
  });
}

function hasExplicitSchedulingFields(value: Record<string, unknown>) {
  return (
    value.entryKind !== undefined ||
    value.entry_kind !== undefined ||
    value.schedule !== undefined
  );
}

function toMemorySummary(memory: MemoryDoc) {
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

// Compact form used for bulk tool results (list/analyze) to avoid context bloat
function toMemoryCompact(memory: MemoryDoc) {
  return {
    id: memory._id,
    title: memory.title,
    content: (memory.content ?? "").slice(0, 300),
    ...toMemorySummaryFields(memory),
  };
}

const MARKER_STRIP_RE = /<!--MEMORA_[A-Z_]+:[\s\S]*?-->/g;

function stripMarkersFromContent(content: string): string {
  return content.replace(MARKER_STRIP_RE, "").trim();
}

function toDocumentSummary(document: DocumentDoc) {
  return {
    id: document._id,
    filename: document.filename,
    summary: document.summary ?? "",
    document_type: document.documentType ?? "other",
    expiry_date: document.expiryDate ?? null,
    key_details: document.keyDetails ?? {},
    status: document.status,
  };
}

function truncateStatusText(value: string | undefined, maxLength = 42) {
  const normalized = (value ?? "").trim().replace(/\s+/g, " ");
  if (!normalized) {
    return "";
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}...`;
}

function toPreviewItems(
  items: Array<{ title?: string | null; content?: string | null; filename?: string | null }>,
  fallbackLabel: string
) {
  return items
    .map((item) =>
      truncateStatusText(
        item.title?.trim() ||
          item.filename?.trim() ||
          item.content?.trim() ||
          fallbackLabel
      )
    )
    .filter(Boolean)
    .slice(0, 3);
}

async function listMemoriesForAI(
  ctx: ActionCtx,
  userId: Id<"users">,
  limit = 100
) {
  return await ctx.runQuery(internal.memories.listForAI, {
    userId,
    limit: Math.min(limit, 100),
  });
}

async function searchDocuments(
  ctx: ActionCtx,
  args: {
    token: string;
    query: string;
    userId: Id<"users">;
    documents?: DocumentDoc[];
  }
): Promise<DocumentSearchResult> {
  const documents: DocumentDoc[] =
    args.documents ??
    (await ctx.runQuery(api.documents.list, {
      token: args.token,
    }));

  const normalizedQuery = args.query.trim();
  if (!normalizedQuery) {
    const results = documents.slice(0, 10).map(toDocumentSummary);
    return {
      results,
      count: results.length,
      searchMode: "recent_only",
    };
  }

  const keywordQuery = normalizedQuery.toLowerCase();
  const keywordMatches = documents.filter((document) => {
    const haystack = [
      document.filename,
      document.summary,
      document.documentType,
      document.extractedText,
      ...(document.keyDetails ? Object.values(document.keyDetails) : []),
    ]
      .filter(Boolean)
      .join("\n")
      .toLowerCase();
    return haystack.includes(keywordQuery);
  });

  try {
    const queryEmbedding = await embedText(normalizedQuery);
    const vectorResults = await ctx.vectorSearch(
      "documentExtractions",
      "by_embedding",
      {
        vector: queryEmbedding,
        limit: 8,
        filter: (q) => q.eq("userId", args.userId),
      }
    );

    const byId = new Map(
      documents.map((document) => [document._id, document] as const)
    );
    const merged: DocumentDoc[] = [];
    const seen = new Set<Id<"documentExtractions">>();

    for (const result of vectorResults) {
      const document = byId.get(result._id);
      if (!document || seen.has(document._id)) {
        continue;
      }
      seen.add(document._id);
      merged.push(document);
    }

    for (const document of keywordMatches) {
      if (seen.has(document._id)) {
        continue;
      }
      seen.add(document._id);
      merged.push(document);
    }

    const results = merged.slice(0, 10).map(toDocumentSummary);
    return {
      results,
      count: merged.length,
      searchMode: "vector_keyword",
    };
  } catch {
    const results = keywordMatches.slice(0, 10).map(toDocumentSummary);
    return {
      results,
      count: keywordMatches.length,
      searchMode: "keyword_only",
    };
  }
}

async function searchMemories(
  ctx: ActionCtx,
  args: {
    token: string;
    query: string;
    userId: Id<"users">;
    recentMemories?: MemoryDoc[];
  }
): Promise<MemorySearchResult> {
  const recentMemories =
    args.recentMemories ?? (await listMemoriesForAI(ctx, args.userId, 100));
  const normalizedQuery = args.query.trim();
  if (!normalizedQuery) {
    return {
      results: recentMemories.slice(0, 10).map(toMemorySummary),
      count: recentMemories.length,
      searchMode: "recent_only",
    };
  }

  // The rewritten semanticSearch already handles:
  // 1. LLM query expansion (strips intent words, adds synonyms)
  // 2. Vector search with permissive thresholds
  // 3. Full-text search with cleaned query
  // 4. Proportional keyword matching (prevents single-term noise)
  // 5. RRF fusion ranking across all sources
  const semanticResults = await runSemanticSearch(ctx, {
    token: args.token,
    userId: args.userId,
    query: normalizedQuery,
    limit: 12,
  });

  return {
    results: semanticResults.results.slice(0, 10).map(toMemorySummary),
    count: semanticResults.results.length,
    isCached: semanticResults.isCached,
    searchMode: semanticResults.isCached ? "semantic_cached" : "semantic_fresh",
  };
}

async function resolveMemoryReference(
  ctx: ActionCtx,
  args: {
    token: string;
    userId: Id<"users">;
    reference?: string;
    recentMemories?: MemoryDoc[];
  }
): Promise<Id<"memories"> | null> {
  const recentMemories =
    args.recentMemories ?? (await listMemoriesForAI(ctx, args.userId, 20));

  if (!args.reference?.trim()) {
    return recentMemories[0]?._id ?? null;
  }

  const reference = args.reference.trim().toLowerCase();

  const exactIdMatch = recentMemories.find((memory: MemoryDoc) => memory._id === args.reference);
  if (exactIdMatch) {
    return exactIdMatch._id;
  }

  const referenceTerms = reference
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 1);

  const scored = recentMemories
    .map((memory: MemoryDoc) => {
      const title = (memory.title ?? "").toLowerCase();
      const content = (memory.content ?? "").toLowerCase();
      let score = 0;
      if (title.includes(reference)) score += 5;
      if (content.includes(reference)) score += 3;
      for (const term of referenceTerms) {
        if (title.includes(term)) score += 2;
        if (content.includes(term)) score += 1;
      }
      return { memory, score };
    })
    .sort((a: { memory: MemoryDoc; score: number }, b: { memory: MemoryDoc; score: number }) => b.score - a.score);

  if ((scored[0]?.score ?? 0) > 0) {
    return scored[0].memory._id;
  }

  return recentMemories[0]?._id ?? null;
}

async function buildGroundingContext(
  ctx: ActionCtx,
  args: {
    token: string;
    message: string;
    userId: Id<"users">;
    recentMemories?: MemoryDoc[];
  }
): Promise<GroundingContext> {
  const isGenericOnly = isGenericOnlyQuery(args.message);
  const shouldGround = shouldGroundAgainstDb(args.message);
  const shouldPreferUpdate = shouldPreferUpdatingExisting(args.message);
  const shouldRunSearch = shouldRunInitialGroundingSearch(args.message);

  if (!shouldGround || !shouldRunSearch) {
    return {
      shouldGround: false,
      shouldPreferUpdate,
      isGenericOnly,
      searchCount: 0,
      searchResults: [],
      recentMemories: [],
      isCached: false,
    };
  }

  const recentMemories =
    args.recentMemories ?? (await listMemoriesForAI(ctx, args.userId, 40));
  const searchRes = await searchMemories(ctx, {
    token: args.token,
    query: args.message,
    userId: args.userId,
    recentMemories,
  });

  return {
    shouldGround,
    shouldPreferUpdate,
    isGenericOnly,
    searchCount: searchRes.count,
    searchResults: searchRes.results.slice(0, 8),
    recentMemories: recentMemories.slice(0, 12).map(toMemoryCompact),
    isCached: searchRes.isCached ?? false,
  };
}

function buildSystemPrompt(userTimezone: string, currentTime: string) {
  const now = new Date(currentTime);
  const localDateStr = now.toLocaleDateString("en-US", {
    timeZone: userTimezone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const localTimeStr = now.toLocaleTimeString("en-US", {
    timeZone: userTimezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  const utcStr = now.toISOString();

  return `You are Memora, a warm and witty personal AI memory assistant — the user's second brain. You remember everything they tell you and surface it instantly when needed. You have personality: helpful, occasionally playful, always feel like a trusted friend who happens to have a perfect memory.

## Your Core Behaviors:

1. **DIRECT, HUMAN ANSWERS**: Answer naturally — like a knowledgeable friend, not a database. Skip "I found a memory that says..." — just answer. Never narrate your tool use in text: don't mention memory IDs, don't say "I'll surface the card", don't describe what surface_cards does. Tool calls are invisible to the user — your text should read as if you simply know the answer. Never end responses with filler sign-offs — just stop after the answer.

2. **WARM CONFIRMATIONS**: When you save/update/delete something, confirm it with personality. For example: "Done! Meeting reminder set for Friday 9 Apr at 2:00 PM — noted!" Never give a bland, robotic confirmation. Always echo the absolute date/time back so the user can verify it.

2a. **NO VAGUE ASYNC PROMISES**: Do not say things like "stay tuned", "it should update soon", or "I've scheduled this" unless the completed tool result already confirms the exact state change. For a topic change on one specific memory, prefer an immediate concrete action over a broad re-analysis.

2b. **NO SUCCESS WITHOUT A TOOL RESULT**: Never claim an operation succeeded unless a tool call in this turn returned success for that operation. If a tool returns an error or non-success state, explain that exact outcome.

3. **REMEMBER EVERYTHING**: When the user shares info casually, save it. They don't need to say "remember this" explicitly.

4. **AVAILABLE OPERATIONS**: Only claim actions that are supported by tool calls in this turn. Available operations include:
   - Search, create, edit, delete memories (single or bulk)
   - Analyze patterns and trends across their data
   - Provide statistics and insights
   - Search uploaded documents (warranties, receipts, etc.)
   - Set reminders and recurring tasks
   - Trigger or retry Google Calendar sync for an existing reminder via sync_reminder
   - Remove Google Calendar sync for a reminder via remove_reminder_sync
   - Manage topics via manage_topics (rename, merge, recolor, retag a specific memory, trigger re-analysis, or list)

5. **BE PROACTIVE**:
   - If you notice conflicting information, flag it naturally
   - If a deadline or reminder is near, mention it
   - Suggest connections between memories when relevant

6. **DELETION VIA PROPOSAL**: You no longer have direct delete access. When the user asks to delete memories or reminders, use propose_deletion to find and surface matching items. The user confirms or cancels directly in the app — you never delete yourself. Never claim you deleted something; instead say you've found the items and the user can confirm below.

7. **ANALYSIS**: When asked to analyze, use the analyze_memories tool, then share insights conversationally.

7a. **CRITICAL — ALWAYS FETCH BEFORE ANSWERING**: You have NO built-in knowledge of what is stored. For ANY question about stored data — counts ("how many friends"), existence ("do I have X"), details ("what are my friend names"), summaries, or statistics — you MUST call search_memories or list_memories FIRST. Never answer from inference or assumption. A wrong answer from hallucination is worse than saying you need to check.

7b. **CRITICAL — EDITS MUST UPDATE EXISTING ITEMS**: If the user asks to edit, change, convert, rename, reschedule, or turn an existing memory into a reminder (or reminder into memory), prefer update_memory on the existing item. Do NOT create a new memory/reminder unless the user explicitly asks for an additional new item or you clearly found no existing match after checking the DB.

7c. **CRITICAL — COUNTS MUST BE GROUNDED**: Never answer count questions from memory, chat history, or raw intuition. Use DB-backed tool/context results only. If the evidence is ambiguous, say that clearly and surface the matching memories instead of guessing.

7d. **CRITICAL — MANUAL GOOGLE SYNC REQUESTS**: When the user asks to sync/resync/retry Google Calendar for a reminder, you MUST call sync_reminder. Only say sync was triggered if the tool result has queued=true. If queued=false, explain the returned reason/message instead of claiming success.

7e. **CRITICAL — REMOVE GOOGLE SYNC REQUESTS**: When the user asks to remove/unsync/disconnect a reminder from Google Calendar, you MUST call remove_reminder_sync. Only say removal succeeded if the tool result has removed=true. If removed=false or error, explain that exact outcome.

8. **MEMORY CARDS UI**: You MUST call surface_cards at the end of EVERY response, no exceptions.
   - Pass the IDs of every memory you drew on to produce your answer — whether they came from the grounding context, a search, or a list.
   - If your answer referenced stored data, those memory IDs belong in surface_cards.
   - If nothing stored was used, call surface_cards with ids=[].
   - When the user asks to browse or see memories, keep your text brief and let the cards do the work.
   - **FALLBACK**: If for some reason you cannot call the tool but you used memories to answer, append \`<!--MEMORA_USED_IDS:["id1", "id2"]-->\` as the VERY LAST line of your response (hidden comment). Only include IDs of memories you actually used to answer.
   - NEVER mention surface_cards, memory IDs, or card surfacing in your text response. The card UI appears automatically — you do not need to narrate it.

9. **UNDO & HISTORY**:
   - To undo a **deletion** (user says "undo", "restore", "bring it back" after a recent delete): use restore_memory if you know the ID, otherwise call list_deleted_memories to find it, then restore_memory. Do NOT use the history tool for undoing deletions.
   - To undo an **edit** (user says "revert", "undo that change", "go back to the old version"): use the history tool with action='undo' (optionally with memory_id).
   - To view edit history or restore a specific snapshot: use the history tool with action='list' or action='restore'.

10. **FILE ATTACHMENTS**: When user shares files, file URLs appear as [Attached file: name (type) — URL: ...]. Create or update a memory and call attach_file_to_memory when relevant.

**TOPIC GUIDANCE**: Topics are AI-assigned by the system, but if the user explicitly wants a specific memory moved under a different topic, use manage_topics with operation="retag_memory". First identify the target memory: use a real memory_id if you already have it, otherwise search memories or infer the most recent relevant memory from context. Do not pass plain text like "class topic" into memory_id. Use rename/merge/recolor only for taxonomy-wide changes. When they ask "what topics do I have", use manage_topics with operation="list".

**CURRENT DATE & TIME**: ${localDateStr} at ${localTimeStr} (${userTimezone}) — UTC: ${utcStr}
Use this to resolve relative expressions like "in 5 hours", "next Monday", "after lunch", "tomorrow morning" into exact absolute datetimes before storing them.
This timestamp came from the user's device at send-time. Treat it as the authoritative "now" for relative scheduling.

**CRITICAL WORDING RULE — NO RELATIVE TIME IN STORED MEMORIES**:
When writing memory title or content (stored via tools), NEVER use relative time words: "today", "tomorrow", "yesterday", "next week", "this morning", "this afternoon", "in 5 hours", "soon", "later", "recently", "just now", etc.
Always write the actual resolved date/time in stored content: e.g. "Meeting with Sarah on 9 Apr 2026 at 14:00 IST" not "Meeting with Sarah tomorrow afternoon".
Reminder titles must be topic-only labels (e.g. "Meeting with Sarah"), without date/time.
Also: write in objective, note-style language — no "I", "me", "my", "the user", "you".
Your spoken REPLY to the user is still warm and personal — this rule only applies to the stored title/content.

**CRITICAL MEMORY VS REMINDER RULE**:
- Every saved item must be either a memory or a reminder.
- Default to entry_kind=\"memory\".
- Use entry_kind=\"reminder\" only when the user explicitly wants to be reminded and provides a resolvable date/time.
- A future fact or event by itself is still a memory, not a reminder.
- If the user wants a follow-up but gives no time, keep it as a memory and omit schedule.
- For reminders, keep the title as the core topic only. Put schedule details in schedule, not in title.

**CRITICAL TIMEZONE RULE**:
- User-mentioned times ("9:30 AM", "3pm in 5 hours") are in THEIR timezone (${userTimezone}).
- Compute the exact UTC datetime and store it in schedule.due_at as ISO 8601.
- When confirming, state the time in the user's timezone. Never expose UTC to the user.

Use markdown only when it genuinely helps readability.

**CRITICAL — ALWAYS CALL create_memory BEFORE CONFIRMING**: When the user wants to save, remember, note, or be reminded of something — including continuations like "another one for X", "also add X", "and remind me of X" — you MUST call create_memory immediately and then confirm with the result. Never say "Got it" or acknowledge an intent to save without first calling the tool in the same response turn. Each distinct item needs its own separate create_memory call.`;
}

export const chat = action({
  args: {
    token: v.string(),
    message: v.string(),
    currentTime: v.optional(v.string()),
    currentTimezone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const client = getOpenAIClient();
    const session = await ctx.runQuery(api.auth.me, { token: args.token });
    if (!session) {
      throw new Error("Unauthorized");
    }

    const effectiveTimezone =
      args.currentTimezone?.trim() || session.timezone || "UTC";

    await ctx.runMutation(internal.chat.send, {
      userId: session._id,
      content: args.message,
      role: "user",
    });
    await ctx.runMutation(internal.chat.clearSearchStatus, {
      userId: session._id,
    });

    const chatHistory = await ctx.runQuery(api.chat.list, {
      token: args.token,
      limit: 50,
    });
    const recentChat: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
    let latestReferencedMemoryIds: string[] = [];
    for (const message of chatHistory.slice(-12) as Array<{ role: string; content?: string | null }>) {
      recentChat.push({
        role: message.role as "user" | "assistant",
        content: stripMarkersFromContent(message.content ?? "").slice(0, 2000),
      });
      // After each assistant message, inject referenced memory IDs as a system hint so the
      // AI can resolve pronouns ("delete that", "edit it") in follow-up turns without a DB call.
      if (message.role === "assistant" && message.content) {
        const cardMatch = message.content.match(/<!--MEMORA_CARD_IDS:([\s\S]*?)-->/);
        if (cardMatch) {
          try {
            const { ids } = JSON.parse(cardMatch[1]) as { ids: string[] };
            const normalizedIds = Array.isArray(ids)
              ? ids
                  .filter((id): id is string => typeof id === "string")
                  .map((id) => id.trim())
                  .filter((id) => id.length > 0)
              : [];
            if (normalizedIds.length > 0) {
              latestReferencedMemoryIds = normalizedIds;
              recentChat.push({
                role: "system",
                content: `[Memory reference: the above assistant response surfaced memory IDs: ${normalizedIds.join(", ")}. When the user says "that", "it", "this", or "the above" in a follow-up, these are the IDs they are referring to.]`,
              });
            }
          } catch {}
        }
      }
    }

    const attachments = parseAttachments(args.message);
    let aiResponse =
      "I'm having trouble connecting right now. Please try again in a moment.";

    if (client) {
      try {
        const setStreamingStatus = async (status: StreamingStatus) => {
          await ctx.runMutation(internal.chat.setSearchStatus, {
            userId: session._id,
            ...status,
          });
        };
        let documentsCachePromise: Promise<DocumentDoc[]> | undefined;
        let recentMemoriesCache: MemoryDoc[] | undefined;
        const getDocumentsCache = async () => {
          if (!documentsCachePromise) {
            documentsCachePromise = ctx.runQuery(api.documents.list, {
              token: args.token,
            });
          }
          return documentsCachePromise;
        };
        const getRecentMemoriesCache = async (): Promise<MemoryDoc[]> => {
          if (!recentMemoriesCache) {
            recentMemoriesCache = await listMemoriesForAI(ctx, session._id, 100);
          }
          return recentMemoriesCache ?? [];
        };

        await setStreamingStatus({
          phase: "analyzing",
          toolName: "planner",
          detail: "Understanding request and loading relevant context",
          source: "chat",
          events: [
            { label: "Context", value: "recent chat + memories" },
          ],
          step: 1,
          totalSteps: 4,
        });

        const conversation: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
          {
            role: "system",
            content: buildSystemPrompt(
              effectiveTimezone,
              args.currentTime ?? new Date().toISOString()
            ),
          },
          ...recentChat,
          ...(attachments.length > 0
            ? [
                {
                  role: "system" as const,
                  content: `Attachment metadata for the latest user message: ${JSON.stringify(
                    attachments
                  )}`,
                },
              ]
            : []),
          { role: "user", content: args.message },
        ];

        const initialGrounding = await buildGroundingContext(ctx, {
          token: args.token,
          message: args.message,
          userId: session._id,
          recentMemories: await getRecentMemoriesCache(),
        });

        if (initialGrounding.shouldGround) {
          conversation.splice(conversation.length - 1, 0, {
            role: "system",
            content: [
              "Authoritative DB grounding for the latest user request follows.",
              "Treat this as current stored data from Convex, not guesswork.",
              initialGrounding.shouldPreferUpdate
                ? "This request appears to modify an existing item. Prefer update_memory. Do not create a new item unless you explicitly determine there is no existing match."
                : "This request is related to stored personal data. Answer only from DB-backed context or by calling tools again if needed.",
              `Matched memories: ${JSON.stringify(initialGrounding.searchResults)}`,
              `Recent memories: ${JSON.stringify(initialGrounding.recentMemories)}`,
              "CRITICAL: If you use any of the above memories to answer, you MUST call surface_cards with their IDs. If for some reason you cannot call the tool, you MUST append `<!--MEMORA_USED_IDS:[\"id1\"]-->` as the last line of your response.",
            ].join("\n"),
          });
        }

        await setStreamingStatus({
          query: initialGrounding.shouldGround ? args.message : undefined,
          phase: initialGrounding.shouldGround ? "grounding" : "thinking",
          toolName: initialGrounding.shouldGround ? "memory_grounding" : "planner",
          detail: initialGrounding.shouldGround
            ? `Checked stored context${initialGrounding.searchCount ? ` (${initialGrounding.searchCount} match${initialGrounding.searchCount === 1 ? "" : "es"})` : ""}`
            : "Preparing assistant response",
          source: initialGrounding.shouldGround ? "memories" : "chat",
          cacheState: initialGrounding.shouldGround
            ? initialGrounding.isCached
              ? "cached"
              : "fresh"
            : undefined,
          resultCount: initialGrounding.shouldGround
            ? initialGrounding.searchCount
            : undefined,
          previewItems: initialGrounding.shouldGround
            ? toPreviewItems(initialGrounding.searchResults, "Stored memory")
            : undefined,
          events: initialGrounding.shouldGround
            ? [
                { label: "Scope", value: "personal facts and reminders" },
                { label: "Policy", value: "DB grounded" },
              ]
            : undefined,
          step: 2,
          totalSteps: 4,
        });

        let finalText = "";
        let pendingDeletionItems: Array<{ id: string; title: string; content: string; entry_kind: string }> = [];
        const pendingCardIds = new Set<string>();
        let pendingSearchIsCached = false;
        let surfaceCardsCalled = false;
        let writeToolCalled = false; // true once update_memory or create_memory actually executes
        let writeFallbackMessage: string | null = null;
        // Candidate memory ID+title pairs collected from search/list — used as minimal context for forced surface_cards
        let surfaceCandidates: Array<{ id: string; title: string }> = [];

        // Keep grounding hits as fallback candidates only. Final surfaced cards
        // should come from explicit surface_cards tool calls whenever possible.
        if (initialGrounding.shouldGround) {
          pendingSearchIsCached = initialGrounding.isCached;
          if (initialGrounding.searchResults.length > 0) {
            surfaceCandidates = initialGrounding.searchResults.map((mem) => ({
              id: String(mem.id),
              title: mem.title ?? "",
            }));
          }
        }
        const createdMemoriesByDedupeKey = new Map<
          string,
          { id: Id<"memories">; title: string }
        >();

        let finalIteration = 0;
        for (let iteration = 0; iteration < 4; iteration += 1) {
          finalIteration = iteration;
          await setStreamingStatus({
            phase: "thinking",
            toolName: "planner",
            detail: iteration === 0 ? "Choosing the next backend operation" : "Continuing multi-step reasoning",
            source: "chat",
            step: 2,
            totalSteps: 4,
          });
          const response = await client.chat.completions.create({
            model: OPENAI_CHAT_MODEL,
            messages: conversation,
            tools: TOOLS,
            tool_choice: "auto",
            temperature: 0.3,
            max_completion_tokens: 2048,
          });

          const choice = response.choices[0]?.message;
          if (!choice) {
            break;
          }

          const content = extractTextContent(choice.content);
          if (!choice.tool_calls?.length) {
            // Conditional Forced Turn Fallback:
            // If grounding/search was active but the AI forgot the mandatory <!--MEMORA_USED_IDS--> comment,
            // we force one final turn to collect them. This handles broad lists and edge cases.
            if (content && 
                (initialGrounding.shouldGround || surfaceCandidates.length > 0) && 
                !surfaceCardsCalled && 
                !content.includes("<!--MEMORA_USED_IDS:") && 
                iteration < 3) {
              conversation.push({ role: "assistant", content });
              conversation.push({
                role: "user",
                content: "You answered the user but forgot to provide the memory IDs you used. You MUST append <!--MEMORA_USED_IDS:[\"id1\", \"id2\"]--> as the final line of your response with the IDs of the memories you drew on.",
              });
              continue;
            }
            finalText = content || finalText;
            break;
          }

          conversation.push({
            role: "assistant",
            content,
            tool_calls: choice.tool_calls,
          });

          for (const toolCall of choice.tool_calls) {
            if (toolCall.type !== "function") {
              continue;
            }

            const fnName = toolCall.function.name;
            const fnArgs = JSON.parse(toolCall.function.arguments || "{}") as Record<
              string,
              unknown
            >;
            const toolDetails: Record<string, StreamingStatus> = {
              search_memories: {
                phase: "searching",
                detail: `Searching memories${typeof fnArgs.query === "string" && fnArgs.query.trim() ? ` for "${String(fnArgs.query).trim()}"` : ""}`,
                source: "memories",
                events: [
                  { label: "Scope", value: "title, content, people, locations, topics" },
                  { label: "Mode", value: "semantic + keyword" },
                ],
                query: typeof fnArgs.query === "string" ? String(fnArgs.query) : undefined,
              },
              search_documents: {
                phase: "searching",
                detail: `Searching documents${typeof fnArgs.query === "string" && fnArgs.query.trim() ? ` for "${String(fnArgs.query).trim()}"` : ""}`,
                source: "documents",
                events: [
                  { label: "Scope", value: "filename, summary, extracted text, key details" },
                  { label: "Mode", value: "vector + keyword" },
                ],
                query: typeof fnArgs.query === "string" ? String(fnArgs.query) : undefined,
              },
              create_memory: {
                phase: "writing",
                detail: "Saving a new memory",
                source: "memories",
                events: [{ label: "Operation", value: "insert" }],
              },
              update_memory: {
                phase: "writing",
                detail: "Updating an existing memory or reminder",
                source: "memories",
                events: [{ label: "Operation", value: "update" }],
              },
              sync_reminder: {
                phase: "writing",
                detail: "Triggering Google Calendar sync for a reminder",
                source: "integrations",
                events: [{ label: "Operation", value: "manual reminder sync" }],
              },
              remove_reminder_sync: {
                phase: "writing",
                detail: "Removing Google Calendar sync for a reminder",
                source: "integrations",
                events: [{ label: "Operation", value: "remove reminder sync" }],
              },
              propose_deletion: {
                phase: "searching",
                detail: "Finding items to delete for confirmation",
                source: "memories",
                events: [{ label: "Operation", value: "find matches only" }],
              },
              list_deleted_memories: {
                phase: "loading",
                detail: "Loading deleted memories",
                source: "memories",
                events: [{ label: "Status", value: "deleted" }],
              },
              restore_memory: {
                phase: "writing",
                detail: "Restoring a deleted memory",
                source: "memories",
                events: [{ label: "Operation", value: "restore" }],
              },
              list_memories: {
                phase: "loading",
                detail: "Listing stored memories",
                source: "memories",
                events: [{ label: "Status", value: "active" }],
              },
              get_stats: {
                phase: "analyzing",
                detail: "Computing memory statistics",
                source: "memories",
                events: [{ label: "Analysis", value: "counts and trends" }],
              },
              analyze_memories: {
                phase: "analyzing",
                detail: "Analyzing memory patterns",
                source: "memories",
                events: [{ label: "Analysis", value: "pattern scan" }],
              },
              history: {
                phase: "loading",
                detail: "Loading edit history",
                source: "memory_history",
                events: [{ label: "Scope", value: "snapshots and undo" }],
              },
              manage_topics: {
                phase: "writing",
                detail: "Updating topic organization",
                source: "topics",
                events: [{ label: "Operation", value: String(fnArgs.operation || "update") }],
              },
              attach_file_to_memory: {
                phase: "writing",
                detail: "Attaching a file to memory",
                source: "attachments",
                events: [{ label: "Operation", value: "attach file" }],
              },
              surface_cards: {
                phase: "finalizing",
                detail: "Preparing memory cards for the UI",
                source: "ui",
                events: [{ label: "Operation", value: "surface cards" }],
              },
            };
            const streamingDetail = toolDetails[fnName] ?? {
              phase: "working",
              detail: `Running ${fnName}`,
              source: "backend",
            };
            await setStreamingStatus({
              query: streamingDetail.query,
              phase: streamingDetail.phase,
              toolName: fnName,
              detail: streamingDetail.detail,
              source: streamingDetail.source,
              cacheState: undefined,
              resultCount: undefined,
              previewItems: undefined,
              events: streamingDetail.events,
              step: 3,
              totalSteps: 4,
            });
            let result = JSON.stringify({ error: "Unknown tool" });

            if (fnName === "search_memories") {
              const searchQuery = String(fnArgs.query || "");
              await setStreamingStatus({
                query: searchQuery,
                phase: "searching",
                toolName: "search_memories",
                detail: searchQuery.trim()
                  ? `Searching memories for "${searchQuery.trim()}"`
                  : "Searching memories",
                source: "memories",
                events: [
                  { label: "Scope", value: "title, content, people, locations, topics" },
                  { label: "Mode", value: "semantic + keyword" },
                ],
                step: 3,
                totalSteps: 4,
              });
              try {
                const searchQueryHash = normalizeSearchQueryHash(searchQuery);
                const userMessageHash = normalizeSearchQueryHash(args.message);
                const searchRes =
                  initialGrounding.shouldGround &&
                  searchQueryHash.length > 0 &&
                  searchQueryHash === userMessageHash
                    ? {
                        results: initialGrounding.searchResults,
                        count: initialGrounding.searchCount,
                        isCached: initialGrounding.isCached,
                        searchMode: initialGrounding.isCached
                          ? ("semantic_cached" as const)
                          : ("semantic_fresh" as const),
                      }
                    : await searchMemories(ctx, {
                        token: args.token,
                        query: searchQuery,
                        userId: session._id,
                        recentMemories: await getRecentMemoriesCache(),
                      });
                pendingSearchIsCached = searchRes.isCached ?? false;
                surfaceCandidates = searchRes.results.map((r: { id: string; title?: string }) => ({ id: String(r.id), title: r.title ?? "" }));
                await setStreamingStatus({
                  query: searchQuery.trim() || undefined,
                  phase: "searching",
                  toolName: "search_memories",
                  detail:
                    searchRes.count > 0
                      ? `Found ${searchRes.count} matching ${searchRes.count === 1 ? "memory" : "memories"}`
                      : "No matching memories found",
                  source: "memories",
                  cacheState:
                    searchRes.searchMode === "semantic_cached"
                      ? "cached"
                      : searchRes.searchMode === "semantic_fresh"
                        ? "fresh"
                        : undefined,
                  resultCount: searchRes.count,
                  previewItems: toPreviewItems(searchRes.results, "Stored memory"),
                  events: [
                    { label: "Scope", value: "title, content, people, locations, topics" },
                    {
                      label: "Ranking",
                      value:
                        searchRes.searchMode === "recent_only"
                          ? "recent memory list"
                          : "semantic + keyword fusion",
                    },
                    {
                      label: "Cache",
                      value:
                        searchRes.searchMode === "semantic_cached"
                          ? "embedding cache hit"
                          : searchRes.searchMode === "semantic_fresh"
                            ? "fresh semantic search"
                            : "no query text",
                    },
                  ],
                  step: 3,
                  totalSteps: 4,
                });
                result = JSON.stringify(searchRes);
              } finally {
                await setStreamingStatus({
                  phase: "thinking",
                  toolName: "planner",
                  detail: "Processing search results",
                  source: "chat",
                  step: 3,
                  totalSteps: 4,
                });
              }
            } else if (fnName === "search_documents") {
              const documentSearch = await searchDocuments(ctx, {
                token: args.token,
                query: String(fnArgs.query || ""),
                userId: session._id,
                documents: await getDocumentsCache(),
              });
              await setStreamingStatus({
                query:
                  typeof fnArgs.query === "string" && fnArgs.query.trim()
                    ? fnArgs.query.trim()
                    : undefined,
                phase: "searching",
                toolName: "search_documents",
                detail:
                  documentSearch.count > 0
                    ? `Found ${documentSearch.count} matching ${documentSearch.count === 1 ? "document" : "documents"}`
                    : "No matching documents found",
                source: "documents",
                resultCount: documentSearch.count,
                previewItems: toPreviewItems(documentSearch.results, "Stored document"),
                events: [
                  { label: "Scope", value: "filename, summary, extracted text, key details" },
                  {
                    label: "Mode",
                    value:
                      documentSearch.searchMode === "vector_keyword"
                        ? "vector + keyword"
                        : documentSearch.searchMode === "keyword_only"
                          ? "keyword fallback"
                          : "recent documents",
                  },
                ],
                step: 3,
                totalSteps: 4,
              });
              result = JSON.stringify({
                results: documentSearch.results,
                count: documentSearch.count,
              });
            } else if (fnName === "create_memory") {
              const shouldForceUpdate = shouldPreferUpdatingExisting(args.message);
              const referentialUpdate = isReferentialUpdate(args.message);
              let forcedUpdateTargetId: string | undefined;
              let forcedUpdateTargetLabel: string | undefined;
              let existingMatchesCount = 0;
              let existingMatchesPreview: ReturnType<typeof toMemorySummary>[] = [];

              if (shouldForceUpdate) {
                const existingMatches =
                  initialGrounding.shouldPreferUpdate && initialGrounding.shouldGround
                    ? {
                        results: initialGrounding.searchResults,
                        count: initialGrounding.searchCount,
                      }
                    : await searchMemories(ctx, {
                        token: args.token,
                        query: args.message,
                        userId: session._id,
                        recentMemories: await getRecentMemoriesCache(),
                      });
                existingMatchesCount = existingMatches.count;
                existingMatchesPreview = existingMatches.results;

                const bestSearchMatch = existingMatches.results[0];
                const latestReferencedId = latestReferencedMemoryIds[0];

                if (referentialUpdate && latestReferencedId) {
                  forcedUpdateTargetId = latestReferencedId;
                  forcedUpdateTargetLabel = "recently referenced memory";
                } else if (bestSearchMatch?.id) {
                  forcedUpdateTargetId = String(bestSearchMatch.id);
                  forcedUpdateTargetLabel = bestSearchMatch.title ?? "matched memory";
                } else if (latestReferencedId) {
                  forcedUpdateTargetId = latestReferencedId;
                  forcedUpdateTargetLabel = "recently referenced memory";
                }
              }

              const normalized = normalizeMemoryFields(fnArgs);
              const normalizedTitle =
                normalized.entryKind === "reminder" && normalized.schedule?.dueAt
                  ? getReminderTitleWithoutSchedule(
                      normalized.title ||
                        (typeof fnArgs.title === "string" ? fnArgs.title : undefined),
                      normalized.content ||
                        (typeof fnArgs.content === "string" ? fnArgs.content : "")
                    )
                  : normalized.title;
              const normalizedForWrite = {
                ...normalized,
                title: normalizedTitle,
              };
              const contentToSave =
                normalizedForWrite.content ||
                (typeof fnArgs.content === "string" ? fnArgs.content.trim() : "") ||
                (typeof fnArgs.title === "string" ? fnArgs.title.trim() : "");
              const dedupeKey = buildCreateMemoryDedupeKey({
                title:
                  normalizedForWrite.title ||
                  (typeof fnArgs.title === "string" ? fnArgs.title : undefined),
                content: contentToSave,
              });
              const existingCreated = createdMemoriesByDedupeKey.get(dedupeKey);
              const schedulingFields = hasExplicitSchedulingFields(fnArgs)
                ? toStoredMemoryFields(normalizedForWrite)
                : {};
              const memoryUpdatePatch = {
                ...(normalizedForWrite.title ? { title: normalizedForWrite.title } : {}),
                ...(normalizedForWrite.people ? { people: normalizedForWrite.people } : {}),
                ...(normalizedForWrite.locations ? { locations: normalizedForWrite.locations } : {}),
                ...(normalizedForWrite.contextTags
                  ? { contextTags: normalizedForWrite.contextTags }
                  : {}),
                ...schedulingFields,
                ...(typeof normalizedForWrite.importance === "string"
                  ? {
                      importance: normalizedForWrite.importance as
                        | "critical"
                        | "high"
                        | "normal"
                        | "low",
                    }
                  : {}),
                ...(typeof normalizedForWrite.lifeArea === "string"
                  ? {
                      lifeArea: normalizedForWrite.lifeArea as
                        | "career"
                        | "family"
                        | "health"
                        | "finance"
                        | "social"
                        | "hobbies"
                        | "education"
                        | "travel"
                        | "self-care"
                        | "relationships",
                    }
                  : {}),
                ...(typeof normalizedForWrite.sentimentScore === "number"
                  ? { sentimentScore: normalizedForWrite.sentimentScore }
                  : {}),
                ...(Array.isArray(normalizedForWrite.linkedUrls)
                  ? { linkedUrls: normalizedForWrite.linkedUrls }
                  : {}),
                ...(Array.isArray(normalizedForWrite.extractedActions)
                  ? { extractedActions: normalizedForWrite.extractedActions }
                  : {}),
              };
              const updateExistingPatch = {
                ...(normalizedForWrite.content ? { content: normalizedForWrite.content } : {}),
                ...memoryUpdatePatch,
              };

              if (forcedUpdateTargetId) {
                await ctx.runMutation(api.memories.update, {
                  token: args.token,
                  id: forcedUpdateTargetId as Id<"memories">,
                  ...updateExistingPatch,
                });
                recentMemoriesCache = undefined;
                pendingCardIds.add(forcedUpdateTargetId);
                await setStreamingStatus({
                  phase: "writing",
                  toolName: "create_memory",
                  detail: "Applied edit to existing memory (duplicate prevented)",
                  source: "memories",
                  resultCount: existingMatchesCount || undefined,
                  previewItems:
                    existingMatchesPreview.length > 0
                      ? toPreviewItems(existingMatchesPreview, "Stored memory")
                      : undefined,
                  events: [
                    { label: "Policy", value: "prefer update over duplicate" },
                    { label: "Target", value: forcedUpdateTargetId },
                    ...(forcedUpdateTargetLabel
                      ? [{ label: "Resolution", value: forcedUpdateTargetLabel }]
                      : []),
                  ],
                  step: 3,
                  totalSteps: 4,
                });
                writeToolCalled = true;
                result = JSON.stringify({
                  success: true,
                  updated_existing: true,
                  memory_id: forcedUpdateTargetId,
                });
              } else if (existingCreated) {
                if (Object.keys(memoryUpdatePatch).length > 0) {
                  await ctx.runMutation(api.memories.update, {
                    token: args.token,
                    id: existingCreated.id,
                    ...memoryUpdatePatch,
                  });
                  recentMemoriesCache = undefined;
                }
                pendingCardIds.add(String(existingCreated.id));
                await setStreamingStatus({
                  phase: "writing",
                  toolName: "create_memory",
                  detail: "Reused an equivalent memory instead of creating a duplicate",
                  source: "memories",
                  previewItems: [truncateStatusText(existingCreated.title)],
                  events: [
                    { label: "Operation", value: "deduplicated" },
                    { label: "Target", value: String(existingCreated.id) },
                  ],
                  step: 3,
                  totalSteps: 4,
                });
                result = JSON.stringify({
                  success: true,
                  deduped: true,
                  memory: {
                    id: existingCreated.id,
                    title: existingCreated.title,
                  },
                });
              } else {
                const created = await ctx.runAction(
                  api.actions.processMemory.captureMemory,
                  {
                    token: args.token,
                    content: contentToSave,
                    currentTime: args.currentTime,
                    currentTimezone: effectiveTimezone,
                  }
                );

                if (Object.keys(memoryUpdatePatch).length > 0) {
                  await ctx.runMutation(api.memories.update, {
                    token: args.token,
                    id: created.memoryId,
                    ...memoryUpdatePatch,
                  });
                }
                recentMemoriesCache = undefined;

                const resolvedTitle =
                  normalizedForWrite.title || created.structured.title || "New Memory";
                createdMemoriesByDedupeKey.set(dedupeKey, {
                  id: created.memoryId,
                  title: resolvedTitle,
                });
                pendingCardIds.add(String(created.memoryId));
                await setStreamingStatus({
                  phase: "writing",
                  toolName: "create_memory",
                  detail: "Saved a new memory entry",
                  source: "memories",
                  previewItems: [truncateStatusText(resolvedTitle)],
                  events: [
                    {
                      label: "Kind",
                      value:
                        normalizedForWrite.entryKind === "reminder" ? "reminder" : "memory",
                    },
                    { label: "Target", value: String(created.memoryId) },
                  ],
                  step: 3,
                  totalSteps: 4,
                });
                writeToolCalled = true;
                result = JSON.stringify({
                  success: true,
                  memory: {
                    id: created.memoryId,
                    title: resolvedTitle,
                  },
                });
              }
            } else if (fnName === "update_memory") {
              try {
                const normalized = normalizeMemoryFields(fnArgs);
                const normalizedTitle =
                  normalized.entryKind === "reminder" && normalized.schedule?.dueAt
                    ? getReminderTitleWithoutSchedule(
                        normalized.title ||
                          (typeof fnArgs.title === "string" ? fnArgs.title : undefined),
                        normalized.content ||
                          (typeof fnArgs.content === "string" ? fnArgs.content : "")
                      )
                    : normalized.title;
                const normalizedForWrite = {
                  ...normalized,
                  title: normalizedTitle,
                };
                const schedulingFields = hasExplicitSchedulingFields(fnArgs)
                  ? toStoredMemoryFields(normalizedForWrite)
                  : {};
                const explicitMemoryId =
                  typeof fnArgs.memory_id === "string" ? fnArgs.memory_id.trim() : "";
                let targetMemoryId = explicitMemoryId;
                if (!targetMemoryId && latestReferencedMemoryIds.length > 0) {
                  targetMemoryId = latestReferencedMemoryIds[0];
                }
                if (!targetMemoryId) {
                  const resolvedFallback = await resolveMemoryReference(ctx, {
                    token: args.token,
                    userId: session._id,
                    reference: args.message,
                    recentMemories: await getRecentMemoriesCache(),
                  });
                  if (resolvedFallback) {
                    targetMemoryId = String(resolvedFallback);
                  }
                }
                if (!targetMemoryId) {
                  throw new Error(
                    "Couldn't determine which memory to update. Please specify the memory or reminder."
                  );
                }
                await ctx.runMutation(api.memories.update, {
                  token: args.token,
                  id: targetMemoryId as Id<"memories">,
                  ...(normalizedForWrite.title ? { title: normalizedForWrite.title } : {}),
                  ...(normalizedForWrite.content ? { content: normalizedForWrite.content } : {}),
                  ...(normalizedForWrite.people ? { people: normalizedForWrite.people } : {}),
                  ...(normalizedForWrite.locations ? { locations: normalizedForWrite.locations } : {}),
                  ...(normalizedForWrite.contextTags
                    ? { contextTags: normalizedForWrite.contextTags }
                    : {}),
                  ...schedulingFields,
                });
                recentMemoriesCache = undefined;
                pendingCardIds.add(targetMemoryId);
                await setStreamingStatus({
                  phase: "writing",
                  toolName: "update_memory",
                  detail: "Updated the selected memory",
                  source: "memories",
                  previewItems: [
                    truncateStatusText(
                      normalizedForWrite.title ||
                        (typeof fnArgs.content === "string" ? fnArgs.content : undefined) ||
                        "Updated memory"
                    ),
                  ],
                  events: [
                    { label: "Operation", value: "update committed" },
                    { label: "Target", value: targetMemoryId },
                    ...(explicitMemoryId
                      ? []
                      : [{ label: "Resolution", value: "resolved from chat context" }]),
                  ],
                  step: 3,
                  totalSteps: 4,
                });
                writeToolCalled = true;
                result = JSON.stringify({ success: true, memory_id: targetMemoryId });
              } catch (error) {
                result = JSON.stringify({
                  error:
                    error instanceof Error ? error.message : "Failed to update memory",
                });
              }
            } else if (fnName === "sync_reminder") {
              try {
                const explicitMemoryId =
                  typeof fnArgs.memory_id === "string"
                    ? fnArgs.memory_id.trim()
                    : "";
                const requestedQuery =
                  typeof fnArgs.query === "string" ? fnArgs.query.trim() : "";
                let targetMemoryId = explicitMemoryId;

                if (!targetMemoryId && latestReferencedMemoryIds.length > 0) {
                  targetMemoryId = latestReferencedMemoryIds[0];
                }
                if (!targetMemoryId) {
                  const resolvedFallback = await resolveMemoryReference(ctx, {
                    token: args.token,
                    userId: session._id,
                    reference: requestedQuery || args.message,
                    recentMemories: await getRecentMemoriesCache(),
                  });
                  if (resolvedFallback) {
                    targetMemoryId = String(resolvedFallback);
                  }
                }
                if (!targetMemoryId) {
                  throw new Error(
                    "Couldn't determine which reminder to sync. Please specify the reminder."
                  );
                }

                const syncResult = await ctx.runMutation(
                  api.integrations.triggerReminderSync,
                  {
                    token: args.token,
                    memoryId: targetMemoryId as Id<"memories">,
                  }
                );
                pendingCardIds.add(targetMemoryId);

                await setStreamingStatus({
                  phase: "writing",
                  toolName: "sync_reminder",
                  detail: syncResult.queued
                    ? syncResult.reason === "in_flight"
                      ? "Reminder sync is already in progress"
                      : "Triggered Google Calendar sync for reminder"
                    : "Google Calendar sync was not triggered",
                  source: "integrations",
                  events: [
                    { label: "Operation", value: "manual reminder sync" },
                    { label: "Target", value: targetMemoryId },
                    ...(typeof syncResult.reason === "string"
                      ? [{ label: "Result", value: syncResult.reason }]
                      : []),
                  ],
                  step: 3,
                  totalSteps: 4,
                });
                if (syncResult.queued) {
                  writeToolCalled = true;
                  writeFallbackMessage = syncResult.message;
                }
                result = JSON.stringify({
                  success: !!syncResult.queued,
                  memory_id: targetMemoryId,
                  ...syncResult,
                });
              } catch (error) {
                result = JSON.stringify({
                  error:
                    error instanceof Error
                      ? error.message
                      : "Failed to trigger reminder sync",
                });
              }
            } else if (fnName === "remove_reminder_sync") {
              try {
                const explicitMemoryId =
                  typeof fnArgs.memory_id === "string"
                    ? fnArgs.memory_id.trim()
                    : "";
                const requestedQuery =
                  typeof fnArgs.query === "string" ? fnArgs.query.trim() : "";
                let targetMemoryId = explicitMemoryId;

                if (!targetMemoryId && latestReferencedMemoryIds.length > 0) {
                  targetMemoryId = latestReferencedMemoryIds[0];
                }
                if (!targetMemoryId) {
                  const resolvedFallback = await resolveMemoryReference(ctx, {
                    token: args.token,
                    userId: session._id,
                    reference: requestedQuery || args.message,
                    recentMemories: await getRecentMemoriesCache(),
                  });
                  if (resolvedFallback) {
                    targetMemoryId = String(resolvedFallback);
                  }
                }
                if (!targetMemoryId) {
                  throw new Error(
                    "Couldn't determine which reminder to unsync. Please specify the reminder."
                  );
                }

                const unsyncResult = await ctx.runMutation(
                  api.integrations.removeReminderSync,
                  {
                    token: args.token,
                    memoryId: targetMemoryId as Id<"memories">,
                  }
                );
                pendingCardIds.add(targetMemoryId);

                await setStreamingStatus({
                  phase: "writing",
                  toolName: "remove_reminder_sync",
                  detail: unsyncResult.removed
                    ? "Removed Google Calendar sync for reminder"
                    : "Google Calendar sync removal did not apply",
                  source: "integrations",
                  events: [
                    { label: "Operation", value: "remove reminder sync" },
                    { label: "Target", value: targetMemoryId },
                    { label: "Result", value: unsyncResult.reason },
                  ],
                  step: 3,
                  totalSteps: 4,
                });
                if (unsyncResult.removed) {
                  writeToolCalled = true;
                  writeFallbackMessage = unsyncResult.message;
                }
                result = JSON.stringify({
                  success: !!unsyncResult.removed,
                  memory_id: targetMemoryId,
                  ...unsyncResult,
                });
              } catch (error) {
                result = JSON.stringify({
                  error:
                    error instanceof Error
                      ? error.message
                      : "Failed to remove reminder sync",
                });
              }
            } else if (fnName === "propose_deletion") {
              const entryKind = typeof fnArgs.entry_kind === "string" ? fnArgs.entry_kind : "any";
              const deletionQuery = String(fnArgs.query || "");
              const searchResult =
                initialGrounding.shouldGround &&
                deletionQuery.trim().toLowerCase() === args.message.trim().toLowerCase()
                  ? {
                      results: initialGrounding.searchResults,
                      count: initialGrounding.searchCount,
                    }
                  : await searchMemories(ctx, {
                      token: args.token,
                      query: deletionQuery,
                      userId: session._id,
                      recentMemories: await getRecentMemoriesCache(),
                    });

              let matchedItems = searchResult.results;
              if (entryKind === "reminder") {
                matchedItems = matchedItems.filter((m: any) => m.entry_kind === "reminder");
              } else if (entryKind === "memory") {
                matchedItems = matchedItems.filter((m: any) => m.entry_kind !== "reminder");
              }

              const newItems = matchedItems.map((m: any) => ({
                id: String(m.id),
                title: String(m.title || "Untitled"),
                content: String(m.content || ""),
                entry_kind: String(m.entry_kind || "memory"),
              }));
              // Accumulate across multiple propose_deletion calls (e.g. one for memories, one for reminders)
              const existingIds = new Set(pendingDeletionItems.map((i) => i.id));
              pendingDeletionItems = [
                ...pendingDeletionItems,
                ...newItems.filter((i) => !existingIds.has(i.id)),
              ];
              await setStreamingStatus({
                query: typeof fnArgs.query === "string" ? fnArgs.query : undefined,
                phase: "searching",
                toolName: "propose_deletion",
                detail:
                  pendingDeletionItems.length > 0
                    ? `Prepared ${pendingDeletionItems.length} item${pendingDeletionItems.length === 1 ? "" : "s"} for delete confirmation`
                    : "No matching items found for deletion",
                source: "memories",
                resultCount: pendingDeletionItems.length,
                previewItems: pendingDeletionItems
                  .slice(0, 3)
                  .map((item) => truncateStatusText(item.title || item.content || "Stored memory")),
                events: [
                  { label: "Mode", value: "proposal only" },
                  { label: "Filter", value: entryKind },
                ],
                step: 3,
                totalSteps: 4,
              });

              result = JSON.stringify(
                pendingDeletionItems.length > 0
                  ? {
                      found: pendingDeletionItems.length,
                      message: `Found ${pendingDeletionItems.length} item(s). They are being shown to the user for confirmation. Do NOT delete them yourself — wait for the user to confirm in the app.`,
                    }
                  : { found: 0, message: "No matching items found." }
              );
            } else if (fnName === "list_deleted_memories") {
              try {
                const limit =
                  typeof fnArgs.limit === "number" ? Math.min(fnArgs.limit, 50) : 20;
                const deleted = await ctx.runQuery(api.memories.listDeleted, {
                  token: args.token,
                  limit,
                });
                await setStreamingStatus({
                  phase: "loading",
                  toolName: "list_deleted_memories",
                  detail: `Loaded ${deleted.length} deleted ${deleted.length === 1 ? "memory" : "memories"}`,
                  source: "memories",
                  resultCount: deleted.length,
                  previewItems: toPreviewItems(deleted, "Deleted memory"),
                  events: [
                    { label: "Status", value: "deleted" },
                    { label: "Limit", value: `${limit}` },
                  ],
                  step: 3,
                  totalSteps: 4,
                });
                result = JSON.stringify({
                  deleted_memories: deleted.map((memory: MemoryDoc) => ({
                    ...toMemorySummary(memory),
                    deletedAt: memory.deletedAt
                      ? new Date(memory.deletedAt).toISOString()
                      : null,
                  })),
                  count: deleted.length,
                });
              } catch (error) {
                result = JSON.stringify({
                  error:
                    error instanceof Error ? error.message : "Failed to list deleted memories",
                });
              }
            } else if (fnName === "restore_memory") {
              try {
                await ctx.runMutation(api.memories.restore, {
                  token: args.token,
                  id: fnArgs.memory_id as Id<"memories">,
                });
                recentMemoriesCache = undefined;
                pendingCardIds.add(String(fnArgs.memory_id as string));
                await setStreamingStatus({
                  phase: "writing",
                  toolName: "restore_memory",
                  detail: "Restored the deleted memory",
                  source: "memories",
                  events: [
                    { label: "Operation", value: "restore" },
                    { label: "Target", value: String(fnArgs.memory_id) },
                  ],
                  step: 3,
                  totalSteps: 4,
                });
                result = JSON.stringify({ success: true });
              } catch (error) {
                result = JSON.stringify({
                  error:
                    error instanceof Error ? error.message : "Failed to restore memory",
                });
              }
            } else if (fnName === "list_memories") {
              const memories = await getRecentMemoriesCache();
              const limit =
                typeof fnArgs.limit === "number" ? Math.min(fnArgs.limit, 50) : 20;
              const ordered =
                fnArgs.sort === "oldest" ? [...memories].reverse() : memories;
              const listed = ordered.slice(0, limit);
              surfaceCandidates = listed.map((m: MemoryDoc) => ({ id: String(m._id), title: m.title ?? "" }));
              await setStreamingStatus({
                phase: "loading",
                toolName: "list_memories",
                detail: `Loaded ${listed.length} of ${memories.length} stored memories`,
                source: "memories",
                resultCount: memories.length,
                previewItems: toPreviewItems(listed, "Stored memory"),
                events: [
                  { label: "Sort", value: fnArgs.sort === "oldest" ? "oldest first" : "newest first" },
                  { label: "Limit", value: `${limit}` },
                ],
                step: 3,
                totalSteps: 4,
              });
              result = JSON.stringify({
                memories: listed.map((memory: MemoryDoc) => toMemoryCompact(memory)),
                count: memories.length,
              });
            } else if (fnName === "get_stats") {
              const memories = await getRecentMemoriesCache();
              let withReminders = 0;
              let recurring = 0;

              for (const memory of memories) {
                if (isReminder(memory)) withReminders += 1;
                if (getMemorySchedule(memory)?.isRecurring) recurring += 1;
              }

              const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
              const recentCount = memories.filter(
                (memory: MemoryDoc) => memory._creationTime >= weekAgo
              ).length;
              await setStreamingStatus({
                phase: "analyzing",
                toolName: "get_stats",
                detail: `Computed stats across ${memories.length} stored memories`,
                source: "memories",
                resultCount: memories.length,
                events: [
                  { label: "Reminders", value: `${withReminders}` },
                  { label: "Recurring", value: `${recurring}` },
                  { label: "Recent 7d", value: `${recentCount}` },
                ],
                step: 3,
                totalSteps: 4,
              });
              result = JSON.stringify({
                total: memories.length,
                withReminders,
                recurring,
                recentCount,
              });
            } else if (fnName === "analyze_memories") {
              const memories = await getRecentMemoriesCache();
              const limit =
                typeof fnArgs.limit === "number" ? Math.min(fnArgs.limit, 50) : 50;
              await setStreamingStatus({
                phase: "analyzing",
                toolName: "analyze_memories",
                detail: `Preparing ${Math.min(limit, memories.length)} memories for analysis`,
                source: "memories",
                resultCount: memories.length,
                previewItems: toPreviewItems(memories.slice(0, limit), "Stored memory"),
                events: [
                  { label: "Limit", value: `${limit}` },
                  { label: "Scope", value: "active memories only" },
                ],
                step: 3,
                totalSteps: 4,
              });
              result = JSON.stringify({
                memories: memories
                  .slice(0, limit)
                  .map((memory: MemoryDoc) => toMemoryCompact(memory)),
                count: memories.length,
              });
            } else if (fnName === "history") {
              if (fnArgs.action === "list") {
                const history = await ctx.runQuery(api.history.listSnapshots, {
                  token: args.token,
                  ...(typeof fnArgs.memory_id === "string"
                    ? { memoryId: fnArgs.memory_id as Id<"memories"> }
                    : {}),
                  ...(typeof fnArgs.limit === "number"
                    ? { limit: Math.min(fnArgs.limit, 20) }
                    : { limit: 10 }),
                });
                await setStreamingStatus({
                  phase: "loading",
                  toolName: "history",
                  detail: `Loaded ${history.length} history snapshot${history.length === 1 ? "" : "s"}`,
                  source: "memory_history",
                  resultCount: history.length,
                  events: [
                    { label: "Action", value: "list" },
                    {
                      label: "Scope",
                      value: typeof fnArgs.memory_id === "string" ? "single memory" : "recent changes",
                    },
                  ],
                  step: 3,
                  totalSteps: 4,
                });
                result = JSON.stringify({
                  history,
                });
              } else if (fnArgs.action === "undo") {
                const undoResult = await ctx.runMutation(api.history.undo, {
                  token: args.token,
                  ...(typeof fnArgs.memory_id === "string"
                    ? { memoryId: fnArgs.memory_id as Id<"memories"> }
                    : {}),
                });
                result = JSON.stringify(undoResult);
                recentMemoriesCache = undefined;
                await setStreamingStatus({
                  phase: "writing",
                  toolName: "history",
                  detail: "Reverted the latest edit",
                  source: "memory_history",
                  events: [
                    { label: "Action", value: "undo" },
                    { label: "Target", value: typeof fnArgs.memory_id === "string" ? fnArgs.memory_id : "latest edited memory" },
                  ],
                  step: 3,
                  totalSteps: 4,
                });
                if (undoResult && typeof (undoResult as any).memoryId === "string") {
                  pendingCardIds.add(String((undoResult as any).memoryId));
                } else if (typeof fnArgs.memory_id === "string") {
                  pendingCardIds.add(fnArgs.memory_id);
                }
              } else if (fnArgs.action === "restore") {
                const restoreResult = await ctx.runMutation(api.history.restore, {
                  token: args.token,
                  historyId: fnArgs.history_id as Id<"memoryHistory">,
                });
                result = JSON.stringify(restoreResult);
                recentMemoriesCache = undefined;
                await setStreamingStatus({
                  phase: "writing",
                  toolName: "history",
                  detail: "Restored a historical snapshot",
                  source: "memory_history",
                  events: [
                    { label: "Action", value: "restore" },
                    { label: "History ID", value: String(fnArgs.history_id) },
                  ],
                  step: 3,
                  totalSteps: 4,
                });
                if (restoreResult && typeof (restoreResult as any).memoryId === "string") {
                  pendingCardIds.add(String((restoreResult as any).memoryId));
                }
              }
            } else if (fnName === "manage_topics") {
              if (fnArgs.operation === "retag_memory") {
                const resolvedMemoryId = await resolveMemoryReference(ctx, {
                  token: args.token,
                  userId: session._id,
                  reference:
                    typeof fnArgs.memory_id === "string" ? fnArgs.memory_id : undefined,
                  recentMemories: await getRecentMemoriesCache(),
                });

                if (!resolvedMemoryId) {
                  result = JSON.stringify({
                    success: false,
                    message: "Couldn't identify which memory to retag.",
                  });
                  conversation.push({
                    role: "tool",
                    tool_call_id: toolCall.id,
                    content: result,
                  });
                  continue;
                }

                result = JSON.stringify(
                  await ctx.runAction(internal.actions.manageTopics.handleManageTopic, {
                    userId: session._id,
                    operation: "retag_memory",
                    memoryId: resolvedMemoryId,
                    topicName:
                      typeof fnArgs.topic_name === "string" ? fnArgs.topic_name : undefined,
                  })
                );
                pendingCardIds.add(String(resolvedMemoryId));
                await setStreamingStatus({
                  phase: "writing",
                  toolName: "manage_topics",
                  detail: "Retagged the selected memory",
                  source: "topics",
                  events: [
                    { label: "Operation", value: "retag_memory" },
                    { label: "Topic", value: typeof fnArgs.topic_name === "string" ? fnArgs.topic_name : "selected topic" },
                  ],
                  step: 3,
                  totalSteps: 4,
                });
                conversation.push({
                  role: "tool",
                  tool_call_id: toolCall.id,
                  content: result,
                });
                continue;
              }

              result = JSON.stringify(
                await ctx.runAction(internal.actions.manageTopics.handleManageTopic, {
                  userId: session._id,
                  operation: fnArgs.operation as
                    | "list"
                    | "rename"
                    | "merge"
                    | "recolor"
                    | "trigger_reanalysis"
                    | "retag_memory",
                  topicSlug: typeof fnArgs.topic_slug === "string" ? fnArgs.topic_slug : undefined,
                  targetSlug: typeof fnArgs.target_slug === "string" ? fnArgs.target_slug : undefined,
                  newName: typeof fnArgs.new_name === "string" ? fnArgs.new_name : undefined,
                  newIcon: typeof fnArgs.new_icon === "string" ? fnArgs.new_icon : undefined,
                  newColor: typeof fnArgs.new_color === "string" ? fnArgs.new_color : undefined,
                  memoryId: typeof fnArgs.memory_id === "string"
                    ? (fnArgs.memory_id as Id<"memories">)
                    : undefined,
                  topicName: typeof fnArgs.topic_name === "string" ? fnArgs.topic_name : undefined,
                })
              );
              await setStreamingStatus({
                phase: fnArgs.operation === "list" ? "loading" : "writing",
                toolName: "manage_topics",
                detail:
                  fnArgs.operation === "list"
                    ? "Loaded topic organization"
                    : `Completed topic operation: ${String(fnArgs.operation || "update")}`,
                source: "topics",
                events: [
                  { label: "Operation", value: String(fnArgs.operation || "update") },
                ],
                step: 3,
                totalSteps: 4,
              });
            } else if (fnName === "attach_file_to_memory") {
              try {
                const attachmentId = await ctx.runMutation(api.memories.attachFile, {
                  token: args.token,
                  memoryId: fnArgs.memory_id as Id<"memories">,
                  url: String(fnArgs.file_url || ""),
                  filename: String(fnArgs.file_name || "Attachment"),
                  mimeType: String(
                    fnArgs.file_type || "application/octet-stream"
                  ),
                });
                pendingCardIds.add(String(fnArgs.memory_id as string));
                await setStreamingStatus({
                  phase: "writing",
                  toolName: "attach_file_to_memory",
                  detail: "Attached file metadata to the memory",
                  source: "attachments",
                  events: [
                    { label: "File", value: typeof fnArgs.file_name === "string" ? truncateStatusText(fnArgs.file_name) : "Attachment" },
                    { label: "Target", value: String(fnArgs.memory_id) },
                  ],
                  step: 3,
                  totalSteps: 4,
                });
                result = JSON.stringify({ success: true, attachment_id: attachmentId });
              } catch (error) {
                result = JSON.stringify({
                  error:
                    error instanceof Error ? error.message : "Failed to attach file",
                });
              }
            } else if (fnName === "surface_cards") {
              const ids = Array.isArray(fnArgs.ids) ? (fnArgs.ids as string[]) : [];
              for (const id of ids) pendingCardIds.add(id);
              surfaceCardsCalled = true;
              await setStreamingStatus({
                phase: "finalizing",
                toolName: "surface_cards",
                detail: ids.length > 0 ? `Preparing ${ids.length} memory card${ids.length === 1 ? "" : "s"}` : "No memory cards needed for this reply",
                source: "ui",
                resultCount: ids.length,
                events: [
                  { label: "Operation", value: "surface cards" },
                ],
                step: 3,
                totalSteps: 4,
              });
              result = JSON.stringify({ success: true });
            }

            conversation.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: result,
            });
          }

          // If AI called surface_cards, we're done. Preserve the original answer if already set.
          if (surfaceCardsCalled) {
            if (!finalText) finalText = content;
            break;
          }
        }

        let resolvedText = finalText?.trim();
        if (!resolvedText) {
          if (writeToolCalled) {
            resolvedText = writeFallbackMessage || "Done — I updated that.";
          } else if (pendingDeletionItems.length > 0) {
            resolvedText = "I found matching items. Please confirm below.";
          } else if (pendingCardIds.size > 0) {
            resolvedText = "Here are the matching memories.";
          } else {
            resolvedText = "I processed that, but I couldn't generate a clear reply.";
          }
        }

        // Precision-Grounded Auto-Surfacing (Final ID Extraction)
        if (!surfaceCardsCalled && (initialGrounding.shouldGround || surfaceCandidates.length > 0)) {
          const usedIdsMatch = resolvedText.match(/<!--MEMORA_USED_IDS:\[(.*?)\]-->/);
          if (usedIdsMatch?.[1]) {
            try {
              const idsText = usedIdsMatch[1];
              const cleanedIds = idsText.replace(/["'\[\]\s]/g, "").split(",").filter(Boolean);
              for (const id of cleanedIds) {
                pendingCardIds.add(id);
              }
              // Strip the comment from the displayed text
              resolvedText = resolvedText.replace(/<!--MEMORA_USED_IDS:\[.*?\]-->/, "").trim();
            } catch {
              // Fail-safe: don't crash
            }
          }
        }

        await setStreamingStatus({
          phase: "finalizing",
          toolName: "reply",
          detail: "Preparing final answer",
          source: "assistant",
          resultCount: pendingCardIds.size,
          events: [
            { label: "Cards", value: `${pendingCardIds.size}` },
          ],
          step: 4,
          totalSteps: 4,
        });

        let appendedComments = "";
        if (pendingDeletionItems.length > 0) {
          appendedComments += `\n<!--MEMORA_DELETION_PROPOSAL:${JSON.stringify(pendingDeletionItems)}-->`;
        }
        if (pendingCardIds.size > 0) {
          appendedComments += `\n<!--MEMORA_CARD_IDS:${JSON.stringify({ 
            ids: Array.from(pendingCardIds), 
            isCached: pendingSearchIsCached,
            turns: finalIteration + 1 
          })}-->`;
        }

        aiResponse = resolvedText + appendedComments;
        await ctx.runMutation(internal.chat.clearSearchStatus, {
          userId: session._id,
        });
      } catch {
        await ctx.runMutation(internal.chat.clearSearchStatus, {
          userId: session._id,
        });
        aiResponse =
          "I'm having trouble connecting right now. Please try again in a moment.";
      }
    }

    await ctx.runMutation(internal.chat.send, {
      userId: session._id,
      content: aiResponse,
      role: "assistant",
    });

    const deletionIdx = aiResponse.indexOf("\n<!--MEMORA_DELETION_PROPOSAL:");
    const cardIdsIdx = aiResponse.indexOf("\n<!--MEMORA_CARD_IDS:");
    const minIdxStr = Math.min(
      deletionIdx !== -1 ? deletionIdx : Infinity,
      cardIdsIdx !== -1 ? cardIdsIdx : Infinity
    );
    return { reply: (minIdxStr !== Infinity ? aiResponse.slice(0, minIdxStr) : aiResponse).trim() };
  },
});
