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

type Conflict = {
  existingMemoryId: string;
  existingMemoryTitle?: string;
  conflictType?: "factual" | "decision" | "schedule" | "preference";
  description: string;
  suggestion?: "keep_new" | "keep_old" | "merge" | "review";
};

type ConflictResult = {
  conflicts: Conflict[];
};

export const detectConflicts = action({
  args: {
    token: v.string(),
    memoryId: v.id("memories"),
    content: v.string(),
    embedding: v.optional(v.array(v.float64())),
  },
  handler: async (ctx, args): Promise<ConflictResult> => {
    const client = getOpenAIClient();
    if (!client) {
      return { conflicts: [] };
    }

    const session = await ctx.runQuery(api.auth.me, { token: args.token });
    if (!session) {
      throw new Error("Unauthorized");
    }

    // Use higher similarity threshold (0.45) for conflict detection — we want
    // closely related memories, not just vaguely similar ones
    let semanticallySimilar: Array<{ _id: Id<"memories">; _score: number }> = [];
    try {
      const embedding =
        args.embedding ?? (await embedText(args.content.slice(0, 4000)));
      semanticallySimilar = await ctx.vectorSearch("memories", "by_embedding", {
        vector: embedding,
        limit: 8,
        filter: (q) => q.eq("userId", session._id),
      });
    } catch {
      // Fall back to keyword candidates if embeddings fail.
    }

    const similarIds = semanticallySimilar
      .filter((result) => result._id !== args.memoryId && result._score > 0.7)
      .map((result) => result._id);

    if (similarIds.length === 0) {
      const candidates = await ctx.runQuery(internal.memories.searchByKeyword, {
        userId: session._id,
        query: args.content,
        limit: 8,
      });
      const filteredCandidates = candidates
        .filter((memory: { _id: Id<"memories"> }) => memory._id !== args.memoryId)
        .slice(0, 8);
      if (filteredCandidates.length === 0) {
        return { conflicts: [] };
      }

      const memoryText = filteredCandidates
        .map((memory: { _id: Id<"memories">; title?: string; content?: string }) => `[${memory._id}] ${memory.title ?? ""}: ${(memory.content ?? "").slice(0, 150)}`)
        .join("\n");

      return analyzeConflicts(client, args.content, memoryText);
    }

    const memories = await ctx.runQuery(internal.memories.listByIdsInternal, {
      userId: session._id,
      ids: similarIds.slice(0, 10),
    });
    const candidateMemories = memories.map(
      (memory: { _id: Id<"memories">; title?: string; content?: string }) =>
        `[${memory._id}] ${memory.title ?? ""}: ${(memory.content ?? "").slice(0, 150)}`
    );

    if (candidateMemories.length === 0) {
      return { conflicts: [] };
    }

    return analyzeConflicts(client, args.content, candidateMemories.join("\n"));
  },
});

async function analyzeConflicts(
  client: NonNullable<ReturnType<typeof getOpenAIClient>>,
  newContent: string,
  existingText: string
): Promise<ConflictResult> {
  try {
    const response = await client.chat.completions.create({
      model: OPENAI_CHAT_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a memory conflict detector. Compare a NEW memory against EXISTING memories and identify contradictions or outdated information.

Look for:
- Factual contradictions (e.g., different passwords, addresses, phone numbers for the same thing)
- Updated decisions that override old ones
- Schedule conflicts (overlapping times/dates)
- Changed preferences or opinions on the same topic

Only report REAL conflicts where information genuinely contradicts. Do NOT flag memories that are simply related or similar.

Return JSON: {"conflicts": [{"existingMemoryId": "...", "existingMemoryTitle": "...", "conflictType": "factual|decision|schedule|preference", "description": "brief explanation", "suggestion": "keep_new|keep_old|merge|review"}]}

Return an empty conflicts array if none exist.`,
        },
        {
          role: "user",
          content: `New memory: ${newContent}\n\nExisting memories:\n${existingText}`,
        },
      ],
    });

    return (
      safeJsonParse<ConflictResult>(
        extractTextContent(response.choices[0]?.message?.content)
      ) ?? { conflicts: [] }
    );
  } catch {
    return { conflicts: [] };
  }
}
