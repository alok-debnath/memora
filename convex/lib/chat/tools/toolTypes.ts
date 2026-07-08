import type OpenAI from "openai";
import type { Id } from "../../../_generated/dataModel";
import type { ActionCtx } from "../../../_generated/server";
import type { TurnState } from "../turnState";
import type { GroundingContext, KnowledgeDigest, MemoryDoc, StreamingStatus } from "../types";

/** Everything a tool handler can touch. Passed per turn; handlers stay stateless. */
export type ToolContext = {
  ctx: ActionCtx;
  token: string;
  userId: Id<"users">;
  /** Raw user message for this turn. */
  userMessage: string;
  currentTime?: string;
  effectiveTimezone: string;
  chatMessageId: Id<"chatMessages">;
  hasDirectAttachments: boolean;
  setStreamingStatus: (status: StreamingStatus) => Promise<void>;
  /**
   * Report mid-execution progress for the tool currently running — fills in
   * `toolName`/`step`/`totalSteps` (turn-loop constants the dispatch loop
   * already knows) so tool handlers only supply their own status fields.
   */
  reportProgress: (
    status: Omit<StreamingStatus, "toolName" | "step" | "totalSteps">,
  ) => Promise<void>;
  /** Lazily-fetched recent memories, shared across tools within the turn. */
  getRecentMemories: () => Promise<MemoryDoc[]>;
  /** Invalidate the recent-memories cache after a write. */
  invalidateRecentMemories: () => void;
  grounding: GroundingContext;
  /** Per-turn knowledge digest (exact aggregate counts); fetched once per turn. */
  knowledgeDigest: KnowledgeDigest | null;
  /** Memory IDs referenced by the previous assistant turn (pronoun resolution). */
  latestReferencedMemoryIds: string[];
  state: TurnState;
};

/**
 * One chat tool = one module. The registry (tools/index.ts) assembles the
 * OpenAI tool list, status labels, and dispatch from these objects, so
 * adding a tool is a single new file plus a registry entry.
 */
export type ChatTool = {
  name: string;
  /** Short human label shown in flow steps and progress UI. */
  label: string;
  definition: OpenAI.Chat.Completions.ChatCompletionTool;
  /** Streaming status shown while the tool runs (before the handler resolves). */
  buildStatus: (fnArgs: Record<string, unknown>) => StreamingStatus;
  /** Returns the JSON string pushed back to the model as the tool result. */
  handler: (tc: ToolContext, fnArgs: Record<string, unknown>) => Promise<string>;
  /**
   * "read" marks a pure info-gathering tool (no writes, no card-selection
   * side effects beyond surfacing candidates). The agent loop
   * (memoryChat.ts) uses this to force `respond` after a single read tool
   * on non-action turns, so open-ended questions can't chain info tools
   * indefinitely without ever answering. Omit for tools with write/side
   * effects (create/update/delete/sync, manage_topics, respond itself).
   */
  kind?: "read";
};
