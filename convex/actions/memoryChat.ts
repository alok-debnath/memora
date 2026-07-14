"use node";

import { v } from "convex/values";
import type OpenAI from "openai";
import { api, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { action } from "../_generated/server";
import { extractTextContent, resolveAiRoute, trackedChatCompletionStream } from "../lib/aiDispatch";
import { createReplyStreamer } from "../lib/chat/replyStreamer";
import { extractChatAttachmentsForConversation, parseAttachments } from "../lib/chat/attachments";
import {
  HISTORY_CONTEXT_MESSAGES,
  HISTORY_MESSAGE_CHARS,
  HISTORY_OLDER_MESSAGE_CHARS,
  HISTORY_RECENT_TIER_MESSAGES,
  MAX_COMPLETION_TOKENS,
  MAX_ITERATIONS,
  PLANNER_TEMPERATURE,
} from "../lib/chat/budgets";
import { buildCardFlowPayload, type CardFlowAttachment } from "../lib/chat/flow";
import { CREATE_ONLY_INTENT_PATTERNS, shouldPreferUpdatingExisting } from "../lib/chat/heuristics";
import { toDiaryCardSnapshot, toMemoryCardSnapshot, toPreviewItems } from "../lib/chat/projections";
import {
  buildAttachmentContextMessage,
  buildGroundingSystemMessage,
  buildKnowledgeDigestMessage,
  buildMemoryReferenceHint,
  buildSystemPrompt,
} from "../lib/chat/prompts";
import { buildGroundingContext, listMemoriesForAI } from "../lib/chat/search";
import {
  CHAT_TOOLS_BY_NAME,
  getChatToolDefinitions,
  READ_ONLY_INFO_TOOL_NAMES,
  type ToolContext,
} from "../lib/chat/tools";
import {
  appendFlowTool,
  createTurnState,
  validateCardIds,
  type TurnState,
} from "../lib/chat/turnState";
import type {
  ChatAttachmentExtraction,
  ChatAttachmentRecord,
  ChatMessageMeta,
  CardSnapshot,
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

const ACTION_INTENT_PATTERN =
  /\b(delete|remove|restore|undo|sync|resync|retry|unsync|disconnect|edit|update|change|modify|fix|rename|move|convert|turn|make|remember|save|note|add|capture|store|remind me)\b/i;

type ChatActionResult = {
  reply: string;
  attachmentFailures: Array<{ name: string; reason: string }>;
};

type ChatHistoryItem = {
  _id: Id<"chatMessages">;
  role: "user" | "assistant";
  content?: string | null;
  meta?: { cards?: Array<{ table: string; id: string }> } | null;
};

export const chat = action({
  args: {
    token: v.string(),
    message: v.string(),
    currentTime: v.optional(v.string()),
    currentTimezone: v.optional(v.string()),
    attachments: v.optional(v.array(driveAttachmentArg)),
  },
  handler: async (ctx, args): Promise<ChatActionResult> => {
    const turnStartedAt = Date.now();
    const session = await ctx.runQuery(api.auth.me, { token: args.token });
    if (!session) {
      throw new Error("Unauthorized");
    }
    const effectiveTimezone = args.currentTimezone?.trim() || session.timezone || "UTC";
    const hasDirectAttachments = (args.attachments?.length ?? 0) > 0;
    const shouldSkipInitialGroundingForCreate =
      hasDirectAttachments &&
      CREATE_ONLY_INTENT_PATTERNS.some((pattern) => pattern.test(args.message)) &&
      !shouldPreferUpdatingExisting(args.message);

    const [chatRoute, chatMessageId] = await Promise.all([
      resolveAiRoute(ctx, {
        userId: session._id,
        feature: "memory_chat",
      }),
      ctx.runMutation(internal.chat.send, {
        userId: session._id,
        content: args.message,
        role: "user",
      }),
    ]);
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
    const groundingPromise = buildGroundingContext(ctx, {
      message: args.message,
      userId: session._id,
      getRecentMemories,
      skipInitialGroundingSearch: shouldSkipInitialGroundingForCreate,
      chatTurnId: chatMessageId,
    });

    const attachmentExtractionPromise = extractChatAttachmentsForConversation(ctx, {
      userId: session._id,
      attachments: chatAttachments,
      setStreamingStatus,
      chatTurnId: chatMessageId,
    });

    const [chatHistory, knowledgeDigest, extractedChatAttachments] = await Promise.all([
      ctx.runQuery(api.chat.list, {
        token: args.token,
        limit: HISTORY_CONTEXT_MESSAGES,
      }) as Promise<ChatHistoryItem[]>,
      ctx
        .runQuery(internal.diary.getKnowledgeDigestInternal, {
          userId: session._id,
        })
        .catch(() => null) as Promise<KnowledgeDigest | null>,
      attachmentExtractionPromise,
    ]);
    const preparationLatencyMs = Date.now() - turnStartedAt;
    const recentChat: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
    let latestReferencedMemoryIds: string[] = [];
    // chatHistory is oldest-first; only the last few turns matter much for
    // resolving the current request, so give them the full char budget and
    // truncate older ones harder — shrinks the token floor of every turn.
    const priorHistory = chatHistory.filter((message) => message._id !== chatMessageId);
    priorHistory.forEach((message, index) => {
      const isRecentTier = priorHistory.length - index <= HISTORY_RECENT_TIER_MESSAGES;
      const charCap = isRecentTier ? HISTORY_MESSAGE_CHARS : HISTORY_OLDER_MESSAGE_CHARS;
      recentChat.push({
        role: message.role as "user" | "assistant",
        content: (message.content ?? "").slice(0, charCap),
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
    });

    const legacyAttachments = parseAttachments(args.message);
    const flowAttachments: CardFlowAttachment[] = extractedChatAttachments.map((attachment) => ({
      name: attachment.name,
      type: attachment.type,
      status: attachment.processingStatus,
      method: attachment.extractionMethod,
    }));
    const chatToolDefinitions = getChatToolDefinitions(args.message);

    let aiResponse = "I'm having trouble connecting right now. Please try again in a moment.";
    let responseMeta: ChatMessageMeta | undefined;
    const replyStreamer = createReplyStreamer(ctx, session._id);

    // Hoisted so the catch block below can recover a partially completed
    // turn: writes (create/update memory, reminder sync) commit to the DB
    // mid-loop, before a later completion-round network/parse error can
    // throw — the catch must not report a false "trouble connecting" when
    // a write already succeeded (see finalizeFromState below).
    let state: TurnState | undefined;
    let finalIteration = 0;
    const plannerMetrics = {
      latencyMs: 0,
      toolCalls: 0,
      toolBatches: 0,
      cachedInputTokens: 0,
    };

    // Resolves the visible reply text + response meta (cards, deletion
    // proposal, flow payload) from whatever turn state exists so far. Used
    // on the normal completion path below, and reused from the catch block
    // when a write already committed before a later mid-turn failure —
    // see the write-recovery comment in the catch block.
    const finalizeFromState = async (
      finalText: string,
    ): Promise<{ resolvedText: string; meta: ChatMessageMeta | undefined }> => {
      if (!state) {
        return {
          resolvedText: "I'm having trouble connecting right now. Please try again in a moment.",
          meta: undefined,
        };
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

      const hasDeletionProposal = state.pendingDeletionItems.length > 0;
      const deletionProposalIds = new Set(state.pendingDeletionItems.map((item) => item.id));

      const { memoryIds: memoryCardIds, diaryIds: diaryCardIds } = await validateCardIds(
        ctx,
        session._id,
        state,
      );

      const validDeletionMemoryIds =
        hasDeletionProposal && deletionProposalIds.size > 0
          ? ((await ctx.runQuery(internal.memories.filterValidCardIds, {
              userId: session._id,
              ids: Array.from(deletionProposalIds),
            })) as string[])
          : [];

      const visualMemoryCardIds = memoryCardIds.filter((id) => !deletionProposalIds.has(id));
      const visualDiaryCardIds = diaryCardIds;
      const visualCardRefs = [
        ...visualMemoryCardIds.map((id) => ({
          table: "memories" as const,
          id,
        })),
        ...visualDiaryCardIds.map((id) => ({ table: "diaryEntries" as const, id })),
      ];
      const cardRefMap = new Map<string, { table: "memories" | "diaryEntries"; id: string }>();
      for (const ref of visualCardRefs) {
        cardRefMap.set(`${ref.table}:${ref.id}`, ref);
      }
      for (const id of validDeletionMemoryIds) {
        cardRefMap.set(`memories:${id}`, { table: "memories", id });
      }
      const cardRefs = Array.from(cardRefMap.values());

      await setStreamingStatus({
        phase: "finalizing",
        toolName: "reply",
        detail: "Preparing final answer",
        source: "assistant",
        resultCount: visualCardRefs.length + validDeletionMemoryIds.length,
        events: [
          {
            label: "Items",
            value: `${visualCardRefs.length + validDeletionMemoryIds.length}`,
          },
        ],
        step: 4,
        totalSteps: 4,
      });

      let cardSnapshots: CardSnapshot[] = [];
      if (visualCardRefs.length > 0) {
        const [memoryDocs, diaryDocs] = await Promise.all([
          visualMemoryCardIds.length > 0
            ? (ctx.runQuery(internal.memories.listByIdsInternal, {
                userId: session._id,
                ids: visualMemoryCardIds as Id<"memories">[],
              }) as Promise<MemoryDoc[]>)
            : Promise.resolve([]),
          visualDiaryCardIds.length > 0
            ? (ctx.runQuery(internal.diary.listByIdsInternal, {
                userId: session._id,
                ids: visualDiaryCardIds as Id<"diaryEntries">[],
              }) as Promise<Doc<"diaryEntries">[]>)
            : Promise.resolve([]),
        ]);
        const memoryById = new Map(
          memoryDocs.map((memory) => [String(memory._id), memory] as const),
        );
        const diaryById = new Map(diaryDocs.map((entry) => [String(entry._id), entry] as const));
        cardSnapshots = visualCardRefs
          .map((ref) => {
            if (ref.table === "memories") {
              const memory = memoryById.get(ref.id);
              return memory ? toMemoryCardSnapshot(memory) : null;
            }
            const entry = diaryById.get(ref.id);
            return entry ? toDiaryCardSnapshot(entry) : null;
          })
          .filter((snapshot): snapshot is CardSnapshot => snapshot !== null);
      }
      // Reply telemetry belongs to every completed assistant message, not only
      // to replies that happen to surface memory or diary cards. The frontend
      // uses this stable user-turn ID to open the cost/operation breakdown.
      const meta: ChatMessageMeta = {
        turns: finalIteration + 1,
        flow: buildCardFlowPayload({
          chatTurnId: String(chatMessageId),
          assistantProvider: chatRoute.provider,
          turns: finalIteration + 1,
          cardCount: visualCardRefs.length,
          pathMode: state.pendingSearchIsCached ? "cached" : "fresh",
          searches: state.flowSearches,
          toolSequence: state.flowToolSequence,
          attachments: flowAttachments,
          performance: {
            totalLatencyMs: Date.now() - turnStartedAt,
            preparationLatencyMs,
            plannerLatencyMs: plannerMetrics.latencyMs,
            toolCalls: plannerMetrics.toolCalls,
            toolBatches: plannerMetrics.toolBatches,
            toolPaletteSize: chatToolDefinitions.length,
            cachedInputTokens: plannerMetrics.cachedInputTokens,
          },
        }),
        ...(cardRefs.length > 0
          ? {
              cards: cardRefs,
              ...(cardSnapshots.length > 0 ? { cardSnapshots } : {}),
              ...(visualCardRefs.length > 0 ? { isCached: state.pendingSearchIsCached } : {}),
            }
          : {}),
        ...(hasDeletionProposal ? { deletionProposal: state.pendingDeletionItems } : {}),
      };

      return { resolvedText, meta };
    };

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

      const turnState = createTurnState();
      state = turnState;
      const shouldForceRespondAfterInfoTool =
        !ACTION_INTENT_PATTERN.test(args.message) && !shouldPreferUpdatingExisting(args.message);

      if (initialGrounding.shouldGround) {
        turnState.flowSearches.push({
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
        turnState.pendingSearchIsCached = initialGrounding.isCached;
        if (initialGrounding.searchResults.length > 0) {
          turnState.surfaceCandidates = initialGrounding.searchResults.map((mem) => ({
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
        reportProgress: (status) =>
          setStreamingStatus({
            ...status,
            toolName: "planner",
            step: 3,
            totalSteps: 4,
          }),
        getRecentMemories,
        invalidateRecentMemories,
        grounding: initialGrounding,
        knowledgeDigest,
        latestReferencedMemoryIds,
        state: turnState,
      };

      let forceRespondNextIteration = false;
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
        const plannerCallStartedAt = Date.now();
        const response = await trackedChatCompletionStream(
          ctx,
          {
            userId: session._id,
            feature: "memory_chat",
            stage: "planner",
            visibility: "user_visible",
            link: analyticsLink,
            onDelta: replyStreamer.onDelta,
            onRetry: replyStreamer.reset,
            // The final answer always arrives as the `respond` tool's
            // `message` argument (see tools/respond.ts) — extract it live
            // from the streaming tool-call arguments so it still reads as
            // plain streamed text to the user.
            streamToolTextField: { toolName: "respond", argName: "message" },
            request: {
              messages: conversation,
              tools: chatToolDefinitions,
              // Forced tool call per turn: the model can no longer silently
              // skip reporting which memories it used the way a freeform-text
              // exit allowed. respond() is always one of the available
              // choices, so this never blocks a normal reply.
              // On the last allowed iteration, force respond specifically —
              // otherwise an open-ended question can make the model chain
              // info-gathering tools indefinitely and exhaust the loop
              // without ever answering (observed: analyze_memories →
              // get_diary_entries → get_stats → get_diary_entries, no reply).
              // Forced-respond iterations stay a solo call (tool_choice pins
              // the single function); other iterations allow the model to
              // batch independent info-gathering tools (e.g. search_memories
              // + get_diary_entries) into one round trip instead of one tool
              // per iteration — fewer resends of the growing conversation.
              tool_choice:
                forceRespondNextIteration || iteration === MAX_ITERATIONS - 1
                  ? { type: "function", function: { name: "respond" } }
                  : "required",
              parallel_tool_calls: !(forceRespondNextIteration || iteration === MAX_ITERATIONS - 1),
              temperature: PLANNER_TEMPERATURE,
              max_completion_tokens: MAX_COMPLETION_TOKENS,
            },
            metadata: {
              iteration: String(iteration + 1),
              toolPaletteSize: String(chatToolDefinitions.length),
            },
          },
          chatRoute,
        );
        plannerMetrics.latencyMs += Date.now() - plannerCallStartedAt;
        plannerMetrics.cachedInputTokens +=
          response.usage?.prompt_tokens_details?.cached_tokens ?? 0;

        const choice = response.choices[0]?.message;
        if (!choice?.tool_calls?.length) {
          // Only reachable if a provider without forced tool-choice support
          // is ever routed here (see chatCompletion fallback in aiDispatch).
          finalText = extractTextContent(choice?.content) || finalText;
          break;
        }
        plannerMetrics.toolCalls += choice.tool_calls.length;
        plannerMetrics.toolBatches += 1;

        conversation.push({
          role: "assistant",
          content: extractTextContent(choice.content),
          tool_calls: choice.tool_calls,
        });

        // On non-forced iterations the model can batch respond() alongside
        // info-gathering tools in one round trip (see parallel_tool_calls
        // above). If it does, respond's message was necessarily written
        // without seeing the other calls' results — answering from stale
        // context. Defer respond in that batch: run the other tools, feed
        // respond back an error telling it to answer next turn once it has
        // the fresh results in context.
        const respondBatchedWithOtherTools =
          choice.tool_calls.some(
            (tc) => tc.type === "function" && tc.function.name === "respond",
          ) &&
          choice.tool_calls.some((tc) => tc.type === "function" && tc.function.name !== "respond");

        const functionCalls = choice.tool_calls.filter(
          (toolCall): toolCall is OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall =>
            toolCall.type === "function",
        );
        const executeToolCall = async (
          toolCall: OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall,
        ) => {
          const fnName = toolCall.function.name;
          if (fnName === "respond" && respondBatchedWithOtherTools) {
            return JSON.stringify({
              error:
                "Deferred — review the other tool results, then call respond with an updated answer.",
            });
          }

          appendFlowTool(turnState, fnName);
          let fnArgs: Record<string, unknown>;
          try {
            fnArgs = JSON.parse(toolCall.function.arguments || "{}") as Record<string, unknown>;
          } catch {
            return JSON.stringify({
              error: "Malformed or truncated tool call arguments — retry with valid JSON.",
            });
          }

          const tool = CHAT_TOOLS_BY_NAME.get(fnName);
          const streamingDetail: StreamingStatus = tool
            ? tool.buildStatus(fnArgs)
            : { phase: "working", detail: `Running ${fnName}`, source: "backend" };
          if (!canRunBatchConcurrently) {
            await setStreamingStatus({
              query: streamingDetail.query,
              phase: streamingDetail.phase,
              toolName: fnName,
              detail: streamingDetail.detail,
              source: streamingDetail.source,
              events: streamingDetail.events,
              step: 3,
              totalSteps: 4,
            });
          }

          const signature = `${fnName}:${toolCall.function.arguments ?? ""}`;
          const isRepeatCall =
            fnName !== "respond" && turnState.calledToolSignatures.has(signature);
          let result: string;
          if (isRepeatCall) {
            result = JSON.stringify({
              note: "Skipped — this exact tool call already ran. Reuse its result or call respond.",
            });
          } else {
            // Claim the signature before awaiting so duplicate calls in the
            // same parallel batch cannot both reach the backend.
            if (tool) turnState.calledToolSignatures.add(signature);
            const scopedToolContext: ToolContext = {
              ...toolContext,
              reportProgress: canRunBatchConcurrently
                ? async () => {}
                : (status) =>
                    setStreamingStatus({
                      ...status,
                      toolName: fnName,
                      step: 3,
                      totalSteps: 4,
                    }),
            };
            result = tool
              ? await tool.handler(scopedToolContext, fnArgs)
              : JSON.stringify({ error: "Unknown tool" });
          }
          if (
            shouldForceRespondAfterInfoTool &&
            READ_ONLY_INFO_TOOL_NAMES.has(fnName) &&
            !turnState.respondCalled
          ) {
            forceRespondNextIteration = true;
          }
          return result;
        };

        const canRunBatchConcurrently =
          functionCalls.length > 1 &&
          functionCalls.every((toolCall) => {
            const name = toolCall.function.name;
            return name === "respond" || READ_ONLY_INFO_TOOL_NAMES.has(name);
          });
        const toolResults: string[] = [];
        if (canRunBatchConcurrently) {
          await setStreamingStatus({
            phase: "working",
            toolName: "planner",
            detail: `Running ${functionCalls.length} independent lookups`,
            source: "backend",
            step: 3,
            totalSteps: 4,
          });
          toolResults.push(...(await Promise.all(functionCalls.map(executeToolCall))));
        } else {
          for (const toolCall of functionCalls) {
            toolResults.push(await executeToolCall(toolCall));
          }
        }
        functionCalls.forEach((toolCall, index) => {
          conversation.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: toolResults[index],
          });
        });

        // respond() ends the turn — its message + used_ids are already in
        // state, no further iteration needed.
        if (turnState.respondCalled) {
          finalText = turnState.finalMessage;
          break;
        }
      }

      const outcome = await finalizeFromState(finalText);
      aiResponse = outcome.resolvedText;
      responseMeta = outcome.meta;
      await ctx.runMutation(internal.chat.clearSearchStatus, {
        userId: session._id,
      });
    } catch (error) {
      console.error("chat turn failed", {
        userId: session._id,
        chatMessageId,
        error,
      });
      await ctx.runMutation(internal.chat.clearSearchStatus, {
        userId: session._id,
      });
      // A write tool (create/update memory, reminder sync) may have already
      // committed to the DB before this failure — e.g. a network error on a
      // later planner iteration, or an unhandled edge case after the write.
      // Reporting "trouble connecting" in that case is actively wrong: the
      // change happened, and a user retry would create a duplicate. Recover
      // the write confirmation + any surfaced cards from turn state instead.
      if (state && (state.writeToolCalled || state.pendingCardIds.size > 0)) {
        try {
          const outcome = await finalizeFromState(state.finalMessage);
          aiResponse = outcome.resolvedText;
          responseMeta = outcome.meta;
        } catch (finalizeError) {
          console.error("chat turn write-recovery finalize failed", {
            userId: session._id,
            chatMessageId,
            error: finalizeError,
          });
          aiResponse = "I'm having trouble connecting right now. Please try again in a moment.";
          responseMeta = undefined;
        }
      } else {
        aiResponse = "I'm having trouble connecting right now. Please try again in a moment.";
        responseMeta = undefined;
      }
    }

    await replyStreamer.finalize({
      content: aiResponse,
      ...(responseMeta ? { meta: responseMeta } : {}),
    });

    const attachmentFailures: ChatActionResult["attachmentFailures"] = extractedChatAttachments
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
