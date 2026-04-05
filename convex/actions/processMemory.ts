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
};

function buildExtractionSystemPrompt(userTz: string, currentTime: string): string {
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

  return `You are an AI assistant that processes memory notes. Extract ALL structured data from the user's input.

CURRENT DATE & TIME: ${localDateStr} at ${localTimeStr} (${userTz}) — UTC: ${now.toISOString()}
Use this to resolve relative expressions like "in 5 hours", "next Monday", "after lunch", "tomorrow morning" into exact absolute datetimes.
This timestamp came from the user's device at capture-time. Treat it as the authoritative "now" for relative scheduling.

CRITICAL WORDING RULE — NO RELATIVE TIME IN STORED MEMORIES: Write title and content in objective, note-style language. Never use relative time words ("today", "tomorrow", "yesterday", "next week", "this morning", "this afternoon", "in 5 hours", "soon", "later") in the title or content. Always write the actual resolved date: e.g. "Meeting with Sarah on 9 Apr 2026 at 14:00 IST" not "Meeting with Sarah tomorrow afternoon". Never use "I", "me", "my", "the user", or "you".

CRITICAL TYPE RULE:
- Every saved item must be classified as either "memory" or "reminder".
- Default to "memory".
- Use "reminder" when EITHER of these is true:
  1. The user explicitly asks to be reminded ("remind me", "don't forget", "set a reminder").
  2. The content describes a future scheduled event (meeting, appointment, deadline, call, flight, exam, task due date, etc.) with a resolvable date/time — even if phrased as a statement ("I have a meeting Monday at 9am", "dentist appointment Friday 3pm", "project due next Thursday").
- Use "memory" for past events, general facts, reflections, or future events with NO specific date/time.
- If the entry is a reminder, always populate the schedule field with the resolved UTC datetime.

CRITICAL TIMEZONE RULE: When the user mentions times, that time is in THEIR timezone (${userTz}). Convert to UTC ISO-8601 for schedule.due_at. Example: if user is in Asia/Kolkata (UTC+5:30) and says "9:30 AM", UTC time is 04:00 AM — output "2026-03-09T04:00:00Z".

For people: extract ALL people names mentioned.
For locations: extract ALL locations, places, venues, cities, countries mentioned.
For importance: "critical", "high", "normal", or "low" based on urgency/consequence/emotional weight.
For life_area: career, family, health, finance, social, hobbies, education, travel, self-care, relationships.
For context_tags: extract structured context (who, what, where, why).
For sentiment_score: rate from -1.0 (very negative) to 1.0 (very positive).
For linked_urls: extract any URLs mentioned.
For extracted_actions: identify actionable items with "text" (description) and "type" (task/reminder/fact/decision).`;
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

    const embedding = await embedText(
      buildEmbeddingText({ title: args.title, content: args.content })
    );

    await ctx.runMutation(internal.processMemoryMutations.updateEmbedding, {
      memoryId: args.memoryId,
      embedding,
    });

    try {
      const userTz =
        args.currentTimezone?.trim() || args.userTimezone || "UTC";
      const currentTime = args.currentTime ?? new Date().toISOString();

      // Use tool calling with forced tool_choice to match Supabase pattern
      const response = await client.chat.completions.create({
        model: OPENAI_CHAT_MODEL,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content: buildExtractionSystemPrompt(userTz, currentTime),
          },
          {
            role: "user",
            content: `Memory title: ${args.title}\nMemory content: ${args.content}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "create_memory",
              description: "Extract structured metadata from the memory note",
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
      const extracted = safeJsonParse<Record<string, unknown>>(
        toolCall?.type === "function"
          ? toolCall.function.arguments
          : extractTextContent(response.choices[0]?.message?.content)
      );

      if (!extracted) {
        return;
      }

      const normalized = normalizeMemoryFields(extracted);

      // Fetch current memory before updating so we can protect existing scheduling.
      const memory = await ctx.runQuery(internal.memories.getInternal, { memoryId: args.memoryId });

      // Don't let background enrichment downgrade an already-set reminder to a
      // memory: only touch scheduling if the AI found a new due_at OR the memory
      // is not already a confirmed reminder.
      const existingIsReminder = memory?.entryKind === "reminder" && !!memory?.schedule?.dueAt;
      const extractionHasSchedule = !!normalized.schedule?.dueAt;
      const shouldUpdateScheduling =
        hasExplicitSchedulingFields(extracted) &&
        (extractionHasSchedule || !existingIsReminder);

      // Re-embed with enriched metadata from AI extraction
      const enrichedEmbedding = await embedText(
        buildEmbeddingText({
          title: normalized.title ?? args.title,
          content: args.content,
          people: normalized.people,
          locations: normalized.locations,
          lifeArea: normalized.lifeArea,
          entryKind: normalized.entryKind,
        })
      );

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
        embedding: enrichedEmbedding,
      });
      if (memory) {
        await ctx.scheduler.runAfter(0, internal.actions.manageTopics.assignTopicsToMemory, {
          memoryId: args.memoryId,
          userId: memory.userId,
          title: normalized.title ?? args.title,
          content: args.content,
          embedding: enrichedEmbedding,
        });
      }
    } catch {
      // Embedding is the critical update; enrichment is best-effort.
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

    let structured = fallbackStructuredData(args.content);
    let embedding: number[] | undefined;

    const client = getOpenAIClient();
    if (client) {
      const userTz =
        args.currentTimezone?.trim() || session.timezone || "UTC";
      const currentTime = args.currentTime ?? new Date().toISOString();
      const [analysisRaw, embeddingResult] = await Promise.allSettled([
        (async () => {
          const response = await client.chat.completions.create({
            model: OPENAI_CHAT_MODEL,
            temperature: 0.3,
            messages: [
              {
                role: "system",
                content: buildExtractionSystemPrompt(userTz, currentTime),
              },
              { role: "user", content: args.content },
            ],
            tools: [
              {
                type: "function",
                function: {
                  name: "create_memory",
                  description: "Extract structured metadata from the memory note",
                  parameters: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      content: { type: "string" },
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
                      importance: { type: "string", enum: ["critical", "high", "normal", "low"] },
                      life_area: { type: "string", enum: ["career", "family", "health", "finance", "social", "hobbies", "education", "travel", "self-care", "relationships"] },
                      context_tags: {
                        type: "object",
                        properties: {
                          who: { type: "array", items: { type: "string" } },
                          what: { type: "string" },
                          where: { type: "string" },
                          why: { type: "string" },
                        },
                      },
                      sentiment_score: { type: "number" },
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
        })(),
        embedText(args.content.slice(0, 6000)),
      ]);

      if (analysisRaw.status === "fulfilled" && analysisRaw.value) {
        structured = {
          ...structured,
          ...normalizeMemoryFields(analysisRaw.value),
        };
      }

      if (embeddingResult.status === "fulfilled") {
        embedding = embeddingResult.value;
      }

      // Re-embed with enriched metadata if we got good AI extraction
      if (embedding && structured.people?.length || structured.locations?.length || structured.lifeArea) {
        try {
          embedding = await embedText(
            buildEmbeddingText({
              title: structured.title,
              content: args.content,
              people: structured.people,
              locations: structured.locations,
              lifeArea: structured.lifeArea,
              entryKind: structured.entryKind,
            })
          );
        } catch {
          // Keep the original embedding if re-embedding fails
        }
      }
    }

    const memoryId: Id<"memories"> = await ctx.runMutation(api.memories.create, {
      token: args.token,
      title: structured.title || fallbackStructuredData(args.content).title || "New Memory",
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
          title: structured.title || fallbackStructuredData(args.content).title || "New Memory",
          content: args.content,
          embedding,
        });
      }
    } else {
      await ctx.scheduler.runAfter(0, api.actions.processMemory.processMemory, {
        memoryId,
        title: structured.title || fallbackStructuredData(args.content).title || "New Memory",
        content: args.content,
        userTimezone: session.timezone,
        currentTime: args.currentTime ?? new Date().toISOString(),
        currentTimezone: args.currentTimezone,
      });
    }

    const conflictResult = await ctx.runAction(
      api.actions.detectConflicts.detectConflicts,
      {
        token: args.token,
        memoryId,
        content: args.content,
      }
    );

    return {
      memoryId,
      structured,
      embedding,
      conflicts: conflictResult.conflicts,
    };
  },
});
