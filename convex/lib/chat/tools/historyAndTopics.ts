"use node";

import { api, internal } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import { HISTORY_TOOL_LIMIT_DEFAULT, HISTORY_TOOL_LIMIT_MAX } from "../budgets";
import { resolveMemoryReference } from "../search";
import type { ChatTool } from "./toolTypes";

export const historyTool: ChatTool = {
  name: "history",
  label: "Load history",
  definition: {
    type: "function",
    function: {
      name: "history",
      description: "Version control for memories. Actions: list, undo, or restore.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["list", "undo", "restore"] },
          memory_id: { type: "string" },
          history_id: { type: "string" },
          limit: { type: "number" },
        },
        required: ["action"],
        additionalProperties: false,
      },
    },
  },
  buildStatus: () => ({
    phase: "loading",
    detail: "Loading edit history",
    source: "memory_history",
    events: [{ label: "Scope", value: "snapshots and undo" }],
  }),
  handler: async (tc, fnArgs) => {
    let result = JSON.stringify({ error: "Unknown history action" });
    if (fnArgs.action === "list") {
      const history = await tc.ctx.runQuery(api.history.listSnapshots, {
        token: tc.token,
        ...(typeof fnArgs.memory_id === "string"
          ? { memoryId: fnArgs.memory_id as Id<"memories"> }
          : {}),
        ...(typeof fnArgs.limit === "number"
          ? { limit: Math.min(fnArgs.limit, HISTORY_TOOL_LIMIT_MAX) }
          : { limit: HISTORY_TOOL_LIMIT_DEFAULT }),
      });
      await tc.setStreamingStatus({
        phase: "loading",
        toolName: "history",
        detail: `Loaded ${history.length} history snapshot${history.length === 1 ? "" : "s"}`,
        source: "memory_history",
        resultCount: history.length,
        events: [
          { label: "Action", value: "list" },
          {
            label: "Scope",
            value: typeof fnArgs.memory_id === "string" ? "single memory" : "recent changes",
          },
        ],
        step: 3,
        totalSteps: 4,
      });
      result = JSON.stringify({
        history,
      });
    } else if (fnArgs.action === "undo") {
      const undoResult = await tc.ctx.runMutation(api.history.undo, {
        token: tc.token,
        ...(typeof fnArgs.memory_id === "string"
          ? { memoryId: fnArgs.memory_id as Id<"memories"> }
          : {}),
      });
      result = JSON.stringify(undoResult);
      tc.invalidateRecentMemories();
      await tc.setStreamingStatus({
        phase: "writing",
        toolName: "history",
        detail: "Reverted the latest edit",
        source: "memory_history",
        events: [
          { label: "Action", value: "undo" },
          {
            label: "Target",
            value: typeof fnArgs.memory_id === "string" ? fnArgs.memory_id : "latest edited memory",
          },
        ],
        step: 3,
        totalSteps: 4,
      });
      if (undoResult && typeof (undoResult as any).memoryId === "string") {
        tc.state.pendingCardIds.add(String((undoResult as any).memoryId));
      } else if (typeof fnArgs.memory_id === "string") {
        tc.state.pendingCardIds.add(fnArgs.memory_id);
      }
    } else if (fnArgs.action === "restore") {
      const restoreResult = await tc.ctx.runMutation(api.history.restore, {
        token: tc.token,
        historyId: fnArgs.history_id as Id<"memoryHistory">,
      });
      result = JSON.stringify(restoreResult);
      tc.invalidateRecentMemories();
      await tc.setStreamingStatus({
        phase: "writing",
        toolName: "history",
        detail: "Restored a historical snapshot",
        source: "memory_history",
        events: [
          { label: "Action", value: "restore" },
          { label: "History ID", value: String(fnArgs.history_id) },
        ],
        step: 3,
        totalSteps: 4,
      });
      if (restoreResult && typeof (restoreResult as any).memoryId === "string") {
        tc.state.pendingCardIds.add(String((restoreResult as any).memoryId));
      }
    }
    return result;
  },
};

export const manageTopicsTool: ChatTool = {
  name: "manage_topics",
  label: "Update topics",
  definition: {
    type: "function",
    function: {
      name: "manage_topics",
      description:
        "Manage the AI-generated topic taxonomy. List topics, rename, merge, recolor, retag a specific memory to a requested topic, or trigger a full re-analysis.",
      parameters: {
        type: "object",
        properties: {
          operation: {
            type: "string",
            enum: ["list", "rename", "merge", "recolor", "trigger_reanalysis", "retag_memory"],
          },
          topic_slug: {
            type: "string",
            description: "Slug of the topic to operate on.",
          },
          target_slug: {
            type: "string",
            description: "For merge: the slug of the topic to merge into topic_slug.",
          },
          new_name: {
            type: "string",
            description: "For rename: the new display name.",
          },
          new_icon: {
            type: "string",
            description: "For recolor: Feather icon name.",
          },
          new_color: {
            type: "string",
            description: "For recolor: hex color string.",
          },
          memory_id: {
            type: "string",
            description:
              "For retag_memory: actual memory id if already known. If not known, search memories first or refer to the most recent matching memory.",
          },
          topic_name: {
            type: "string",
            description: "For retag_memory: requested topic name to reuse or create.",
          },
        },
        required: ["operation"],
        additionalProperties: false,
      },
    },
  },
  buildStatus: (fnArgs) => ({
    phase: "writing",
    detail: "Updating topic organization",
    source: "topics",
    events: [
      {
        label: "Operation",
        value: String(fnArgs.operation || "update"),
      },
    ],
  }),
  handler: async (tc, fnArgs) => {
    if (fnArgs.operation === "retag_memory") {
      const resolvedMemoryId = await resolveMemoryReference(tc.ctx, {
        token: tc.token,
        userId: tc.userId,
        reference: typeof fnArgs.memory_id === "string" ? fnArgs.memory_id : undefined,
        recentMemories: await tc.getRecentMemories(),
      });

      if (!resolvedMemoryId) {
        return JSON.stringify({
          success: false,
          message: "Couldn't identify which memory to retag.",
        });
      }

      const result = JSON.stringify(
        await tc.ctx.runAction(internal.actions.manageTopics.handleManageTopic, {
          userId: tc.userId,
          operation: "retag_memory",
          memoryId: resolvedMemoryId,
          topicName: typeof fnArgs.topic_name === "string" ? fnArgs.topic_name : undefined,
        }),
      );
      tc.state.pendingCardIds.add(String(resolvedMemoryId));
      await tc.setStreamingStatus({
        phase: "writing",
        toolName: "manage_topics",
        detail: "Retagged the selected memory",
        source: "topics",
        events: [
          { label: "Operation", value: "retag_memory" },
          {
            label: "Topic",
            value: typeof fnArgs.topic_name === "string" ? fnArgs.topic_name : "selected topic",
          },
        ],
        step: 3,
        totalSteps: 4,
      });
      return result;
    }

    const result = JSON.stringify(
      await tc.ctx.runAction(internal.actions.manageTopics.handleManageTopic, {
        userId: tc.userId,
        operation: fnArgs.operation as
          "list" | "rename" | "merge" | "recolor" | "trigger_reanalysis" | "retag_memory",
        topicSlug: typeof fnArgs.topic_slug === "string" ? fnArgs.topic_slug : undefined,
        targetSlug: typeof fnArgs.target_slug === "string" ? fnArgs.target_slug : undefined,
        newName: typeof fnArgs.new_name === "string" ? fnArgs.new_name : undefined,
        newIcon: typeof fnArgs.new_icon === "string" ? fnArgs.new_icon : undefined,
        newColor: typeof fnArgs.new_color === "string" ? fnArgs.new_color : undefined,
        memoryId:
          typeof fnArgs.memory_id === "string" ? (fnArgs.memory_id as Id<"memories">) : undefined,
        topicName: typeof fnArgs.topic_name === "string" ? fnArgs.topic_name : undefined,
      }),
    );
    await tc.setStreamingStatus({
      phase: fnArgs.operation === "list" ? "loading" : "writing",
      toolName: "manage_topics",
      detail:
        fnArgs.operation === "list"
          ? "Loaded topic organization"
          : `Completed topic operation: ${String(fnArgs.operation || "update")}`,
      source: "topics",
      events: [
        {
          label: "Operation",
          value: String(fnArgs.operation || "update"),
        },
      ],
      step: 3,
      totalSteps: 4,
    });
    return result;
  },
};
