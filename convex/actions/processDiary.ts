"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  extractTextContent,
  getEmbeddingFingerprintForUser,
  safeJsonParse,
  trackedChatCompletion,
  trackedEmbedText,
} from "../lib/aiDispatch";
import { normalizeDiaryFields } from "../lib/aiNormalization";
import { buildDiarySearchText } from "../lib/diaryText";

export const processDiary = action({
  args: {
    entryId: v.id("diaryEntries"),
    rawText: v.string(),
  },
  handler: async (ctx, args) => {
    const entry = await ctx.runQuery(internal.diary.getEntryInternal, {
      entryId: args.entryId,
    });
    if (!entry) return;

    try {
      const response = await trackedChatCompletion(ctx, {
        userId: entry.userId,
        feature: "diary_processing",
        metadata: { stage: "analysis" },
        request: {
          temperature: 0.3,
          messages: [
            {
              role: "system",
              content:
                "You are a personal diary AI analyst. Analyze the user's diary entry and extract structured insights. Always preserve the user's meaning and voice while correcting grammar.",
            },
            { role: "user", content: args.rawText },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "extract_diary_insights",
                description: "Extract structured insights from a diary entry",
                parameters: {
                  type: "object",
                  properties: {
                    correctedText: { type: "string" },
                    summary: { type: "string" },
                    keyPoints: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          point: { type: "string" },
                          category: {
                            type: "string",
                            enum: ["thought", "event", "feeling", "decision", "goal", "concern"],
                          },
                        },
                        required: ["point", "category"],
                      },
                    },
                    mood: {
                      type: "string",
                      enum: [
                        "happy",
                        "sad",
                        "anxious",
                        "excited",
                        "neutral",
                        "grateful",
                        "frustrated",
                        "hopeful",
                        "nostalgic",
                        "motivated",
                      ],
                    },
                    energyLevel: {
                      type: "string",
                      enum: ["high", "medium", "low"],
                    },
                    topics: { type: "array", items: { type: "string" } },
                    habitsDetected: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          habit: { type: "string" },
                          sentiment: {
                            type: "string",
                            enum: ["positive", "negative", "neutral"],
                          },
                          frequencyHint: { type: "string" },
                        },
                        required: ["habit", "sentiment"],
                      },
                    },
                    personalityTraits: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          trait: { type: "string" },
                          evidence: { type: "string" },
                        },
                        required: ["trait", "evidence"],
                      },
                    },
                    likes: { type: "array", items: { type: "string" } },
                    dislikes: { type: "array", items: { type: "string" } },
                    actionItems: { type: "array", items: { type: "string" } },
                  },
                  required: [
                    "correctedText",
                    "summary",
                    "keyPoints",
                    "mood",
                    "energyLevel",
                    "topics",
                  ],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "extract_diary_insights" },
          },
        },
      });
      const toolCall = response.choices[0]?.message?.tool_calls?.[0];
      const analysis = safeJsonParse<{
        correctedText?: string;
        summary?: string;
        mood?: string;
        energyLevel?: string;
        topics?: string[];
        keyPoints?: Array<{ point?: string; category?: string }>;
        habitsDetected?: Array<{
          habit?: string;
          sentiment?: string;
          frequencyHint?: string;
        }>;
        personalityTraits?: Array<{ trait?: string; evidence?: string }>;
        likes?: string[];
        dislikes?: string[];
        actionItems?: string[];
      }>(
        toolCall?.type === "function"
          ? toolCall.function.arguments
          : extractTextContent(response.choices[0]?.message?.content),
      );
      if (!analysis) return;
      const normalized = normalizeDiaryFields({
        correctedText: analysis.correctedText,
        summary: analysis.summary,
        mood: analysis.mood,
        energyLevel: analysis.energyLevel,
        topics: analysis.topics,
        insights: Array.isArray(analysis.keyPoints)
          ? analysis.keyPoints.map((item) => ({
              insight: item.point,
              category: item.category,
            }))
          : [],
        habitsDetected: analysis.habitsDetected,
        personalityTraits: analysis.personalityTraits,
        likes: analysis.likes,
        dislikes: analysis.dislikes,
        actionItems: analysis.actionItems,
      });

      await ctx.runMutation(internal.processDiaryMutations.updateDiaryAnalysis, {
        entryId: args.entryId,
        correctedText: normalized.correctedText || args.rawText,
        mood: normalized.mood || "neutral",
        energyLevel: normalized.energyLevel || "medium",
        topics: normalized.topics || [],
        summary: normalized.summary,
        insights: normalized.insights || [],
        habitsDetected: normalized.habitsDetected,
        personalityTraits: normalized.personalityTraits,
        likes: normalized.likes,
        dislikes: normalized.dislikes,
        actionItems: normalized.actionItems,
      });

      // One write-time embedding per entry makes the diary semantically searchable
      // from chat with zero extra AI calls at query time.
      try {
        // feature must map to the embeddings capability so the route resolves
        // an embedding model (diary_processing would route a chat model)
        const embedding = await trackedEmbedText(ctx, {
          userId: entry.userId,
          feature: "memory_search",
          stage: "diary_embedding",
          visibility: "background",
          metadata: { stage: "diary_embedding" },
          input: buildDiarySearchText({
            rawText: args.rawText,
            correctedText: normalized.correctedText || args.rawText,
            summary: normalized.summary,
            topics: normalized.topics,
          }),
        });
        const embeddingFingerprint = await getEmbeddingFingerprintForUser(ctx, entry.userId);
        await ctx.runMutation(internal.processDiaryMutations.updateDiaryEmbedding, {
          entryId: args.entryId,
          embedding,
          embeddingFingerprint,
        });
      } catch {
        // Embedding failure is non-critical — fulltext search still works
      }

      const recentEntries = await ctx.runQuery(internal.diary.listRecentForNudges, {
        entryId: args.entryId,
      });

      if (recentEntries.length >= 3) {
        const summary = recentEntries
          .map(
            (entry: any) =>
              `Mood: ${entry.mood ?? "neutral"} | Summary: ${entry.summary ?? ""} | Habits: ${JSON.stringify(entry.habitsDetected ?? [])}`,
          )
          .join("\n");

        const nudgeResponse = await trackedChatCompletion(ctx, {
          userId: entry.userId,
          feature: "diary_processing",
          metadata: { stage: "nudge_generation" },
          request: {
            temperature: 0.3,
            messages: [
              {
                role: "system",
                content:
                  "You are a gentle behavioral coach. Based on recent diary entries, generate 1-2 actionable nudges that are warm, specific, and non-judgmental.",
              },
              { role: "user", content: `Recent diary entries:\n${summary}` },
            ],
            tools: [
              {
                type: "function",
                function: {
                  name: "generate_nudges",
                  description: "Generate behavioral nudges based on diary patterns",
                  parameters: {
                    type: "object",
                    properties: {
                      nudges: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            title: { type: "string" },
                            message: { type: "string" },
                            nudgeType: {
                              type: "string",
                              enum: [
                                "habit_reinforce",
                                "habit_redirect",
                                "mood_boost",
                                "self_care",
                                "social",
                                "growth",
                              ],
                            },
                            priority: {
                              type: "string",
                              enum: ["low", "normal", "high"],
                            },
                          },
                          required: ["title", "message", "nudgeType", "priority"],
                          additionalProperties: false,
                        },
                      },
                    },
                    required: ["nudges"],
                    additionalProperties: false,
                  },
                },
              },
            ],
            tool_choice: {
              type: "function",
              function: { name: "generate_nudges" },
            },
          },
        });

        const nudgeCall = nudgeResponse.choices[0]?.message?.tool_calls?.[0];
        const nudgePayload = safeJsonParse<{
          nudges?: Array<{
            title?: string;
            message?: string;
            nudgeType?: string;
            priority?: string;
          }>;
        }>(nudgeCall?.type === "function" ? nudgeCall.function.arguments : "");

        if (nudgePayload?.nudges?.length) {
          const normalizedNudges: Array<{
            title: string;
            message: string;
            nudgeType: string;
            priority: "high" | "normal" | "low";
          }> = nudgePayload.nudges.flatMap((nudge) => {
            if (!nudge.title || !nudge.message || !nudge.nudgeType || !nudge.priority) {
              return [];
            }

            const priority: "high" | "normal" | "low" =
              nudge.priority === "high" ? "high" : nudge.priority === "low" ? "low" : "normal";

            return [
              {
                title: nudge.title,
                message: nudge.message,
                nudgeType: nudge.nudgeType,
                priority,
              },
            ];
          });

          await ctx.runMutation(internal.diary.replaceNudgesFromDiary, {
            entryId: args.entryId,
            nudges: normalizedNudges,
          });
        }
      }
    } catch {
      // Analysis failure is non-critical
    }
  },
});
