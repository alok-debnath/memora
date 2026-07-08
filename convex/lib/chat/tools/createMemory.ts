"use node";

import { api, internal } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import { toStoredMemoryFields } from "../../memoryKind";
import { getReminderTitleWithoutSchedule } from "../../reminderTitle";
import { isReferentialUpdate, shouldPreferUpdatingExisting } from "../heuristics";
import {
  buildCreateMemoryDedupeKey,
  hasExplicitSchedulingFields,
  normalizeAiMemoryWriteFields,
} from "../memoryWrite";
import { toPreviewItems, truncateStatusText, type MemorySummary } from "../projections";
import { searchMemories } from "../search";
import type { ChatTool, ToolContext } from "./toolTypes";

async function linkAttachments(tc: ToolContext, memoryId: Id<"memories">) {
  if (tc.hasDirectAttachments) {
    await tc.ctx.runMutation(internal.attachments.linkChatAttachmentsToMemory, {
      chatMessageId: tc.chatMessageId,
      memoryId,
    });
  }
}

export const createMemoryTool: ChatTool = {
  name: "create_memory",
  label: "Create memory",
  definition: {
    type: "function",
    function: {
      name: "create_memory",
      description:
        "Create a new memory note for the user. Use when they ask to remember something or casually share a durable fact.",
      parameters: {
        type: "object",
        properties: {
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
            description:
              "REQUIRED when using schedule.due_at — must be 'reminder'. Default to 'memory' otherwise.",
          },
          schedule: {
            type: "object",
            properties: {
              due_at: {
                type: "string",
                description:
                  "Exact ISO 8601 UTC datetime. ALWAYS pair with entry_kind='reminder' when set.",
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
        required: ["content"],
        additionalProperties: false,
      },
    },
  },
  buildStatus: () => ({
    phase: "writing",
    detail: "Saving a new memory",
    source: "memories",
    events: [{ label: "Operation", value: "insert" }],
  }),
  handler: async (tc, fnArgs) => {
    const shouldForceUpdate = shouldPreferUpdatingExisting(tc.userMessage);
    const referentialUpdate = isReferentialUpdate(tc.userMessage);
    let forcedUpdateTargetId: string | undefined;
    let forcedUpdateTargetLabel: string | undefined;
    let existingMatchesCount = 0;
    let existingMatchesPreview: MemorySummary[] = [];

    if (shouldForceUpdate) {
      const existingMatches =
        tc.grounding.shouldPreferUpdate && tc.grounding.shouldGround
          ? {
              results: tc.grounding.searchResults,
              count: tc.grounding.searchCount,
            }
          : await searchMemories(tc.ctx, {
              token: tc.token,
              query: tc.userMessage,
              userId: tc.userId,
              recentMemories: await tc.getRecentMemories(),
            });
      existingMatchesCount = existingMatches.count;
      existingMatchesPreview = existingMatches.results;

      const bestSearchMatch = existingMatches.results[0];
      const latestReferencedId = tc.latestReferencedMemoryIds[0];

      if (referentialUpdate && latestReferencedId) {
        forcedUpdateTargetId = latestReferencedId;
        forcedUpdateTargetLabel = "recently referenced memory";
      } else if (bestSearchMatch?.id) {
        forcedUpdateTargetId = String(bestSearchMatch.id);
        forcedUpdateTargetLabel = bestSearchMatch.title ?? "matched memory";
      } else if (latestReferencedId) {
        forcedUpdateTargetId = latestReferencedId;
        forcedUpdateTargetLabel = "recently referenced memory";
      }
    }

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
    const contentToSave =
      normalizedForWrite.content ||
      (typeof fnArgs.content === "string" ? fnArgs.content.trim() : "") ||
      (typeof fnArgs.title === "string" ? fnArgs.title.trim() : "");
    const dedupeKey = buildCreateMemoryDedupeKey({
      title:
        normalizedForWrite.title || (typeof fnArgs.title === "string" ? fnArgs.title : undefined),
      content: contentToSave,
    });
    const existingCreated = tc.state.createdMemoriesByDedupeKey.get(dedupeKey);
    const schedulingFields = hasExplicitSchedulingFields(fnArgs)
      ? toStoredMemoryFields(normalizedForWrite)
      : {};
    const memoryUpdatePatch = {
      ...(normalizedForWrite.title ? { title: normalizedForWrite.title } : {}),
      ...(normalizedForWrite.people ? { people: normalizedForWrite.people } : {}),
      ...(normalizedForWrite.locations ? { locations: normalizedForWrite.locations } : {}),
      ...(normalizedForWrite.contextTags ? { contextTags: normalizedForWrite.contextTags } : {}),
      ...schedulingFields,
      ...(typeof normalizedForWrite.importance === "string"
        ? {
            importance: normalizedForWrite.importance as "critical" | "high" | "normal" | "low",
          }
        : {}),
      ...(typeof normalizedForWrite.lifeArea === "string"
        ? {
            lifeArea: normalizedForWrite.lifeArea as
              | "career"
              | "family"
              | "health"
              | "finance"
              | "social"
              | "hobbies"
              | "education"
              | "travel"
              | "self-care"
              | "relationships",
          }
        : {}),
      ...(typeof normalizedForWrite.sentimentScore === "number"
        ? { sentimentScore: normalizedForWrite.sentimentScore }
        : {}),
      ...(Array.isArray(normalizedForWrite.linkedUrls)
        ? { linkedUrls: normalizedForWrite.linkedUrls }
        : {}),
      ...(Array.isArray(normalizedForWrite.extractedActions)
        ? { extractedActions: normalizedForWrite.extractedActions }
        : {}),
    };
    const updateExistingPatch = {
      ...(normalizedForWrite.content ? { content: normalizedForWrite.content } : {}),
      ...memoryUpdatePatch,
    };

    if (forcedUpdateTargetId) {
      await tc.ctx.runMutation(api.memories.update, {
        token: tc.token,
        id: forcedUpdateTargetId as Id<"memories">,
        sourceChatTurnId: tc.chatMessageId,
        ...updateExistingPatch,
      });
      tc.invalidateRecentMemories();
      tc.state.pendingCardIds.add(forcedUpdateTargetId);
      await linkAttachments(tc, forcedUpdateTargetId as Id<"memories">);
      await tc.reportProgress({
        phase: "writing",
        detail: "Applied edit to existing memory (duplicate prevented)",
        source: "memories",
        resultCount: existingMatchesCount || undefined,
        previewItems:
          existingMatchesPreview.length > 0
            ? toPreviewItems(existingMatchesPreview, "Stored memory")
            : undefined,
        events: [
          { label: "Policy", value: "prefer update over duplicate" },
          { label: "Target", value: forcedUpdateTargetId },
          ...(forcedUpdateTargetLabel
            ? [
                {
                  label: "Resolution",
                  value: forcedUpdateTargetLabel,
                },
              ]
            : []),
        ],
      });
      tc.state.writeToolCalled = true;
      return JSON.stringify({
        success: true,
        updated_existing: true,
        memory_id: forcedUpdateTargetId,
      });
    }

    if (existingCreated) {
      if (Object.keys(memoryUpdatePatch).length > 0) {
        await tc.ctx.runMutation(api.memories.update, {
          token: tc.token,
          id: existingCreated.id,
          sourceChatTurnId: tc.chatMessageId,
          ...memoryUpdatePatch,
        });
        tc.invalidateRecentMemories();
      }
      tc.state.pendingCardIds.add(String(existingCreated.id));
      await linkAttachments(tc, existingCreated.id);
      await tc.reportProgress({
        phase: "writing",
        detail: "Reused an equivalent memory instead of creating a duplicate",
        source: "memories",
        previewItems: [truncateStatusText(existingCreated.title)],
        events: [
          { label: "Operation", value: "deduplicated" },
          { label: "Target", value: String(existingCreated.id) },
        ],
      });
      tc.state.writeToolCalled = true;
      return JSON.stringify({
        success: true,
        deduped: true,
        memory: {
          id: existingCreated.id,
          title: existingCreated.title,
        },
      });
    }

    const created = await tc.ctx.runAction(internal.actions.processMemory.captureMemory, {
      token: tc.token,
      content: contentToSave,
      currentTime: tc.currentTime,
      currentTimezone: tc.effectiveTimezone,
      sourceChatTurnId: tc.chatMessageId,
    });

    if (Object.keys(memoryUpdatePatch).length > 0) {
      await tc.ctx.runMutation(api.memories.update, {
        token: tc.token,
        id: created.memoryId,
        sourceChatTurnId: tc.chatMessageId,
        ...memoryUpdatePatch,
      });
    }
    tc.invalidateRecentMemories();

    const resolvedTitle = normalizedForWrite.title || created.structured.title || "New Memory";
    tc.state.createdMemoriesByDedupeKey.set(dedupeKey, {
      id: created.memoryId,
      title: resolvedTitle,
    });
    tc.state.pendingCardIds.add(String(created.memoryId));
    await linkAttachments(tc, created.memoryId as Id<"memories">);
    await tc.reportProgress({
      phase: "writing",
      detail: "Saved a new memory entry",
      source: "memories",
      previewItems: [truncateStatusText(resolvedTitle)],
      events: [
        {
          label: "Kind",
          value: normalizedForWrite.entryKind === "reminder" ? "reminder" : "memory",
        },
        { label: "Target", value: String(created.memoryId) },
      ],
    });
    tc.state.writeToolCalled = true;
    return JSON.stringify({
      success: true,
      memory: {
        id: created.memoryId,
        title: resolvedTitle,
      },
    });
  },
};
