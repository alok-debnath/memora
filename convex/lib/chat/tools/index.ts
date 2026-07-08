"use node";

import type OpenAI from "openai";
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

export const CHAT_TOOL_DEFINITIONS: OpenAI.Chat.Completions.ChatCompletionTool[] =
  REGISTERED_TOOLS.map((tool) => tool.definition);

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
