"use node";

import { api } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import { resolveMemoryReference } from "../search";
import type { ChatTool, ToolContext } from "./toolTypes";

async function resolveTargetReminderId(
  tc: ToolContext,
  fnArgs: Record<string, unknown>,
): Promise<string> {
  const explicitMemoryId = typeof fnArgs.memory_id === "string" ? fnArgs.memory_id.trim() : "";
  const requestedQuery = typeof fnArgs.query === "string" ? fnArgs.query.trim() : "";
  let targetMemoryId = explicitMemoryId;

  if (!targetMemoryId && tc.latestReferencedMemoryIds.length > 0) {
    targetMemoryId = tc.latestReferencedMemoryIds[0];
  }
  if (!targetMemoryId) {
    // Restrict candidates to reminders — resolving against all memories
    // risks syncing/unsyncing a plain (non-reminder) memory when the
    // reference doesn't match anything. requireMatchForWrite additionally
    // stops a weak/empty reference from defaulting to "most recent".
    const reminderCandidates = (await tc.getRecentMemories()).filter(
      (memory) => memory.entryKind === "reminder",
    );
    const resolvedFallback = await resolveMemoryReference(tc.ctx, {
      token: tc.token,
      userId: tc.userId,
      reference: requestedQuery || tc.userMessage,
      recentMemories: reminderCandidates,
      requireMatchForWrite: true,
    });
    if (resolvedFallback) {
      targetMemoryId = String(resolvedFallback);
    }
  }
  return targetMemoryId;
}

export const syncReminderTool: ChatTool = {
  name: "sync_reminder",
  label: "Sync reminder",
  definition: {
    type: "function",
    function: {
      name: "sync_reminder",
      description: "Manually trigger or retry Google Calendar sync for an existing reminder.",
      parameters: {
        type: "object",
        properties: {
          memory_id: {
            type: "string",
            description: "Reminder memory ID if already known.",
          },
          query: {
            type: "string",
            description: "Reminder reference text to resolve the target when memory ID is unknown.",
          },
        },
        additionalProperties: false,
      },
    },
  },
  buildStatus: () => ({
    phase: "writing",
    detail: "Triggering Google Calendar sync for a reminder",
    source: "integrations",
    events: [{ label: "Operation", value: "manual reminder sync" }],
  }),
  handler: async (tc, fnArgs) => {
    try {
      const targetMemoryId = await resolveTargetReminderId(tc, fnArgs);
      if (!targetMemoryId) {
        throw new Error("Couldn't determine which reminder to sync. Please specify the reminder.");
      }

      const syncResult = await tc.ctx.runMutation(api.integrations.triggerReminderSync, {
        token: tc.token,
        memoryId: targetMemoryId as Id<"memories">,
      });
      tc.state.pendingCardIds.add(targetMemoryId);

      await tc.reportProgress({
        phase: "writing",
        detail: syncResult.queued
          ? syncResult.reason === "in_flight"
            ? "Reminder sync is already in progress"
            : "Triggered Google Calendar sync for reminder"
          : "Google Calendar sync was not triggered",
        source: "integrations",
        events: [
          { label: "Operation", value: "manual reminder sync" },
          { label: "Target", value: targetMemoryId },
          ...(typeof syncResult.reason === "string"
            ? [{ label: "Result", value: syncResult.reason }]
            : []),
        ],
      });
      if (syncResult.queued) {
        tc.state.writeToolCalled = true;
        tc.state.writeFallbackMessage = syncResult.message;
      }
      return JSON.stringify({
        success: !!syncResult.queued,
        memory_id: targetMemoryId,
        ...syncResult,
      });
    } catch (error) {
      return JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to trigger reminder sync",
      });
    }
  },
};

export const removeReminderSyncTool: ChatTool = {
  name: "remove_reminder_sync",
  label: "Remove sync",
  definition: {
    type: "function",
    function: {
      name: "remove_reminder_sync",
      description:
        "Remove Google Calendar sync for an existing reminder. This deletes linked Google Calendar event data and clears local sync metadata.",
      parameters: {
        type: "object",
        properties: {
          memory_id: {
            type: "string",
            description: "Reminder memory ID if already known.",
          },
          query: {
            type: "string",
            description: "Reminder reference text to resolve the target when memory ID is unknown.",
          },
        },
        additionalProperties: false,
      },
    },
  },
  buildStatus: () => ({
    phase: "writing",
    detail: "Removing Google Calendar sync for a reminder",
    source: "integrations",
    events: [{ label: "Operation", value: "remove reminder sync" }],
  }),
  handler: async (tc, fnArgs) => {
    try {
      const targetMemoryId = await resolveTargetReminderId(tc, fnArgs);
      if (!targetMemoryId) {
        throw new Error(
          "Couldn't determine which reminder to unsync. Please specify the reminder.",
        );
      }

      const unsyncResult = await tc.ctx.runMutation(api.integrations.removeReminderSync, {
        token: tc.token,
        memoryId: targetMemoryId as Id<"memories">,
      });
      tc.state.pendingCardIds.add(targetMemoryId);

      await tc.reportProgress({
        phase: "writing",
        detail: unsyncResult.removed
          ? "Removed Google Calendar sync for reminder"
          : "Google Calendar sync removal did not apply",
        source: "integrations",
        events: [
          { label: "Operation", value: "remove reminder sync" },
          { label: "Target", value: targetMemoryId },
          { label: "Result", value: unsyncResult.reason },
        ],
      });
      if (unsyncResult.removed) {
        tc.state.writeToolCalled = true;
        tc.state.writeFallbackMessage = unsyncResult.message;
      }
      return JSON.stringify({
        success: !!unsyncResult.removed,
        memory_id: targetMemoryId,
        ...unsyncResult,
      });
    } catch (error) {
      return JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to remove reminder sync",
      });
    }
  },
};
