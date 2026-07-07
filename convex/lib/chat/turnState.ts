import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import type { CardFlowSearch } from "./flow";
import type { DeletionItem } from "./types";

/**
 * Mutable per-turn state shared by the agent loop and tool handlers.
 * One object instead of a dozen closure variables so tool handlers can
 * live in separate modules.
 */
export type TurnState = {
  pendingCardIds: Set<string>;
  pendingDeletionItems: DeletionItem[];
  /** Candidate memory ID+title pairs from grounding/search/list — flow/context bookkeeping only. */
  surfaceCandidates: Array<{ id: string; title: string }>;
  flowSearches: CardFlowSearch[];
  flowToolSequence: string[];
  pendingSearchIsCached: boolean;
  /** True once the terminal `respond` tool call has run this turn. */
  respondCalled: boolean;
  /** The `message` argument from the `respond` call — the final answer text. */
  finalMessage: string;
  /** True once update_memory or create_memory (or another write) actually executes. */
  writeToolCalled: boolean;
  writeFallbackMessage: string | null;
  createdMemoriesByDedupeKey: Map<string, { id: Id<"memories">; title: string }>;
};

export function createTurnState(): TurnState {
  return {
    pendingCardIds: new Set(),
    pendingDeletionItems: [],
    surfaceCandidates: [],
    flowSearches: [],
    flowToolSequence: [],
    pendingSearchIsCached: false,
    respondCalled: false,
    finalMessage: "",
    writeToolCalled: false,
    writeFallbackMessage: null,
    createdMemoriesByDedupeKey: new Map(),
  };
}

export function appendFlowTool(state: TurnState, toolName: string) {
  if (state.flowToolSequence[state.flowToolSequence.length - 1] !== toolName) {
    state.flowToolSequence.push(toolName);
  }
}

/**
 * Single validation gate for card IDs: everything the model emitted (the
 * `respond` tool's used_ids, plus any write-tool side effects) is checked
 * against the DB once and split by table. Only the user's active memories
 * and own diary entries survive — hallucinated IDs and deleted items drop.
 */
export async function validateCardIds(
  ctx: ActionCtx,
  userId: Id<"users">,
  state: TurnState,
): Promise<{ memoryIds: string[]; diaryIds: string[] }> {
  if (state.pendingCardIds.size === 0) {
    return { memoryIds: [], diaryIds: [] };
  }
  const allIds = Array.from(state.pendingCardIds);
  const [validMemoryIds, validDiaryIds] = await Promise.all([
    ctx.runQuery(internal.memories.filterValidCardIds, {
      userId,
      ids: allIds,
    }) as Promise<string[]>,
    ctx.runQuery(internal.diary.filterValidCardIds, {
      userId,
      ids: allIds,
    }) as Promise<string[]>,
  ]);
  state.pendingCardIds.clear();
  for (const id of validMemoryIds) {
    state.pendingCardIds.add(id);
  }
  return { memoryIds: validMemoryIds, diaryIds: validDiaryIds };
}
