"use node";

import type { AttachmentExtractionResult } from "../attachmentExtraction";
import { formatFlowToolLabel } from "./tools";
import type { MemorySearchResult } from "./types";

export type CardFlowSearch = {
  source: "grounding" | "tool";
  query?: string;
  resultCount: number;
  cacheState?: "cached" | "fresh";
  searchMode?: MemorySearchResult["searchMode"];
};

export type CardFlowAttachment = {
  name: string;
  type: "image" | "document";
  status: AttachmentExtractionResult["processingStatus"];
  method?: AttachmentExtractionResult["extractionMethod"];
};

export type CardFlowSummary = {
  assistantProvider: "openai" | "google";
  turns: number;
  cardCount: number;
  pathMode: "cached" | "fresh";
  hasFiles: boolean;
};

export type CardFlowStep =
  | {
      kind: "grounding";
      query?: string;
      resultCount: number;
      cacheState?: "cached" | "fresh";
      searchMode?: MemorySearchResult["searchMode"];
    }
  | {
      kind: "search";
      query?: string;
      resultCount: number;
      cacheState?: "cached" | "fresh";
      searchMode?: MemorySearchResult["searchMode"];
    }
  | {
      kind: "files";
      total: number;
      completed: number;
      failed: number;
      methods: Array<NonNullable<CardFlowAttachment["method"]>>;
    }
  | {
      kind: "tool";
      toolName: string;
      label: string;
    }
  | {
      kind: "reasoning";
      turns: number;
      assistantProvider: "openai" | "google";
    }
  | {
      kind: "result";
      cardCount: number;
    };

export type CardFlowPayload = {
  chatTurnId?: string;
  assistantProvider: "openai" | "google";
  toolSequence: string[];
  searches: CardFlowSearch[];
  attachments: CardFlowAttachment[];
  summary: CardFlowSummary;
  steps: CardFlowStep[];
};

export function buildCardFlowPayload(args: {
  chatTurnId: string;
  assistantProvider: "openai" | "google";
  turns: number;
  cardCount: number;
  pathMode: "cached" | "fresh";
  searches: CardFlowSearch[];
  toolSequence: string[];
  attachments: CardFlowAttachment[];
}): CardFlowPayload {
  const { searches, toolSequence, attachments } = args;
  const attachmentMethods = Array.from(
    new Set(
      attachments
        .map((attachment) => attachment.method)
        .filter((method): method is NonNullable<CardFlowAttachment["method"]> => !!method),
    ),
  );
  const completedAttachmentCount = attachments.filter(
    (attachment) => attachment.status === "completed",
  ).length;
  const failedAttachmentCount = attachments.length - completedAttachmentCount;
  const steps: CardFlowStep[] = [];

  for (const search of searches) {
    steps.push({
      kind: search.source === "grounding" ? "grounding" : "search",
      query: search.query,
      resultCount: search.resultCount,
      cacheState: search.cacheState,
      searchMode: search.searchMode,
    });
  }

  if (attachments.length > 0) {
    steps.push({
      kind: "files",
      total: attachments.length,
      completed: completedAttachmentCount,
      failed: failedAttachmentCount,
      methods: attachmentMethods,
    });
  }

  for (const toolName of toolSequence) {
    steps.push({
      kind: "tool",
      toolName,
      label: formatFlowToolLabel(toolName),
    });
  }

  steps.push({
    kind: "reasoning",
    turns: args.turns,
    assistantProvider: args.assistantProvider,
  });
  steps.push({
    kind: "result",
    cardCount: args.cardCount,
  });

  return {
    chatTurnId: args.chatTurnId,
    assistantProvider: args.assistantProvider,
    toolSequence,
    searches,
    attachments,
    summary: {
      assistantProvider: args.assistantProvider,
      turns: args.turns,
      cardCount: args.cardCount,
      pathMode: args.pathMode,
      hasFiles: attachments.length > 0,
    },
    steps,
  };
}
