"use node";

import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { action } from "../_generated/server";
import { api, internal } from "../_generated/api";
import {
  embedText,
  extractTextContent,
  getOpenAIClient,
  OPENAI_CHAT_MODEL,
  safeJsonParse,
} from "../lib/openai";
import { normalizeMemoryFields } from "../lib/aiNormalization";
import { toStoredMemoryFields } from "../lib/memoryKind";

type Conflict = {
  existingMemoryId: string;
  existingMemoryTitle?: string;
  conflictType?: "factual" | "decision" | "schedule" | "preference";
  description: string;
  suggestion?: "keep_new" | "keep_old" | "merge" | "review";
};

type AIExtractedMemory = {
  title?: string;
  content?: string;
  people?: string[];
  locations?: string[];
  importance?: "critical" | "high" | "normal" | "low";
  lifeArea?:
    | "career"
    | "family"
    | "health"
    | "finance"
    | "social"
    | "hobbies"
    | "education"
    | "travel"
    | "self-care"
    | "relationships";
  contextTags?: {
    who?: string[];
    what?: string;
    where?: string;
    why?: string;
  };
  linkedUrls?: string[];
  entryKind?: "memory" | "reminder";
  schedule?: {
    dueAt: string;
    isRecurring: boolean;
    recurrenceType?: "yearly" | "monthly" | "weekly" | "daily";
  };
  reminderDate?: string;
  sentimentScore?: number;
  extractedActions?: Array<{
    action: string;
    completed: boolean;
    actionType?: "task" | "reminder" | "fact" | "decision";
  }>;
  conflicts?: Conflict[];
};

function buildExtractionSystemPrompt(userTz: string, currentTime: string, existingContext?: string): string {
  const now = new Date(currentTime);
  const localDateStr = now.toLocaleDateString("en-US", {
    timeZone: userTz,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const localTimeStr = now.toLocaleTimeString("en-US", {
    timeZone: userTz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  return `You are an AI assistant that processes memory notes. Extract ALL structured data from the user's input and simultaneously check for conflicts with existing memories.

CURRENT DATE & TIME: ${localDateStr} at ${localTimeStr} (${userTz}) — UTC: ${now.toISOString()}
Use this to resolve relative expressions like "in 5 hours", "next Monday", "after lunch", "tomorrow morning" into exact absolute datetimes.

CRITICAL WORDING RULE — NO RELATIVE TIME IN STORED MEMORIES: Write title and content in objective, note-style language. Never use relative time words ("today", "tomorrow", "yesterday", "next week", "this morning", "this afternoon", "in 5 hours", "soon", "later") in the title or content. Always write the actual resolved date. Never use "I", "me", "my", "the user", or "you".

CRITICAL TYPE RULE:
- Every saved item must be classified as either "memory" or "reminder".
- Default to "memory".
- Use "reminder" when there's an explicit request or a resolvable future scheduled event.

CONFLICT DETECTION:
If existing memories are provided below, compare the NEW memory against them.
Look for:
- Factual contradictions (e.g., different passwords, addresses, phone numbers for the same thing).
- Updated decisions that override old ones.
- Schedule conflicts (overlapping times/dates).
- Changed preferences or opinions on the same topic.
Only report REAL conflicts where information genuinely contradicts. Do NOT flag memories that are simply related or similar.

${existingContext ? `EXISTING MEMORIES FOR CONFLICT CHECKING:\n${existingContext}` : "No existing memories provided for conflict checking."}

EXTRACT DATA:
Extract people, locations, importance, life_area, context_tags, sentiment_score, and actions.`;
}

function fallbackStructuredData(content: string): AIExtractedMemory {
  const firstSentence = content.split(/[.\n]/)[0]?.trim() || "New Memory";
  return {
    title: firstSentence.slice(0, 70),
    content,
    people: [],
    locations: [],
    importance: "normal",
    linkedUrls: [],
    extractedActions: [],
  };
}

function hasExplicitSchedulingFields(value: Record<string, unknown>) {
  return (
    value.entryKind !== undefined ||
    value.entry_kind !== undefined ||
    value.schedule !== undefined
  );
}

function isSameValue(left: unknown, right: unknown) {
  if (left === right) {
    return true;
  }
  if (left === undefined || right === undefined) {
    return left === right;
  }
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Build a structured, metadata-enriched text for embedding generation.
 * Including structured metadata (people, locations, life area, etc.)
 * makes the embedding more semantically discoverable.
 *
 * Example output:
 * ```
 * Title: Sister's Name
 * Content: Sister's name is Ananya.
 * People: Ananya
 * Category: family
 * ```
 */
function buildEmbeddingText(args: {
  title?: string;
  content?: string;
  people?: string[];
  locations?: string[];
  lifeArea?: string;
  entryKind?: string;
}): string {
  const parts: string[] = [];
  if (args.title) parts.push(`Title: ${args.title}`);
  if (args.content) parts.push(`Content: ${args.content}`);
  if (args.people && args.people.length > 0) {
    parts.push(`People: ${args.people.join(", ")}`);
  }
  if (args.locations && args.locations.length > 0) {
    parts.push(`Locations: ${args.locations.join(", ")}`);
  }
  if (args.lifeArea) parts.push(`Category: ${args.lifeArea}`);
  if (args.entryKind === "reminder") parts.push(`Type: reminder`);
  // Fall back to simple concatenation if no structured parts
  return parts.length > 0 ? parts.join("\n") : `${args.title ?? ""}\n${args.content ?? ""}`;
}

export { buildEmbeddingText };

async function extractStructuredMemory(args: {
  client: NonNullable<ReturnType<typeof getOpenAIClient>>;
  input: string;
  userTz: string;
  currentTime: string;
  existingMemories?: string;
}) {
  const response = await args.client.chat.completions.create({
    model: OPENAI_CHAT_MODEL,
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content: buildExtractionSystemPrompt(args.userTz, args.currentTime, args.existingMemories),
      },
      { role: "user", content: args.input },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "create_memory",
          description: "Extract structured metadata and detect conflicts",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string", description: "Concise title, max 8 words" },
              content: { type: "string", description: "Full memory content" },
              entry_kind: {
                type: "string",
                enum: ["memory", "reminder"],
              },
              schedule: {
                type: "object",
                properties: {
                  due_at: {
                    type: "string",
                    description:
                      "Exact ISO 8601 UTC datetime. Only for explicit reminders with a real schedule.",
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
              importance: {
                type: "string",
                enum: ["critical", "high", "normal", "low"],
              },
              life_area: {
                type: "string",
                enum: ["career", "family", "health", "finance", "social", "hobbies", "education", "travel", "self-care", "relationships"],
              },
              context_tags: {
                type: "object",
                properties: {
                  who: { type: "array", items: { type: "string" } },
                  what: { type: "string" },
                  where: { type: "string" },
                  why: { type: "string" },
                },
              },
              sentiment_score: { type: "number", description: "-1.0 to 1.0" },
              linked_urls: { type: "array", items: { type: "string" } },
              extracted_actions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    text: { type: "string" },
                    type: { type: "string", enum: ["task", "reminder", "fact", "decision"] },
                  },
                  required: ["text", "type"],
                },
              },
              conflicts: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    existingMemoryId: { type: "string" },
                    existingMemoryTitle: { type: "string" },
                    conflictType: { type: "string", enum: ["factual", "decision", "schedule", "preference"] },
                    description: { type: "string" },
                    suggestion: { type: "string", enum: ["keep_new", "keep_old", "merge", "review"] },
                  },
                  required: ["existingMemoryId", "conflictType", "description", "suggestion"],
                },
              },
            },
            required: ["title", "content"],
            additionalProperties: false,
          },
        },
      },
    ],
    tool_choice: { type: "function", function: { name: "create_memory" } },
  });

  const toolCall = response.choices[0]?.message?.tool_calls?.[0];
  return safeJsonParse<Record<string, unknown>>(
    toolCall?.type === "function"
      ? toolCall.function.arguments
      : extractTextContent(response.choices[0]?.message?.content)
  );
}

async function buildMemoryEmbedding(args: {
  title?: string;
  content: string;
  people?: string[];
  locations?: string[];
  lifeArea?: string;
  entryKind?: string;
}) {
  return await embedText(
    buildEmbeddingText({
      title: args.title,
      content: args.content,
      people: args.people,
      locations: args.locations,
      lifeArea: args.lifeArea,
      entryKind: args.entryKind,
    })
  );
}

export const processMemory = action({
  args: {
    memoryId: v.id("memories"),
    title: v.string(),
    content: v.string(),
    userTimezone: v.optional(v.string()),
    currentTime: v.optional(v.string()),
    currentTimezone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const client = getOpenAIClient();
    if (!client) {
      return;
    }

    const memory = await ctx.runQuery(internal.memories.getInternal, {
      memoryId: args.memoryId,
    });
    if (!memory) {
      return;
    }

    const userTz = args.currentTimezone?.trim() || args.userTimezone || "UTC";
    const currentTime = args.currentTime ?? new Date().toISOString();

    // Find conflict candidates BEFORE the LLM call to provide context
    let existingMemoriesContext = "";
    try {
      let candidates: Array<{ _id: Id<"memories">; title?: string; content?: string }> = [];
      const queryEmbedding = await embedText(args.content.slice(0, 4000));
      const semanticallySimilar = await ctx.vectorSearch("memories", "by_embedding", {
        vector: queryEmbedding,
        limit: 8,
        filter: (q) => q.eq("userId", memory.userId),
      });
      
      const similarIds = semanticallySimilar
        .filter((result) => result._id !== args.memoryId && result._score > 0.65)
        .map((result) => result._id);

      if (similarIds.length > 0) {
        candidates = await ctx.runQuery(internal.memories.listByIdsInternal, {
          userId: memory.userId,
          ids: similarIds.slice(0, 8),
        });
      } else {
        candidates = await ctx.runQuery(internal.memories.searchByKeyword, {
          userId: memory.userId,
          query: args.content,
          limit: 8,
        });
      }

      existingMemoriesContext = candidates
        .filter(m => m._id !== args.memoryId)
        .map(m => `[${m._id}] ${m.title ?? "Untitled"}: ${(m.content ?? "").slice(0, 200)}`)
        .join("\n");
    } catch (e) {
      console.error("Error finding conflict candidates in background:", e);
    }

    let extracted: Record<string, unknown> | null = null;
    try {
      extracted = await extractStructuredMemory({
        client,
        input: `Memory title: ${args.title}\nMemory content: ${args.content}`,
        userTz,
        currentTime,
        existingMemories: existingMemoriesContext || undefined,
      });
    } catch {
      extracted = null;
    }

    try {
      const normalized: ReturnType<typeof normalizeMemoryFields> = extracted
        ? normalizeMemoryFields(extracted)
        : normalizeMemoryFields({});
      const existingIsReminder =
        memory.entryKind === "reminder" && !!memory.schedule?.dueAt;
      const extractionHasSchedule = !!normalized.schedule?.dueAt;
      const shouldUpdateScheduling =
        !!extracted &&
        hasExplicitSchedulingFields(extracted) &&
        (extractionHasSchedule || !existingIsReminder);
      const embedding = await buildMemoryEmbedding({
        title: normalized.title ?? args.title,
        content: args.content,
        people: normalized.people,
        locations: normalized.locations,
        lifeArea: normalized.lifeArea,
        entryKind: normalized.entryKind,
      });

      await ctx.runMutation(internal.processMemoryMutations.updateAIFields, {
        memoryId: args.memoryId,
        title: normalized.title,
        people: normalized.people,
        locations: normalized.locations,
        importance: normalized.importance,
        lifeArea: normalized.lifeArea,
        contextTags: normalized.contextTags,
        linkedUrls: normalized.linkedUrls,
        ...(shouldUpdateScheduling ? toStoredMemoryFields(normalized) : {}),
        sentimentScore: normalized.sentimentScore,
        extractedActions: normalized.extractedActions,
        embedding,
      });

      const shouldReassignTopics =
        !isSameValue(memory.embedding, embedding) ||
        !isSameValue(memory.title, normalized.title ?? memory.title) ||
        !isSameValue(memory.people, normalized.people ?? memory.people) ||
        !isSameValue(memory.locations, normalized.locations ?? memory.locations) ||
        !isSameValue(memory.lifeArea, normalized.lifeArea ?? memory.lifeArea) ||
        !isSameValue(memory.entryKind, normalized.entryKind ?? memory.entryKind);

      if (shouldReassignTopics) {
        await ctx.scheduler.runAfter(0, internal.actions.manageTopics.assignTopicsToMemory, {
          memoryId: args.memoryId,
          userId: memory.userId,
          title: normalized.title ?? args.title,
          content: args.content,
          embedding,
        });
      }
    } catch {
      // Best effort only. Background enrichment should never break user writes.
    }
  },
});

export const captureMemory = action({
  args: {
    token: v.string(),
    content: v.string(),
    currentTime: v.optional(v.string()),
    currentTimezone: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{
    memoryId: Id<"memories">;
    structured: AIExtractedMemory;
    embedding?: number[];
    conflicts: Array<{ existingMemoryId: string; description: string }>;
  }> => {
    const session = await ctx.runQuery(api.auth.me, { token: args.token });
    if (!session) {
      throw new Error("Unauthorized");
    }

    const fallback = fallbackStructuredData(args.content);
    let structured = fallback;
    let embedding: number[] | undefined;

    const client = getOpenAIClient();
    if (client) {
      const userTz =
        args.currentTimezone?.trim() || session.timezone || "UTC";
      const currentTime = args.currentTime ?? new Date().toISOString();

      // Find conflict candidates BEFORE the LLM call to provide context
      let existingMemoriesContext = "";
      try {
        let candidates: Array<{ _id: Id<"memories">; title?: string; content?: string }> = [];
        const queryEmbedding = await embedText(args.content.slice(0, 4000));
        const semanticallySimilar = await ctx.vectorSearch("memories", "by_embedding", {
          vector: queryEmbedding,
          limit: 8,
          filter: (q) => q.eq("userId", session._id),
        });
        
        const similarIds = semanticallySimilar
          .filter((result) => result._score > 0.65)
          .map((result) => result._id);

        if (similarIds.length > 0) {
          candidates = await ctx.runQuery(internal.memories.listByIdsInternal, {
            userId: session._id,
            ids: similarIds.slice(0, 8),
          });
        } else {
          candidates = await ctx.runQuery(internal.memories.searchByKeyword, {
            userId: session._id,
            query: args.content,
            limit: 8,
          });
        }

        existingMemoriesContext = candidates
          .map(m => `[${m._id}] ${m.title ?? "Untitled"}: ${(m.content ?? "").slice(0, 200)}`)
          .join("\n");
      } catch (e) {
        console.error("Error finding conflict candidates:", e);
      }

      try {
        const analysisRaw = await extractStructuredMemory({
          client,
          input: args.content,
          userTz,
          currentTime,
          existingMemories: existingMemoriesContext || undefined,
        });
        if (analysisRaw) {
          structured = {
            ...structured,
            ...normalizeMemoryFields(analysisRaw),
            conflicts: (analysisRaw.conflicts as Conflict[]) || [],
          };
        }
      } catch {
        // Fall back to the simple extracted structure below.
      }

      try {
        embedding = await buildMemoryEmbedding({
          title: structured.title,
          content: args.content,
          people: structured.people,
          locations: structured.locations,
          lifeArea: structured.lifeArea,
          entryKind: structured.entryKind,
        });
      } catch {
        embedding = undefined;
      }
    }

    const memoryId: Id<"memories"> = await ctx.runMutation(api.memories.create, {
      token: args.token,
      title: structured.title || fallback.title || "New Memory",
      content: args.content,
      people: structured.people || [],
      locations: structured.locations || [],
      importance: structured.importance || "normal",
      lifeArea: structured.lifeArea,
      contextTags: structured.contextTags,
      sentimentScore: structured.sentimentScore,
      linkedUrls: structured.linkedUrls || [],
      extractedActions: structured.extractedActions || [],
      entryKind: structured.entryKind,
      schedule: structured.schedule,
      skipAiProcessing: true,
    });

    if (
      embedding ||
      structured.sentimentScore !== undefined ||
      structured.extractedActions !== undefined
    ) {
      await ctx.runMutation(internal.processMemoryMutations.updateAIFields, {
        memoryId,
        title: structured.title,
        people: structured.people,
        locations: structured.locations,
        importance: structured.importance,
        lifeArea: structured.lifeArea,
        contextTags: structured.contextTags,
        linkedUrls: structured.linkedUrls,
        ...toStoredMemoryFields(structured),
        sentimentScore: structured.sentimentScore,
        extractedActions: structured.extractedActions,
        embedding,
      });

      if (embedding) {
        await ctx.scheduler.runAfter(0, internal.actions.manageTopics.assignTopicsToMemory, {
          memoryId,
          userId: session._id,
          title: structured.title || fallback.title || "New Memory",
          content: args.content,
          embedding,
        });
      }
    } else {
      await ctx.scheduler.runAfter(0, api.actions.processMemory.processMemory, {
        memoryId,
        title: structured.title || fallback.title || "New Memory",
        content: args.content,
        userTimezone: session.timezone,
        currentTime: args.currentTime ?? new Date().toISOString(),
        currentTimezone: args.currentTimezone,
      });
    }

    return {
      memoryId,
      structured,
      embedding,
      conflicts: structured.conflicts || [],
    };
  },
});
