"use node";

import { v } from "convex/values";
import type OpenAI from "openai";
import { api, internal } from "../_generated/api";
import { action } from "../_generated/server";
import { extractTextContent, resolveAiRoute, trackedChatCompletionStream } from "../lib/aiDispatch";
import { createReplyStreamer } from "../lib/chat/replyStreamer";
import { extractChatAttachmentsForConversation, parseAttachments } from "../lib/chat/attachments";
import {
  HISTORY_CONTEXT_MESSAGES,
  HISTORY_MESSAGE_CHARS,
  MAX_COMPLETION_TOKENS,
  MAX_ITERATIONS,
  PLANNER_TEMPERATURE,
} from "../lib/chat/budgets";
import { buildCardFlowPayload, type CardFlowAttachment } from "../lib/chat/flow";
import { CREATE_ONLY_INTENT_PATTERNS, shouldPreferUpdatingExisting } from "../lib/chat/heuristics";
import { toPreviewItems } from "../lib/chat/projections";
import {
  buildAttachmentContextMessage,
  buildGroundingSystemMessage,
  buildKnowledgeDigestMessage,
  buildMemoryReferenceHint,
  buildSystemPrompt,
} from "../lib/chat/prompts";
import { buildGroundingContext, listMemoriesForAI } from "../lib/chat/search";
import { CHAT_TOOL_DEFINITIONS, CHAT_TOOLS_BY_NAME, type ToolContext } from "../lib/chat/tools";
import { appendFlowTool, createTurnState, validateCardIds } from "../lib/chat/turnState";
import type {
  ChatAttachmentExtraction,
  ChatAttachmentRecord,
  ChatMessageMeta,
  KnowledgeDigest,
  MemoryDoc,
  StreamingStatus,
} from "../lib/chat/types";

const driveAttachmentArg = v.object({
  filename: v.string(),
  mimeType: v.string(),
  sizeBytes: v.number(),
  type: v.union(v.literal("image"), v.literal("document")),
  driveFileId: v.string(),
  driveFolderId: v.string(),
  driveWebViewLink: v.optional(v.string()),
  driveThumbnailLink: v.optional(v.string()),
});

export const chat = action({
  args: {
    token: v.string(),
    message: v.string(),
    currentTime: v.optional(v.string()),
    currentTimezone: v.optional(v.string()),
    attachments: v.optional(v.array(driveAttachmentArg)),
  },
  handler: async (ctx, args) => {
    const session = await ctx.runQuery(api.auth.me, { token: args.token });
    if (!session) {
      throw new Error("Unauthorized");
    }
    const chatRoute = await resolveAiRoute(ctx, {
      userId: session._id,
      feature: "memory_chat",
    });

    const effectiveTimezone = args.currentTimezone?.trim() || session.timezone || "UTC";
    const hasDirectAttachments = (args.attachments?.length ?? 0) > 0;
    const shouldSkipInitialGroundingForCreate =
      hasDirectAttachments &&
      CREATE_ONLY_INTENT_PATTERNS.some((pattern) => pattern.test(args.message)) &&
      !shouldPreferUpdatingExisting(args.message);

    const chatMessageId = await ctx.runMutation(internal.chat.send, {
      userId: session._id,
      content: args.message,
      role: "user",
    });
    const analyticsLink = {
      chatTurnId: chatMessageId,
      chatMessageId,
    } as const;
    await ctx.runMutation(internal.chat.clearSearchStatus, {
      userId: session._id,
    });

    const setStreamingStatus = async (status: StreamingStatus) => {
      await ctx.runMutation(internal.chat.setSearchStatus, {
        userId: session._id,
        ...status,
      });
    };

    const chatAttachments: ChatAttachmentRecord[] = [];
    if (args.attachments && args.attachments.length > 0) {
      try {
        const recorded = await ctx.runMutation(internal.attachments.recordAttachmentsInternal, {
          userId: session._id,
          chatMessageId,
          files: args.attachments,
          scheduleProcessing: false,
        });
        chatAttachments.push(...recorded.attachments);
      } catch (err) {
        console.error("Failed to record attachments:", err);
      }
    }

    // Recent-memories cache shared by grounding and every tool in this turn.
    let recentMemoriesCache: MemoryDoc[] | undefined;
    const getRecentMemories = async (): Promise<MemoryDoc[]> => {
      if (!recentMemoriesCache) {
        recentMemoriesCache = await listMemoriesForAI(ctx, session._id);
      }
      return recentMemoriesCache ?? [];
    };
    const invalidateRecentMemories = () => {
      recentMemoriesCache = undefined;
    };

    // Grounding search runs concurrently with history/digest fetch and
    // attachment extraction — it only depends on the user message.
    const groundingPromise = (async () =>
      buildGroundingContext(ctx, {
        token: args.token,
        message: args.message,
        userId: session._id,
        recentMemories: await getRecentMemories(),
        skipInitialGroundingSearch: shouldSkipInitialGroundingForCreate,
        chatTurnId: chatMessageId,
      }))();

    const [chatHistory, knowledgeDigest] = await Promise.all([
      ctx.runQuery(api.chat.list, {
        token: args.token,
        limit: HISTORY_CONTEXT_MESSAGES,
      }),
      ctx
        .runQuery(internal.diary.getKnowledgeDigestInternal, {
          userId: session._id,
        })
        .catch(() => null) as Promise<KnowledgeDigest | null>,
    ]);
    const recentChat: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
    let latestReferencedMemoryIds: string[] = [];
    for (const message of chatHistory as Array<{
      role: string;
      content?: string | null;
      meta?: { cards?: Array<{ table: string; id: string }> } | null;
    }>) {
      recentChat.push({
        role: message.role as "user" | "assistant",
        content: (message.content ?? "").slice(0, HISTORY_MESSAGE_CHARS),
      });
      // After each assistant message, inject referenced memory IDs as a system hint so the
      // AI can resolve pronouns ("delete that", "edit it") in follow-up turns without a DB call.
      if (message.role === "assistant") {
        const referencedIds = (message.meta?.cards ?? [])
          .map((card) => card.id)
          .filter((id) => id.length > 0);
        if (referencedIds.length > 0) {
          latestReferencedMemoryIds = referencedIds;
          recentChat.push({
            role: "system",
            content: buildMemoryReferenceHint(referencedIds),
          });
        }
      }
    }

    const legacyAttachments = parseAttachments(args.message);
    const extractedChatAttachments = await extractChatAttachmentsForConversation(ctx, {
      userId: session._id,
      attachments: chatAttachments,
      setStreamingStatus,
      chatTurnId: chatMessageId,
    });
    const flowAttachments: CardFlowAttachment[] = extractedChatAttachments.map((attachment) => ({
      name: attachment.name,
      type: attachment.type,
      status: attachment.processingStatus,
      method: attachment.extractionMethod,
    }));

    let aiResponse = "I'm having trouble connecting right now. Please try again in a moment.";
    let responseMeta: ChatMessageMeta | undefined;
    const replyStreamer = createReplyStreamer(ctx, session._id);

    try {
      await setStreamingStatus({
        phase: "analyzing",
        toolName: "planner",
        detail: "Understanding request and loading relevant context",
        source: "chat",
        events: [{ label: "Context", value: "recent chat + memories" }],
        step: 1,
        totalSteps: 4,
      });

      const conversation: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
          role: "system",
          content: buildSystemPrompt(
            effectiveTimezone,
            args.currentTime ?? new Date().toISOString(),
          ),
        },
        ...(knowledgeDigest
          ? [
              {
                role: "system" as const,
                content: buildKnowledgeDigestMessage(knowledgeDigest),
              },
            ]
          : []),
        ...recentChat,
        ...(legacyAttachments.length > 0
          ? [
              {
                role: "system" as const,
                content: `Attachment metadata for the latest user message: ${JSON.stringify(
                  legacyAttachments,
                )}`,
              },
            ]
          : []),
        ...(extractedChatAttachments.length > 0
          ? [
              {
                role: "system" as const,
                content: buildAttachmentContextMessage(extractedChatAttachments),
              },
            ]
          : []),
        {
          role: "user" as const,
          content: args.message,
        },
      ];

      const initialGrounding = await groundingPromise;

      const state = createTurnState();

      if (initialGrounding.shouldGround) {
        state.flowSearches.push({
          source: "grounding",
          query: args.message,
          resultCount: initialGrounding.searchCount,
          cacheState: initialGrounding.isCached ? "cached" : "fresh",
          searchMode: initialGrounding.isCached ? "semantic_cached" : "semantic_fresh",
        });
        conversation.splice(conversation.length - 1, 0, {
          role: "system",
          content: buildGroundingSystemMessage(initialGrounding),
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
        resultCount: initialGrounding.shouldGround ? initialGrounding.searchCount : undefined,
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

      // Candidate pool kept for flow/context bookkeeping only — the final
      // card set always comes from the model's own respond(used_ids) call.
      if (initialGrounding.shouldGround) {
        state.pendingSearchIsCached = initialGrounding.isCached;
        if (initialGrounding.searchResults.length > 0) {
          state.surfaceCandidates = initialGrounding.searchResults.map((mem) => ({
            id: String(mem.id),
            title: mem.title ?? "",
          }));
        }
      }

      const toolContext: ToolContext = {
        ctx,
        token: args.token,
        userId: session._id,
        userMessage: args.message,
        currentTime: args.currentTime,
        effectiveTimezone,
        chatMessageId,
        hasDirectAttachments,
        setStreamingStatus,
        getRecentMemories,
        invalidateRecentMemories,
        grounding: initialGrounding,
        knowledgeDigest,
        latestReferencedMemoryIds,
        state,
      };

      let finalIteration = 0;
      for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
        finalIteration = iteration;
        await setStreamingStatus({
          phase: "thinking",
          toolName: "planner",
          detail:
            iteration === 0
              ? "Choosing the next backend operation"
              : "Continuing multi-step reasoning",
          source: "chat",
          step: 2,
          totalSteps: 4,
        });
        replyStreamer.reset();
        const response = await trackedChatCompletionStream(ctx, {
          userId: session._id,
          feature: "memory_chat",
          stage: "planner",
          visibility: "user_visible",
          link: analyticsLink,
          onDelta: replyStreamer.onDelta,
          // The final answer always arrives as the `respond` tool's
          // `message` argument (see tools/respond.ts) — extract it live
          // from the streaming tool-call arguments so it still reads as
          // plain streamed text to the user.
          streamToolTextField: { toolName: "respond", argName: "message" },
          request: {
            messages: conversation,
            tools: CHAT_TOOL_DEFINITIONS,
            // Forced, single tool call per turn: the model can no longer
            // silently skip reporting which memories it used the way a
            // freeform-text exit allowed. respond() is always one of the
            // available choices, so this never blocks a normal reply.
            // On the last allowed iteration, force respond specifically —
            // otherwise an open-ended question can make the model chain
            // info-gathering tools indefinitely and exhaust the loop
            // without ever answering (observed: analyze_memories →
            // get_diary_entries → get_stats → get_diary_entries, no reply).
            tool_choice:
              iteration === MAX_ITERATIONS - 1
                ? { type: "function", function: { name: "respond" } }
                : "required",
            parallel_tool_calls: false,
            temperature: PLANNER_TEMPERATURE,
            max_completion_tokens: MAX_COMPLETION_TOKENS,
          },
        });

        const choice = response.choices[0]?.message;
        if (!choice?.tool_calls?.length) {
          // Only reachable if a provider without forced tool-choice support
          // is ever routed here (see chatCompletion fallback in aiDispatch).
          finalText = extractTextContent(choice?.content) || finalText;
          break;
        }

        conversation.push({
          role: "assistant",
          content: extractTextContent(choice.content),
          tool_calls: choice.tool_calls,
        });

        for (const toolCall of choice.tool_calls) {
          if (toolCall.type !== "function") {
            continue;
          }

          const fnName = toolCall.function.name;
          appendFlowTool(state, fnName);
          const fnArgs = JSON.parse(toolCall.function.arguments || "{}") as Record<string, unknown>;
          const tool = CHAT_TOOLS_BY_NAME.get(fnName);
          const streamingDetail: StreamingStatus = tool
            ? tool.buildStatus(fnArgs)
            : {
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

          // Structural backstop for the "never repeat an identical call"
          // prompt rule: skip re-running the handler (and re-hitting the
          // DB) if the model dispatches the exact same tool+args again
          // this turn, and nudge it toward respond instead of looping.
          const signature = `${fnName}:${toolCall.function.arguments ?? ""}`;
          const isRepeatCall = fnName !== "respond" && state.calledToolSignatures.has(signature);

          let result: string;
          if (isRepeatCall) {
            result = JSON.stringify({
              note: "Skipped — you already called this exact tool with these exact arguments earlier in this turn. Reuse that result, or call respond now if you have enough information.",
            });
          } else {
            result = tool
              ? await tool.handler(toolContext, fnArgs)
              : JSON.stringify({ error: "Unknown tool" });
            if (tool) state.calledToolSignatures.add(signature);
          }

          conversation.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: result,
          });
        }

        // respond() ends the turn — its message + used_ids are already in
        // state, no further iteration needed.
        if (state.respondCalled) {
          finalText = state.finalMessage;
          break;
        }
      }

      let resolvedText = finalText?.trim();
      if (!resolvedText) {
        if (state.writeToolCalled) {
          resolvedText = state.writeFallbackMessage || "Done — I updated that.";
        } else if (state.pendingDeletionItems.length > 0) {
          resolvedText = "I found matching items. Please confirm below.";
        } else if (state.pendingCardIds.size > 0) {
          resolvedText = "Here are the matching memories.";
        } else {
          resolvedText = "I processed that, but I couldn't generate a clear reply.";
        }
      }

      const { diaryIds: diaryCardIds } = await validateCardIds(ctx, session._id, state);

      await setStreamingStatus({
        phase: "finalizing",
        toolName: "reply",
        detail: "Preparing final answer",
        source: "assistant",
        resultCount: state.pendingCardIds.size + diaryCardIds.length,
        events: [{ label: "Cards", value: `${state.pendingCardIds.size + diaryCardIds.length}` }],
        step: 4,
        totalSteps: 4,
      });

      const cardRefs = [
        ...Array.from(state.pendingCardIds).map((id) => ({
          table: "memories" as const,
          id,
        })),
        ...diaryCardIds.map((id) => ({ table: "diaryEntries" as const, id })),
      ];
      responseMeta =
        cardRefs.length > 0 || state.pendingDeletionItems.length > 0
          ? {
              ...(cardRefs.length > 0
                ? {
                    cards: cardRefs,
                    isCached: state.pendingSearchIsCached,
                    turns: finalIteration + 1,
                    flow: buildCardFlowPayload({
                      chatTurnId: String(chatMessageId),
                      assistantProvider: chatRoute.provider,
                      turns: finalIteration + 1,
                      cardCount: cardRefs.length,
                      pathMode: state.pendingSearchIsCached ? "cached" : "fresh",
                      searches: state.flowSearches,
                      toolSequence: state.flowToolSequence,
                      attachments: flowAttachments,
                    }),
                  }
                : {}),
              ...(state.pendingDeletionItems.length > 0
                ? { deletionProposal: state.pendingDeletionItems }
                : {}),
            }
          : undefined;

      aiResponse = resolvedText;
      await ctx.runMutation(internal.chat.clearSearchStatus, {
        userId: session._id,
      });
    } catch {
      await ctx.runMutation(internal.chat.clearSearchStatus, {
        userId: session._id,
      });
      aiResponse = "I'm having trouble connecting right now. Please try again in a moment.";
      responseMeta = undefined;
    }

    await replyStreamer.finalize({
      content: aiResponse,
      ...(responseMeta ? { meta: responseMeta } : {}),
    });

    const attachmentFailures = extractedChatAttachments
      .filter(
        (
          attachment,
        ): attachment is ChatAttachmentExtraction & {
          processingError: string;
        } =>
          attachment.processingStatus === "failed" &&
          typeof attachment.processingError === "string" &&
          attachment.processingError.trim().length > 0,
      )
      .map((attachment) => ({
        name: attachment.name,
        reason: attachment.processingError.trim(),
      }));

    return {
      reply: aiResponse.trim(),
      attachmentFailures,
    };
  },
});
