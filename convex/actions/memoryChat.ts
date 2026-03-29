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
import { normalizeMemoryFields } from "../lib/aiNormalization";

type MemoryCategory = "personal" | "work" | "finance" | "health" | "other";
type MemoryDoc = Doc<"memories">;
type DocumentDoc = Doc<"documentExtractions">;

type ParsedAttachment = {
  name: string;
  fileType: string;
  url: string;
};

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_memories",
      description:
        "Search through the user's memories using semantic plus fuzzy search. Use whenever the user asks about stored facts or wants to recall information.",
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
          title: { type: "string", description: "Concise title, max 8 words, objective note-style (no 'I', 'me', 'my')" },
          content: { type: "string", description: "Full memory content in objective note-style language (no 'I', 'me', 'my')" },
          category: {
            type: "string",
            enum: ["personal", "work", "finance", "health", "other"],
          },
          reminder_date: { type: "string" },
          is_recurring: { type: "boolean" },
          recurrence_type: {
            type: "string",
            enum: ["yearly", "monthly", "weekly", "daily"],
          },
          tags: { type: "array", items: { type: "string" } },
          mood: { type: "string" },
          people: { type: "array", items: { type: "string" } },
          locations: { type: "array", items: { type: "string" } },
        },
        required: ["title", "content", "category"],
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
          title: { type: "string", description: "Concise title, max 8 words, objective note-style (no 'I', 'me', 'my')" },
          content: { type: "string", description: "Full memory content in objective note-style language (no 'I', 'me', 'my')" },
          category: {
            type: "string",
            enum: ["personal", "work", "finance", "health", "other"],
          },
          reminder_date: { type: "string" },
          is_recurring: { type: "boolean" },
          recurrence_type: {
            type: "string",
            enum: ["yearly", "monthly", "weekly", "daily"],
          },
          tags: { type: "array", items: { type: "string" } },
          mood: { type: "string" },
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
      name: "delete_memory",
      description:
        "Delete a memory permanently. Confirm unless the user is explicit.",
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
      name: "delete_multiple_memories",
      description:
        "Delete multiple memory notes at once. Use when the user asks to delete several or all matching memories.",
      parameters: {
        type: "object",
        properties: {
          memory_ids: { type: "array", items: { type: "string" } },
        },
        required: ["memory_ids"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_memories",
      description:
        "List memories with optional filters for browsing or counting.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number" },
          category: {
            type: "string",
            enum: ["personal", "work", "finance", "health", "other"],
          },
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
        "Get statistics about the user's memories including categories, moods, tags, reminders, recurring items, and recent activity.",
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
          category: {
            type: "string",
            enum: ["personal", "work", "finance", "health", "other"],
          },
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

function toMemorySummary(memory: MemoryDoc) {
  return {
    id: memory._id,
    title: memory.title,
    content: memory.content,
    category: memory.category,
    mood: memory.mood ?? null,
    tags: memory.tags,
    people: memory.people,
    locations: memory.locations,
    reminder_date: memory.reminderDate ?? null,
    is_recurring: memory.isRecurring,
    recurrence_type: memory.recurrenceType ?? null,
    created_at: new Date(memory._creationTime).toISOString(),
  };
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
  args: { token: string; query: string; userId: Id<"users"> }
) {
  const documents: DocumentDoc[] = await ctx.runQuery(api.documents.list, {
    token: args.token,
  });

  const keywordQuery = args.query.trim().toLowerCase();
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
    const queryEmbedding = await embedText(args.query);
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

    return merged.slice(0, 10).map(toDocumentSummary);
  } catch {
    return keywordMatches.slice(0, 10).map(toDocumentSummary);
  }
}

async function searchMemories(
  ctx: ActionCtx,
  args: { token: string; query: string; userId: Id<"users"> }
) {
  const semanticResults = await ctx.runAction(api.actions.semanticSearch.search, {
    token: args.token,
    query: args.query,
    limit: 12,
  });

  const recentMemories = await listMemoriesForAI(ctx, args.userId, 100);
  const queryTerms = args.query
    .toLowerCase()
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 1);

  const fuzzyResults = recentMemories.filter((memory: MemoryDoc) => {
    const haystack = [
      memory.title,
      memory.content,
      memory.category,
      memory.mood,
      ...memory.tags,
      ...memory.people,
      ...memory.locations,
    ]
      .filter(Boolean)
      .join("\n")
      .toLowerCase();
    return queryTerms.some((term) => haystack.includes(term));
  });

  const merged: MemoryDoc[] = [];
  const seen = new Set<Id<"memories">>();

  for (const memory of [...semanticResults, ...fuzzyResults]) {
    if (seen.has(memory._id)) {
      continue;
    }
    seen.add(memory._id);
    merged.push(memory);
  }

  return {
    results: merged.slice(0, 10).map(toMemorySummary),
    count: merged.length,
  };
}

function buildSystemPrompt(userTimezone: string) {
  const today = new Date().toISOString().split("T")[0];

  return `You are Memora, a warm and witty personal AI memory assistant — the user's second brain. You remember everything they tell you and surface it instantly when needed. You have personality: helpful, occasionally playful, always feel like a trusted friend who happens to have a perfect memory.

## Your Core Behaviors:

1. **DIRECT, HUMAN ANSWERS**: Answer naturally — like a knowledgeable friend, not a database. Skip "I found a memory that says..." — just answer.

2. **WARM CONFIRMATIONS**: When you save/update/delete something, confirm it with personality. For example: "Done! Exam reminder set for 1 PM today — good luck with it!" or "Saved! I'll remind you about that." Never give a bland, robotic confirmation.

3. **REMEMBER EVERYTHING**: When the user shares info casually, save it. They don't need to say "remember this" explicitly.

4. **FULL CONTROL**: You can do everything the user asks:
   - Search, create, edit, delete memories (single or bulk)
   - Analyze patterns and trends across their data
   - Provide statistics and insights
   - Search uploaded documents (warranties, receipts, etc.)
   - Set reminders and recurring tasks
   - Categorize and tag information

5. **BE PROACTIVE**:
   - If you notice conflicting information, flag it naturally
   - If a deadline or reminder is near, mention it
   - Suggest connections between memories when relevant

6. **SMART DELETION**: Search first, confirm before deleting unless the user is explicit.

7. **ANALYSIS**: When asked to analyze, use the analyze_memories tool, then share insights conversationally.

8. **UNDO & HISTORY**: Every edit and delete is versioned for 7 days. Use 'history' tool with action='list', action='undo', or action='restore'.

9. **FILE ATTACHMENTS**: When user shares files, file URLs appear as [Attached file: name (type) — URL: ...]. Create or update a memory and call attach_file_to_memory when relevant.

**CATEGORY GUIDANCE**: "personal" (daily life, education, exams, relationships, hobbies, social events — this is the default), "work" (job tasks, meetings, professional projects — only for clearly work-related content), "finance" (money, payments, invoices), "health" (medical, fitness, mental health). When in doubt, use "personal".

Today's date: ${today}. The user's timezone is ${userTimezone}.

**CRITICAL WORDING RULE**: When creating or updating memories, write title and content in objective, note-style language. Never use "I", "me", "my", "the user", or "you". Describe events as facts (e.g. "Exam on Friday at 3pm" not "I have an exam on Friday at 3pm". "Meeting with Sarah at 2pm" not "I need to meet Sarah at 2pm"). Your spoken REPLY to the user is still warm and personal — the wording rule only applies to the memory content/title stored via tools.

**CRITICAL TIMEZONE RULE**:
- When user says "9:30 AM", "3pm tomorrow", or "next Monday at 10am", that time is in THEIR timezone.
- Convert to UTC for storage in reminder_date (ISO 8601).
- When CONFIRMING, ALWAYS state time in their original timezone.
- Never expose UTC times to the user.

Use markdown only when it genuinely helps readability.`;
}

export const chat = action({
  args: {
    token: v.string(),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const client = getOpenAIClient();
    const session = await ctx.runQuery(api.auth.me, { token: args.token });
    if (!session) {
      throw new Error("Unauthorized");
    }

    await ctx.runMutation(internal.chat.send, {
      userId: session._id,
      content: args.message,
      role: "user",
    });

    const chatHistory = await ctx.runQuery(api.chat.list, {
      token: args.token,
    });
    const recentChat = chatHistory.slice(-12).map((message) => ({
      role: message.role as "user" | "assistant",
      content: message.content.slice(0, 4000),
    }));

    const attachments = parseAttachments(args.message);
    let aiResponse =
      "I'm having trouble connecting right now. Please try again in a moment.";

    if (client) {
      try {
        const conversation: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
          {
            role: "system",
            content: buildSystemPrompt(session.timezone ?? "UTC"),
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

        let finalText = "";

        for (let iteration = 0; iteration < 8; iteration += 1) {
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
            let result = JSON.stringify({ error: "Unknown tool" });

            if (fnName === "search_memories") {
              result = JSON.stringify(
                await searchMemories(ctx, {
                  token: args.token,
                  query: String(fnArgs.query || ""),
                  userId: session._id,
                })
              );
            } else if (fnName === "search_documents") {
              result = JSON.stringify(
                {
                  results: await searchDocuments(ctx, {
                    token: args.token,
                    query: String(fnArgs.query || ""),
                    userId: session._id,
                  }),
                }
              );
            } else if (fnName === "create_memory") {
              const normalized = normalizeMemoryFields(fnArgs);
              const contentToSave =
                normalized.content ||
                (typeof fnArgs.content === "string" ? fnArgs.content.trim() : "") ||
                (typeof fnArgs.title === "string" ? fnArgs.title.trim() : "");

              const created = await ctx.runAction(
                api.actions.processMemory.captureMemory,
                {
                  token: args.token,
                  content: contentToSave,
                  category:
                    normalized.category ||
                    (typeof fnArgs.category === "string"
                      ? (fnArgs.category as MemoryCategory)
                      : "other"),
                }
              );

              await ctx.runMutation(api.memories.update, {
                token: args.token,
                id: created.memoryId,
                ...(normalized.title ? { title: normalized.title } : {}),
                ...(normalized.mood ? { mood: normalized.mood } : {}),
                ...(normalized.tags ? { tags: normalized.tags } : {}),
                ...(normalized.people ? { people: normalized.people } : {}),
                ...(normalized.locations ? { locations: normalized.locations } : {}),
                ...(normalized.contextTags
                  ? { contextTags: normalized.contextTags }
                  : {}),
                ...(normalized.reminderDate
                  ? { reminderDate: normalized.reminderDate }
                  : {}),
                ...(typeof fnArgs.is_recurring === "boolean"
                  ? { isRecurring: fnArgs.is_recurring }
                  : {}),
                ...(typeof fnArgs.recurrence_type === "string"
                  ? {
                      recurrenceType: fnArgs.recurrence_type as
                        | "yearly"
                        | "monthly"
                        | "weekly"
                        | "daily",
                    }
                  : {}),
              });

              result = JSON.stringify({
                success: true,
                memory: {
                  id: created.memoryId,
                  title: normalized.title || created.structured.title || "New Memory",
                  category:
                    normalized.category || created.structured.category || "other",
                },
              });
            } else if (fnName === "update_memory") {
              try {
                const normalized = normalizeMemoryFields(fnArgs);
                await ctx.runMutation(api.memories.update, {
                  token: args.token,
                  id: fnArgs.memory_id as Id<"memories">,
                  ...(normalized.title ? { title: normalized.title } : {}),
                  ...(normalized.content ? { content: normalized.content } : {}),
                  ...(normalized.category ? { category: normalized.category } : {}),
                  ...(normalized.mood ? { mood: normalized.mood } : {}),
                  ...(normalized.tags ? { tags: normalized.tags } : {}),
                  ...(normalized.people ? { people: normalized.people } : {}),
                  ...(normalized.locations ? { locations: normalized.locations } : {}),
                  ...(normalized.contextTags
                    ? { contextTags: normalized.contextTags }
                    : {}),
                  ...(normalized.reminderDate
                    ? { reminderDate: normalized.reminderDate }
                    : {}),
                  ...(typeof fnArgs.is_recurring === "boolean"
                    ? { isRecurring: fnArgs.is_recurring }
                    : {}),
                  ...(typeof fnArgs.recurrence_type === "string"
                    ? {
                        recurrenceType: fnArgs.recurrence_type as
                          | "yearly"
                          | "monthly"
                          | "weekly"
                          | "daily",
                      }
                    : {}),
                });
                result = JSON.stringify({ success: true, memory_id: fnArgs.memory_id });
              } catch (error) {
                result = JSON.stringify({
                  error:
                    error instanceof Error ? error.message : "Failed to update memory",
                });
              }
            } else if (fnName === "delete_memory") {
              try {
                await ctx.runMutation(api.memories.remove, {
                  token: args.token,
                  id: fnArgs.memory_id as Id<"memories">,
                });
                result = JSON.stringify({ success: true });
              } catch (error) {
                result = JSON.stringify({
                  error:
                    error instanceof Error ? error.message : "Failed to delete memory",
                });
              }
            } else if (fnName === "delete_multiple_memories") {
              const memoryIds = Array.isArray(fnArgs.memory_ids)
                ? fnArgs.memory_ids.filter(
                    (value): value is string =>
                      typeof value === "string" && value.trim().length > 0
                  )
                : [];
              result = JSON.stringify(
                await ctx.runMutation(api.memories.removeMany, {
                  token: args.token,
                  ids: memoryIds,
                })
              );
            } else if (fnName === "list_memories") {
              const memories = await listMemoriesForAI(
                ctx,
                session._id,
                typeof fnArgs.limit === "number" ? fnArgs.limit : 20
              );
              const filtered = memories.filter(
                (memory: MemoryDoc) =>
                  typeof fnArgs.category !== "string" ||
                  memory.category === fnArgs.category
              );
              const ordered =
                fnArgs.sort === "oldest" ? [...filtered].reverse() : filtered;
              result = JSON.stringify({
                memories: ordered
                  .slice(0, typeof fnArgs.limit === "number" ? fnArgs.limit : 20)
                  .map((memory: MemoryDoc) => toMemorySummary(memory)),
                count: filtered.length,
              });
            } else if (fnName === "get_stats") {
              const memories = await listMemoriesForAI(ctx, session._id, 100);
              const categories: Record<string, number> = {};
              const moods: Record<string, number> = {};
              const tagCounts: Record<string, number> = {};
              let withReminders = 0;
              let recurring = 0;

              for (const memory of memories) {
                categories[memory.category] = (categories[memory.category] ?? 0) + 1;
                if (memory.mood) {
                  moods[memory.mood] = (moods[memory.mood] ?? 0) + 1;
                }
                for (const tag of memory.tags) {
                  tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
                }
                if (memory.reminderDate) {
                  withReminders += 1;
                }
                if (memory.isRecurring) {
                  recurring += 1;
                }
              }

              const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
              result = JSON.stringify({
                total: memories.length,
                categories,
                moods,
                topTags: Object.entries(tagCounts)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 10),
                withReminders,
                recurring,
                recentCount: memories.filter(
                  (memory: MemoryDoc) => memory._creationTime >= weekAgo
                ).length,
              });
            } else if (fnName === "analyze_memories") {
              const memories = await listMemoriesForAI(
                ctx,
                session._id,
                typeof fnArgs.limit === "number" ? fnArgs.limit : 100
              );
              const filtered = memories.filter(
                (memory: MemoryDoc) =>
                  typeof fnArgs.category !== "string" ||
                  memory.category === fnArgs.category
              );
              result = JSON.stringify({
                memories: filtered.map((memory: MemoryDoc) => toMemorySummary(memory)),
                count: filtered.length,
              });
            } else if (fnName === "history") {
              if (fnArgs.action === "list") {
                result = JSON.stringify({
                  history: await ctx.runQuery(api.history.listSnapshots, {
                    token: args.token,
                    ...(typeof fnArgs.memory_id === "string"
                      ? { memoryId: fnArgs.memory_id as Id<"memories"> }
                      : {}),
                    ...(typeof fnArgs.limit === "number"
                      ? { limit: Math.min(fnArgs.limit, 20) }
                      : { limit: 10 }),
                  }),
                });
              } else if (fnArgs.action === "undo") {
                result = JSON.stringify(
                  await ctx.runMutation(api.history.undo, {
                    token: args.token,
                    ...(typeof fnArgs.memory_id === "string"
                      ? { memoryId: fnArgs.memory_id as Id<"memories"> }
                      : {}),
                  })
                );
              } else if (fnArgs.action === "restore") {
                result = JSON.stringify(
                  await ctx.runMutation(api.history.restore, {
                    token: args.token,
                    historyId: fnArgs.history_id as Id<"memoryHistory">,
                  })
                );
              }
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
                result = JSON.stringify({ success: true, attachment_id: attachmentId });
              } catch (error) {
                result = JSON.stringify({
                  error:
                    error instanceof Error ? error.message : "Failed to attach file",
                });
              }
            }

            conversation.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: result,
            });
          }
        }

        aiResponse =
          finalText || "I processed that, but I couldn't generate a clear reply.";
      } catch {
        aiResponse =
          "I'm having trouble connecting right now. Please try again in a moment.";
      }
    }

    await ctx.runMutation(internal.chat.send, {
      userId: session._id,
      content: aiResponse,
      role: "assistant",
    });

    return { reply: aiResponse };
  },
});
