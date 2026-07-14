"use node";

import { api } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import { LIST_LIMIT_DEFAULT, LIST_LIMIT_MAX } from "../budgets";
import { toMemorySummary, toPreviewItems, truncateStatusText } from "../projections";
import { searchMemories } from "../search";
import type { MemoryDoc } from "../types";
import type { ChatTool } from "./toolTypes";

export const proposeDeletionTool: ChatTool = {
  name: "propose_deletion",
  label: "Find delete matches",
  definition: {
    type: "function",
    function: {
      name: "propose_deletion",
      description:
        "Search for memories or reminders to delete and surface them to the user for confirmation. You do NOT delete directly — the user will review and confirm in the app UI. Use this whenever the user asks to delete one or more items.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query to find the matching items.",
          },
          entry_kind: {
            type: "string",
            enum: ["memory", "reminder", "any"],
            description: "Filter by item type. Default: any.",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  buildStatus: () => ({
    phase: "searching",
    detail: "Finding items to delete for confirmation",
    source: "memories",
    events: [{ label: "Operation", value: "find matches only" }],
  }),
  handler: async (tc, fnArgs) => {
    const entryKind = typeof fnArgs.entry_kind === "string" ? fnArgs.entry_kind : "any";
    const deletionQuery = String(fnArgs.query || "");
    const searchResult =
      tc.grounding.shouldGround &&
      deletionQuery.trim().toLowerCase() === tc.userMessage.trim().toLowerCase()
        ? {
            results: tc.grounding.searchResults,
            count: tc.grounding.searchCount,
          }
        : await searchMemories(tc.ctx, {
            query: deletionQuery,
            userId: tc.userId,
            getRecentMemories: tc.getRecentMemories,
            chatTurnId: tc.chatMessageId,
          });

    let matchedItems = searchResult.results;
    if (entryKind === "reminder") {
      matchedItems = matchedItems.filter((m: any) => m.entry_kind === "reminder");
    } else if (entryKind === "memory") {
      matchedItems = matchedItems.filter((m: any) => m.entry_kind !== "reminder");
    }

    const newItems = matchedItems.map((m: any) => ({
      id: String(m.id),
      title: String(m.title || "Untitled"),
      content: String(m.content || ""),
      entry_kind: String(m.entry_kind || "memory"),
    }));
    // Accumulate across multiple propose_deletion calls (e.g. one for memories, one for reminders)
    const existingIds = new Set(tc.state.pendingDeletionItems.map((i) => i.id));
    tc.state.pendingDeletionItems = [
      ...tc.state.pendingDeletionItems,
      ...newItems.filter((i) => !existingIds.has(i.id)),
    ];
    const pendingCount = tc.state.pendingDeletionItems.length;
    await tc.reportProgress({
      query: typeof fnArgs.query === "string" ? fnArgs.query : undefined,
      phase: "searching",
      detail:
        pendingCount > 0
          ? `Prepared ${pendingCount} item${pendingCount === 1 ? "" : "s"} for delete confirmation`
          : "No matching items found for deletion",
      source: "memories",
      resultCount: pendingCount,
      previewItems: tc.state.pendingDeletionItems
        .slice(0, 3)
        .map((item) => truncateStatusText(item.title || item.content || "Stored memory")),
      events: [
        { label: "Mode", value: "proposal only" },
        { label: "Filter", value: entryKind },
      ],
    });

    return JSON.stringify(
      pendingCount > 0
        ? {
            found: pendingCount,
            message: `Found ${pendingCount} item(s). They are being shown to the user for confirmation. Do NOT delete them yourself — wait for the user to confirm in the app.`,
          }
        : { found: 0, message: "No matching items found." },
    );
  },
};

export const listDeletedMemoriesTool: ChatTool = {
  name: "list_deleted_memories",
  label: "Load deleted",
  definition: {
    type: "function",
    function: {
      name: "list_deleted_memories",
      description:
        "List memories that have been soft-deleted (moved to trash). Use when the user asks to see deleted memories or wants to restore something.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Max items to return (default 20)",
          },
        },
        additionalProperties: false,
      },
    },
  },
  buildStatus: () => ({
    phase: "loading",
    detail: "Loading deleted memories",
    source: "memories",
    events: [{ label: "Status", value: "deleted" }],
  }),
  handler: async (tc, fnArgs) => {
    try {
      const limit =
        typeof fnArgs.limit === "number"
          ? Math.min(fnArgs.limit, LIST_LIMIT_MAX)
          : LIST_LIMIT_DEFAULT;
      const deleted = await tc.ctx.runQuery(api.memories.listDeleted, {
        token: tc.token,
        limit,
      });
      await tc.reportProgress({
        phase: "loading",
        detail: `Loaded ${deleted.length} deleted ${deleted.length === 1 ? "memory" : "memories"}`,
        source: "memories",
        resultCount: deleted.length,
        previewItems: toPreviewItems(deleted, "Deleted memory"),
        events: [
          { label: "Status", value: "deleted" },
          { label: "Limit", value: `${limit}` },
        ],
      });
      return JSON.stringify({
        deleted_memories: deleted.map((memory: MemoryDoc) => ({
          ...toMemorySummary(memory),
          deletedAt: memory.deletedAt ? new Date(memory.deletedAt).toISOString() : null,
        })),
        count: deleted.length,
      });
    } catch (error) {
      return JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to list deleted memories",
      });
    }
  },
};

export const restoreMemoryTool: ChatTool = {
  name: "restore_memory",
  label: "Restore memory",
  definition: {
    type: "function",
    function: {
      name: "restore_memory",
      description: "Restore a soft-deleted memory, bringing it back from the trash.",
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
  buildStatus: () => ({
    phase: "writing",
    detail: "Restoring a deleted memory",
    source: "memories",
    events: [{ label: "Operation", value: "restore" }],
  }),
  handler: async (tc, fnArgs) => {
    try {
      await tc.ctx.runMutation(api.memories.restore, {
        token: tc.token,
        id: fnArgs.memory_id as Id<"memories">,
      });
      tc.invalidateRecentMemories();
      tc.state.pendingCardIds.add(String(fnArgs.memory_id as string));
      await tc.reportProgress({
        phase: "writing",
        detail: "Restored the deleted memory",
        source: "memories",
        events: [
          { label: "Operation", value: "restore" },
          { label: "Target", value: String(fnArgs.memory_id) },
        ],
      });
      return JSON.stringify({ success: true });
    } catch (error) {
      return JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to restore memory",
      });
    }
  },
};
