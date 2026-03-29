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

type AIExtractedMemory = {
  title?: string;
  content?: string;
  category?: "personal" | "work" | "finance" | "health" | "other";
  mood?:
    | "happy"
    | "sad"
    | "anxious"
    | "excited"
    | "neutral"
    | "grateful"
    | "frustrated"
    | "hopeful"
    | "nostalgic"
    | "motivated";
  tags?: string[];
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
  reminderDate?: string;
  sentimentScore?: number;
  extractedActions?: Array<{
    action: string;
    completed: boolean;
    actionType?: "task" | "reminder" | "fact" | "decision";
  }>;
};

function fallbackStructuredData(content: string): AIExtractedMemory {
  const firstSentence = content.split(/[.\n]/)[0]?.trim() || "New Memory";
  const lower = content.toLowerCase();
  const category = lower.includes("meeting") || lower.includes("project")
    ? "work"
    : lower.includes("doctor") || lower.includes("workout")
      ? "health"
      : lower.includes("money") || lower.includes("invoice")
        ? "finance"
        : "personal";

  return {
    title: firstSentence.slice(0, 70),
    content,
    category,
    tags: [],
    people: [],
    locations: [],
    importance: "normal",
    linkedUrls: [],
    extractedActions: [],
  };
}

export const processMemory = action({
  args: {
    memoryId: v.id("memories"),
    title: v.string(),
    content: v.string(),
    userTimezone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const client = getOpenAIClient();
    if (!client) {
      return;
    }

    const embedding = await embedText(`${args.title}\n${args.content}`);

    await ctx.runMutation(internal.processMemoryMutations.updateEmbedding, {
      memoryId: args.memoryId,
      embedding,
    });

    try {
      const userTz = args.userTimezone ?? "UTC";

      // Use tool calling with forced tool_choice to match Supabase pattern
      const response = await client.chat.completions.create({
        model: OPENAI_CHAT_MODEL,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content: `You are an AI assistant that processes memory notes. Extract ALL structured data from the user's input. Today's date: ${new Date().toISOString()}. The user's timezone is ${userTz}.

CRITICAL WORDING RULE: Write title and content in objective, note-style language. Never use "I", "me", "my", "the user", or "you". Describe events as facts (e.g. "Exam on Friday at 3pm" not "I have an exam on Friday at 3pm". "Meeting with Sarah at 2pm" not "I need to meet Sarah at 2pm").

CRITICAL TIMEZONE RULE: When the user mentions times like "9:30 AM", "3pm tomorrow", or "next Monday at 10am", that time is in THEIR timezone (${userTz}). Convert it to UTC for the reminder_date field. Example: If user is in Asia/Kolkata (UTC+5:30) and says "9:30 AM", UTC time is 4:00 AM, output "2026-03-09T04:00:00Z".

For category: "personal" (daily life, education, exams, relationships, hobbies, social events), "work" (job tasks, meetings, professional projects), "finance" (money, payments, invoices, banking), "health" (medical, fitness, mental health), "other". Default to "personal" when in doubt — only use "work" for professional/job content.
For mood: happy, sad, anxious, excited, neutral, grateful, frustrated, hopeful, nostalgic, motivated.
For people: extract ALL people names mentioned.
For locations: extract ALL locations, places, venues, cities, countries mentioned.
For importance: "critical", "high", "normal", or "low" based on urgency/consequence/emotional weight.
For life_area: career, family, health, finance, social, hobbies, education, travel, self-care, relationships.
For context_tags: extract structured context (who, what, where, why).
For sentiment_score: rate from -1.0 (very negative) to 1.0 (very positive).
For linked_urls: extract any URLs mentioned.
For extracted_actions: identify actionable items with "text" (description) and "type" (task/reminder/fact/decision).
For tags: return 3-7 relevant lowercase tags.`,
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
                  reminder_date: { type: "string", description: "ISO 8601 UTC datetime or null" },
                  is_recurring: { type: "boolean" },
                  recurrence_type: {
                    type: "string",
                    enum: ["yearly", "monthly", "weekly", "daily"],
                  },
                  category: {
                    type: "string",
                    enum: ["personal", "work", "finance", "health", "other"],
                  },
                  mood: {
                    type: "string",
                    enum: ["happy", "sad", "anxious", "excited", "neutral", "grateful", "frustrated", "hopeful", "nostalgic", "motivated"],
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
                  tags: { type: "array", items: { type: "string" } },
                },
                required: ["title", "content", "category"],
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
      await ctx.runMutation(internal.processMemoryMutations.updateAIFields, {
        memoryId: args.memoryId,
        title: normalized.title,
        category: normalized.category,
        mood: normalized.mood,
        tags: normalized.tags,
        people: normalized.people,
        locations: normalized.locations,
        importance: normalized.importance,
        lifeArea: normalized.lifeArea,
        contextTags: normalized.contextTags,
        linkedUrls: normalized.linkedUrls,
        reminderDate: normalized.reminderDate,
        sentimentScore: normalized.sentimentScore,
        extractedActions: normalized.extractedActions,
        embedding,
      });
    } catch {
      // Embedding is the critical update; enrichment is best-effort.
    }
  },
});

export const captureMemory = action({
  args: {
    token: v.string(),
    content: v.string(),
    category: v.optional(
      v.union(
        v.literal("personal"),
        v.literal("work"),
        v.literal("finance"),
        v.literal("health"),
        v.literal("other")
      )
    ),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    memoryId: Id<"memories">;
    structured: AIExtractedMemory;
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
      const userTz = session.timezone ?? "UTC";
      const [analysisRaw, embeddingResult] = await Promise.allSettled([
        (async () => {
          const response = await client.chat.completions.create({
            model: OPENAI_CHAT_MODEL,
            temperature: 0.3,
            messages: [
              {
                role: "system",
                content: `You are an AI assistant that processes memory notes. Extract ALL structured data from the user's input. Today's date: ${new Date().toISOString()}. The user's timezone is ${userTz}.

CRITICAL TIMEZONE RULE: When the user mentions times like "9:30 AM", "3pm tomorrow", or "next Monday at 10am", that time is in THEIR timezone (${userTz}). You MUST convert it to UTC for reminder_date.

For category: "personal" (daily life, education, exams, relationships, hobbies, social events), "work" (job tasks, meetings, professional projects), "finance" (money, payments, invoices, banking), "health" (medical, fitness, mental health), "other". Default to "personal" when in doubt — only use "work" for professional/job content.
For mood: happy, sad, anxious, excited, neutral, grateful, frustrated, hopeful, nostalgic, motivated.
For people: extract all people names.
For locations: extract all locations and places.
For importance: critical, high, normal, or low.
For life_area: career, family, health, finance, social, hobbies, education, travel, self-care, relationships.
For context_tags: extract who, what, where, why.
For sentiment_score: rate from -1.0 to 1.0.
For linked_urls: extract any URLs mentioned.
For extracted_actions: identify actionable items. Each action should have text and type (task, reminder, fact, decision).
For tags: return 3-7 relevant lowercase tags.`,
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
                      category: { type: "string", enum: ["personal", "work", "finance", "health", "other"] },
                      mood: { type: "string", enum: ["happy", "sad", "anxious", "excited", "neutral", "grateful", "frustrated", "hopeful", "nostalgic", "motivated"] },
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
                      tags: { type: "array", items: { type: "string" } },
                      reminder_date: { type: "string" },
                    },
                    required: ["title", "content", "category"],
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
    }

    const memoryId: Id<"memories"> = await ctx.runMutation(api.memories.create, {
      token: args.token,
      title: structured.title || fallbackStructuredData(args.content).title || "New Memory",
      content: args.content,
      category: structured.category || args.category || "other",
      mood: structured.mood,
      tags: structured.tags || [],
      people: structured.people || [],
      locations: structured.locations || [],
      importance: structured.importance || "normal",
      lifeArea: structured.lifeArea,
      contextTags: structured.contextTags,
      sentimentScore: structured.sentimentScore,
      linkedUrls: structured.linkedUrls || [],
      extractedActions: structured.extractedActions || [],
      reminderDate: structured.reminderDate,
      isRecurring: false,
    });

    if (embedding || structured.sentimentScore !== undefined || structured.extractedActions) {
      await ctx.runMutation(internal.processMemoryMutations.updateAIFields, {
        memoryId,
        title: structured.title,
        category: structured.category,
        mood: structured.mood,
        tags: structured.tags,
        people: structured.people,
        locations: structured.locations,
        importance: structured.importance,
        lifeArea: structured.lifeArea,
        contextTags: structured.contextTags,
        linkedUrls: structured.linkedUrls,
        reminderDate: structured.reminderDate,
        sentimentScore: structured.sentimentScore,
        extractedActions: structured.extractedActions,
        embedding,
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
      conflicts: conflictResult.conflicts,
    };
  },
});
