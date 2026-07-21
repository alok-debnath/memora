"use node";

import { getStatsTool } from "./browseAndStats";
import { combineMemoriesTool } from "./combineMemories";
import { createMemoryTool } from "./createMemory";
import { proposeDeletionTool } from "./deletionAndTrash";
import { GENERIC_PRIMITIVE_TOOLS } from "./genericPrimitives";
import { historyTool, manageTopicsTool } from "./historyAndTopics";
import { removeReminderSyncTool, syncReminderTool } from "./reminderSync";
import { respondTool } from "./respond";
import { searchMemoriesTool } from "./searchMemories";
import type { ChatTool } from "./toolTypes";
import { updateMemoryTool } from "./updateMemory";

/**
 * Tool registry: hand-written domain tools (kept because they carry
 * dedup/reference-resolution logic, confirm-before-destroy UX, calendar side
 * effects, or multi-step clustering that a generic field patch can't safely
 * replicate) plus the 5 generic primitive tools that cover everything else
 * across the AI_TABLE_ALLOWLIST tables — diaryEntries, sharedMemories,
 * userTopics and memories, see lib/aiPrimitives/tableRegistry.ts. Order
 * matters only for the model-facing tool list.
 */
const HAND_WRITTEN_TOOLS: ChatTool[] = [
  searchMemoriesTool,
  createMemoryTool,
  updateMemoryTool,
  combineMemoriesTool,
  syncReminderTool,
  removeReminderSyncTool,
  proposeDeletionTool,
  getStatsTool,
  historyTool,
  manageTopicsTool,
  respondTool,
];

const REGISTERED_TOOLS: ChatTool[] = [...HAND_WRITTEN_TOOLS, ...GENERIC_PRIMITIVE_TOOLS];

const CORE_TOOL_NAMES = new Set(["search_memories", "create_memory", "update_memory", "respond"]);
const REFERENTIAL_FOLLOW_UP =
  /^(?:yes|no|okay|ok|sure|please|do it|go ahead|that one|this one|the same|undo that|restore it)[.!\s]*$/i;

/**
 * Keep the planner's schema surface proportional to the request. Core tools
 * remain available on every turn; specialized tools are added conservatively
 * from explicit intent. Ambiguous short follow-ups retain the full palette so
 * context-dependent operations never disappear.
 */
export function selectChatTools(message: string): ChatTool[] {
  const normalized = message.trim();
  if (!normalized || REFERENTIAL_FOLLOW_UP.test(normalized)) {
    return REGISTERED_TOOLS;
  }

  const names = new Set(CORE_TOOL_NAMES);
  const include = (...toolNames: string[]) => toolNames.forEach((name) => names.add(name));

  if (
    /\b(list|show|browse|which|what are|do i have|exist|how many|count|memories|reminders|deleted|trash|restore|recover|bring back)\b/i.test(
      normalized,
    )
  ) {
    include("list_docs", "get_doc", "update_doc");
  }
  if (/\b(diary|journal|mood|feel(?:ing)?s?|felt|wrote|entry|entries)\b/i.test(normalized)) {
    include("list_docs", "get_doc", "create_doc", "update_doc");
  }
  if (/\b(stat(?:s|istics)?|how many|count|overview|total)\b/i.test(normalized)) {
    include("get_stats", "list_docs");
  }
  if (
    /\b(analy[sz]e|analysis|trend|pattern|insight|compare|connection|summari[sz]e)\b/i.test(
      normalized,
    )
  ) {
    include("list_docs", "get_doc");
  }
  if (/\b(delete|remove|trash|discard)\b/i.test(normalized)) {
    include("propose_deletion", "delete_doc");
  }
  if (/\b(combine|merge|consolidate)\b/i.test(normalized)) {
    include("combine_memories", "search_memories");
  }
  if (
    /\b(history|version|revert|rollback|undo(?: an? edit| change)?|snapshot)\b/i.test(normalized)
  ) {
    include("history");
  }
  if (/\b(topic|topics|tag|tags|category|categor(?:y|ize)|retag|recolor)\b/i.test(normalized)) {
    include("manage_topics", "update_doc");
  }
  if (/\b(sync|resync|calendar|google event)\b/i.test(normalized)) {
    include("sync_reminder", "remove_reminder_sync");
  }
  if (/\b(share|shared|unshare|share link)\b/i.test(normalized)) {
    include("create_doc", "delete_doc", "list_docs");
  }

  return REGISTERED_TOOLS.filter((tool) => names.has(tool.name));
}

export function getChatToolDefinitions(message: string) {
  return selectChatTools(message).map((tool) => tool.definition);
}

export const CHAT_TOOLS_BY_NAME: ReadonlyMap<string, ChatTool> = new Map(
  REGISTERED_TOOLS.map((tool) => [tool.name, tool]),
);

/**
 * Names of tools marked `kind: "read"` — derived from the registry so a new
 * read-only tool is automatically included without editing memoryChat.ts's
 * force-respond heuristic.
 */
export const READ_ONLY_INFO_TOOL_NAMES: ReadonlySet<string> = new Set(
  REGISTERED_TOOLS.filter((tool) => tool.kind === "read").map((tool) => tool.name),
);

/** Labels for tool names that appear in flow steps but are not registry tools. */
const EXTRA_TOOL_LABELS: Record<string, string> = {
  search_documents: "Search documents",
  deep_search: "Deep scan",
};

export function formatFlowToolLabel(toolName: string) {
  return (
    CHAT_TOOLS_BY_NAME.get(toolName)?.label ??
    EXTRA_TOOL_LABELS[toolName] ??
    toolName.replace(/_/g, " ")
  );
}

export type { ChatTool, ToolContext } from "./toolTypes";
