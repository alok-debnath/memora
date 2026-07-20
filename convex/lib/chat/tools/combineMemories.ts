"use node";

import { api } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import { truncateStatusText } from "../projections";
import type { ChatTool } from "./toolTypes";

export const combineMemoriesTool: ChatTool = {
  name: "combine_memories",
  label: "Combine memories",
  definition: {
    type: "function",
    function: {
      name: "combine_memories",
      description:
        "Merge two or more existing memories into a single memory. Use when the user asks to combine, merge, or consolidate memories. Pick the most central memory as primary_id — the others are merged into it and retired (soft-deleted, recoverable like any deleted memory). Write a coherent merged title and content yourself, incorporating the important details from every source — do not just reuse one source's content verbatim. Structural fields (people, locations, tags, links, importance, reminder scheduling) are merged automatically.",
      parameters: {
        type: "object",
        properties: {
          primary_id: {
            type: "string",
            description: "ID of the memory that survives and receives the merged content.",
          },
          merge_ids: {
            type: "array",
            items: { type: "string" },
            description: "IDs of the other memories to merge into primary_id and retire.",
          },
          title: {
            type: "string",
            description: "Merged title, objective note-style (no 'I', 'me', 'my').",
          },
          content: {
            type: "string",
            description: "Merged content combining the important details from all sources.",
          },
        },
        required: ["primary_id", "merge_ids", "title", "content"],
        additionalProperties: false,
      },
    },
  },
  buildStatus: () => ({
    phase: "writing",
    detail: "Combining memories into one",
    source: "memories",
    events: [{ label: "Operation", value: "combine" }],
  }),
  handler: async (tc, fnArgs) => {
    try {
      const primaryId = String(fnArgs.primary_id ?? "");
      const mergeIds = Array.isArray(fnArgs.merge_ids)
        ? (fnArgs.merge_ids as unknown[]).filter((id): id is string => typeof id === "string")
        : [];
      if (!primaryId || mergeIds.length === 0) {
        throw new Error("combine_memories requires primary_id and at least one merge_ids entry.");
      }
      const result = await tc.ctx.runMutation(api.memories.combineMemories, {
        token: tc.token,
        primaryId: primaryId as Id<"memories">,
        mergeIds: mergeIds as Id<"memories">[],
        title: typeof fnArgs.title === "string" ? fnArgs.title : undefined,
        content: typeof fnArgs.content === "string" ? fnArgs.content : undefined,
      });
      tc.invalidateRecentMemories();
      // Only the survivor is offered as a card — merged-away ids are never
      // added, and any stale reference to them elsewhere in this turn is
      // dropped by validateCardIds since they're now status: "deleted".
      tc.state.pendingCardIds.add(String(result.memory.id));
      tc.state.writeToolCalled = true;
      await tc.reportProgress({
        phase: "writing",
        detail: `Merged ${result.mergedCount + 1} memories into one`,
        source: "memories",
        previewItems: [truncateStatusText(result.memory.title ?? "Combined memory")],
        events: [
          { label: "Operation", value: "combine" },
          { label: "Target", value: String(result.memory.id) },
        ],
      });
      return JSON.stringify(result);
    } catch (error) {
      return JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to combine memories",
      });
    }
  },
};
