"use node";

import {
  analyzeMemoriesTool,
  getDiaryEntriesTool,
  getStatsTool,
  listMemoriesTool,
} from "./browseAndStats";
import { createMemoryTool } from "./createMemory";
import {
  listDeletedMemoriesTool,
  proposeDeletionTool,
  restoreMemoryTool,
} from "./deletionAndTrash";
import { historyTool, manageTopicsTool } from "./historyAndTopics";
import { removeReminderSyncTool, syncReminderTool } from "./reminderSync";
import { respondTool } from "./respond";
import { searchMemoriesTool } from "./searchMemories";
import type { ChatTool } from "./toolTypes";
import { updateMemoryTool } from "./updateMemory";

/**
 * Tool registry. Order matters only for the model-facing tool list.
 * Adding a chat tool = write one ChatTool module + add it here.
 */
const REGISTERED_TOOLS: ChatTool[] = [
  searchMemoriesTool,
  createMemoryTool,
  updateMemoryTool,
  syncReminderTool,
  removeReminderSyncTool,
  proposeDeletionTool,
  listDeletedMemoriesTool,
  restoreMemoryTool,
  listMemoriesTool,
  getDiaryEntriesTool,
  getStatsTool,
  analyzeMemoriesTool,
  historyTool,
  manageTopicsTool,
  respondTool,
];

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
    /\b(list|show|browse|which|what are|do i have|exist|how many|count|memories|reminders)\b/i.test(
      normalized,
    )
  ) {
    include("list_memories");
  }
  if (/\b(diary|journal|mood|feel(?:ing)?s?|felt|wrote|entry|entries)\b/i.test(normalized)) {
    include("get_diary_entries");
  }
  if (/\b(stat(?:s|istics)?|how many|count|overview|total)\b/i.test(normalized)) {
    include("get_stats", "list_memories");
  }
  if (
    /\b(analy[sz]e|analysis|trend|pattern|insight|compare|connection|summari[sz]e)\b/i.test(
      normalized,
    )
  ) {
    include("analyze_memories", "get_diary_entries");
  }
  if (/\b(delete|remove|trash|discard)\b/i.test(normalized)) {
    include("propose_deletion");
  }
  if (/\b(deleted|trash|restore|recover|bring back)\b/i.test(normalized)) {
    include("list_deleted_memories", "restore_memory");
  }
  if (
    /\b(history|version|revert|rollback|undo(?: an? edit| change)?|snapshot)\b/i.test(normalized)
  ) {
    include("history");
  }
  if (
    /\b(topic|topics|tag|tags|category|categor(?:y|ize)|retag|recolor|merge)\b/i.test(normalized)
  ) {
    include("manage_topics");
  }
  if (/\b(sync|resync|calendar|google event)\b/i.test(normalized)) {
    include("sync_reminder", "remove_reminder_sync");
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
