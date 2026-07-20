"use node";

import { truncateStatusText } from "../projections";
import { searchMemories } from "../search";
import type { ChatTool } from "./toolTypes";

/**
 * Listing deleted memories and restoring one are now generic primitives
 * (list_docs(memories, {status:"deleted"}) / update_doc(memories, id,
 * {status:"active"})) — see lib/aiPrimitives/tableRegistry.ts. This stays a
 * dedicated tool because it's a deliberate confirm-before-destroy UX (search
 * → surface → user confirms in the app UI), not a delete — a generic
 * delete_doc would either have to reimplement that gate or bypass it, and
 * delete_doc explicitly refuses the memories table for this reason.
 */
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
