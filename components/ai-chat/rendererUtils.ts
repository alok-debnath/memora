import { Platform } from "react-native";
import type { MarkdownProps } from "@believer/react-native-markdown-display";
import { FontFamily } from "@/constants/fonts";
import type { FeatherIconName } from "@/lib/icons";
import { withAlpha } from "@/components/ui/themeHelpers";
import type { useAppTheme } from "@/hooks/useAppTheme";
import type { Id } from "@/convex/_generated/dataModel";
import type { CardFlow, CardRef, ChatMsg, DeletionItem, ProgressStatus } from "./types";

export type MarkdownStyle = MarkdownProps["style"];

export function formatMessageTime(timestamp: number) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  } catch {
    const hours = date.getHours();
    const minutes = `${date.getMinutes()}`.padStart(2, "0");
    return `${hours}:${minutes}`;
  }
}

export function formatReminderDueAt(dueAt?: string | null) {
  if (!dueAt) return null;
  const date = new Date(dueAt);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

function coerceFlow(candidate: unknown): CardFlow | undefined {
  return candidate &&
    typeof candidate === "object" &&
    (candidate as CardFlow).summary &&
    (candidate as CardFlow).steps
    ? (candidate as CardFlow)
    : undefined;
}

export type AssistantPresentation = {
  cleanText: string;
  cards: CardRef[];
  deletionItems?: DeletionItem[];
  isCached: boolean;
  turns?: number;
  flow?: CardFlow;
};

/**
 * Resolve what an assistant message should display from its structured
 * `meta`. Message content is persisted as clean text server-side, so no
 * marker parsing is needed here.
 */
export function extractAssistantPresentation(msg: ChatMsg): AssistantPresentation {
  const meta = msg.meta;
  return {
    cleanText: (msg.content ?? "").trim(),
    cards: meta?.cards ?? [],
    deletionItems:
      meta?.deletionProposal && meta.deletionProposal.length > 0
        ? (meta.deletionProposal as DeletionItem[])
        : undefined,
    isCached: meta?.isCached ?? false,
    turns: typeof meta?.turns === "number" ? meta.turns : undefined,
    flow: coerceFlow(meta?.flow),
  };
}

export function extractSpeakableText(content: string): string {
  return content.trim();
}

export function createMarkdownStyles(
  theme: ReturnType<typeof useAppTheme>,
  compact?: boolean,
  isUser?: boolean,
): MarkdownStyle {
  const textColor = isUser ? theme.textInverse.val : theme.color.val;
  const codeBackground = isUser ? withAlpha(theme.textInverse.val, "26") : theme.accent.val;
  return {
    body: {
      color: textColor,
      fontSize: compact ? 13 : 14,
      fontFamily: FontFamily.regular,
      lineHeight: compact ? 18 : 20,
    },
    strong: { fontFamily: FontFamily.bold, color: textColor },
    code_inline: {
      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
      backgroundColor: codeBackground,
      color: textColor,
      fontSize: 13,
    },
    code_block: {
      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
      backgroundColor: codeBackground,
      color: textColor,
      fontSize: 13,
      padding: 8,
      borderRadius: 6,
    },
    link: { color: isUser ? theme.textInverse.val : theme.primary.val },
    ...(isUser
      ? {}
      : {
          bullet_list_icon: { color: theme.color.val },
          ordered_list_icon: { color: theme.color.val },
        }),
  };
}

export function formatElapsedTime(startedAt?: number | null) {
  if (!startedAt) return null;
  const elapsedMs = Math.max(0, Date.now() - startedAt);
  const seconds = Math.floor(elapsedMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

export function formatMetaLabel(status: ProgressStatus) {
  const parts: string[] = [];
  if (status.cacheState === "cached") parts.push("cached");
  else if (status.cacheState === "fresh") parts.push("full scan");
  if (typeof status.resultCount === "number") {
    parts.push(`${status.resultCount} hit${status.resultCount === 1 ? "" : "s"}`);
  }
  return parts.join(" • ");
}

export function getUsefulEvents(status: ProgressStatus) {
  const genericValues = new Set([
    "general reasoning",
    "initial plan",
    "next action",
    "prepare answer or next tool",
    "composing final text",
  ]);

  return (status.events ?? []).filter((event) => {
    const label = (event.label ?? "").trim().toLowerCase();
    const value = (event.value ?? "").trim().toLowerCase();
    if (!label && !value) return false;
    if (label === "step" || label === "loop" || label === "next") return false;
    if (label === "mode" && genericValues.has(value)) return false;
    if (label === "matches" && typeof status.resultCount === "number") return false;
    return true;
  });
}

export function getProgressTitle(status: ProgressStatus) {
  const phase = (status.phase ?? "").toLowerCase();
  const toolName = (status.toolName ?? "").toLowerCase();
  if (toolName === "search_memories" || toolName === "deep_search") return "Searching memories";
  if (toolName === "search_documents") return "Searching documents";
  if (toolName === "memory_grounding") return "Checking stored data";
  if (toolName === "create_memory") return "Saving memory";
  if (toolName === "update_memory") return "Updating memory";
  if (toolName === "manage_topics") return "Updating topics";
  if (toolName === "surface_cards") return "Preparing cards";
  if (phase === "searching") return "Searching";
  if (phase === "analyzing") return "Analyzing";
  if (phase === "writing") return "Saving changes";
  if (phase === "grounding") return "Checking stored data";
  if (phase === "finalizing") return "Finalizing response";
  if (phase === "loading") return "Loading";
  return "Working";
}

export function getProgressIcon(status: ProgressStatus): FeatherIconName {
  const phase = (status.phase ?? "").toLowerCase();
  const toolName = (status.toolName ?? "").toLowerCase();
  if (
    toolName === "search_memories" ||
    toolName === "deep_search" ||
    toolName === "search_documents"
  ) {
    return "search";
  }
  if (toolName === "memory_grounding" || phase === "grounding") return "database";
  if (phase === "writing") return "save";
  if (phase === "finalizing") return "check-circle";
  if (phase === "loading") return "folder";
  return "cpu";
}
