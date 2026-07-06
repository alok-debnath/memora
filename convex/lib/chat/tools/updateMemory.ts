"use node";

import { api, internal } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import { toStoredMemoryFields } from "../../memoryKind";
import { getReminderTitleWithoutSchedule } from "../../reminderTitle";
import { hasExplicitSchedulingFields, normalizeAiMemoryWriteFields } from "../memoryWrite";
import { truncateStatusText } from "../projections";
import { resolveMemoryReference } from "../search";
import type { ChatTool } from "./toolTypes";

export const updateMemoryTool: ChatTool = {
  name: "update_memory",
  label: "Update memory",
  definition: {
    type: "function",
    function: {
      name: "update_memory",
      description:
        "Update an existing memory. Search first to identify the right memory, then update it.",
      parameters: {
        type: "object",
        properties: {
          memory_id: { type: "string" },
          title: {
            type: "string",
            description:
              "Concise title, max 8 words, objective note-style (no 'I', 'me', 'my'). For reminders, keep title topic-only and never include date/time.",
          },
          content: {
            type: "string",
            description:
              "Full memory content in objective note-style language (no 'I', 'me', 'my')",
          },
          entry_kind: {
            type: "string",
            enum: ["memory", "reminder"],
            description: "REQUIRED when using schedule.due_at — must be 'reminder'.",
          },
          schedule: {
            type: "object",
            properties: {
              due_at: {
                type: "string",
                description: "ISO 8601 UTC. ALWAYS pair with entry_kind='reminder'.",
              },
              is_recurring: { type: "boolean" },
              recurrence_type: {
                type: "string",
                enum: ["yearly", "monthly", "weekly", "daily"],
              },
            },
            additionalProperties: false,
          },
          people: { type: "array", items: { type: "string" } },
          locations: { type: "array", items: { type: "string" } },
        },
        required: ["memory_id"],
        additionalProperties: false,
      },
    },
  },
  buildStatus: () => ({
    phase: "writing",
    detail: "Updating an existing memory or reminder",
    source: "memories",
    events: [{ label: "Operation", value: "update" }],
  }),
  handler: async (tc, fnArgs) => {
    try {
      const normalized = normalizeAiMemoryWriteFields(fnArgs);
      const normalizedTitle =
        normalized.entryKind === "reminder" && normalized.schedule?.dueAt
          ? getReminderTitleWithoutSchedule(
              normalized.title || (typeof fnArgs.title === "string" ? fnArgs.title : undefined),
              normalized.content || (typeof fnArgs.content === "string" ? fnArgs.content : ""),
            )
          : normalized.title;
      const normalizedForWrite = {
        ...normalized,
        title: normalizedTitle,
      };
      const schedulingFields = hasExplicitSchedulingFields(fnArgs)
        ? toStoredMemoryFields(normalizedForWrite)
        : {};
      const explicitMemoryId = typeof fnArgs.memory_id === "string" ? fnArgs.memory_id.trim() : "";
      let targetMemoryId = explicitMemoryId;
      if (!targetMemoryId && tc.latestReferencedMemoryIds.length > 0) {
        targetMemoryId = tc.latestReferencedMemoryIds[0];
      }
      if (!targetMemoryId) {
        const resolvedFallback = await resolveMemoryReference(tc.ctx, {
          token: tc.token,
          userId: tc.userId,
          reference: tc.userMessage,
          recentMemories: await tc.getRecentMemories(),
        });
        if (resolvedFallback) {
          targetMemoryId = String(resolvedFallback);
        }
      }
      if (!targetMemoryId) {
        throw new Error(
          "Couldn't determine which memory to update. Please specify the memory or reminder.",
        );
      }
      await tc.ctx.runMutation(api.memories.update, {
        token: tc.token,
        id: targetMemoryId as Id<"memories">,
        sourceChatTurnId: tc.chatMessageId,
        ...(normalizedForWrite.title ? { title: normalizedForWrite.title } : {}),
        ...(normalizedForWrite.content ? { content: normalizedForWrite.content } : {}),
        ...(normalizedForWrite.people ? { people: normalizedForWrite.people } : {}),
        ...(normalizedForWrite.locations ? { locations: normalizedForWrite.locations } : {}),
        ...(normalizedForWrite.contextTags ? { contextTags: normalizedForWrite.contextTags } : {}),
        ...schedulingFields,
      });
      tc.invalidateRecentMemories();
      tc.state.pendingCardIds.add(targetMemoryId);
      if (tc.hasDirectAttachments) {
        await tc.ctx.runMutation(internal.attachments.linkChatAttachmentsToMemory, {
          chatMessageId: tc.chatMessageId,
          memoryId: targetMemoryId as Id<"memories">,
        });
      }
      await tc.setStreamingStatus({
        phase: "writing",
        toolName: "update_memory",
        detail: "Updated the selected memory",
        source: "memories",
        previewItems: [
          truncateStatusText(
            normalizedForWrite.title ||
              (typeof fnArgs.content === "string" ? fnArgs.content : undefined) ||
              "Updated memory",
          ),
        ],
        events: [
          { label: "Operation", value: "update committed" },
          { label: "Target", value: targetMemoryId },
          ...(explicitMemoryId
            ? []
            : [
                {
                  label: "Resolution",
                  value: "resolved from chat context",
                },
              ]),
        ],
        step: 3,
        totalSteps: 4,
      });
      tc.state.writeToolCalled = true;
      return JSON.stringify({
        success: true,
        memory_id: targetMemoryId,
      });
    } catch (error) {
      return JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to update memory",
      });
    }
  },
};
