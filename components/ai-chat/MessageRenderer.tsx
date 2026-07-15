import React, { useCallback, useMemo } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { useAppTheme } from "@/hooks/useAppTheme";
import { ChatBubble } from "./ChatBubble";
import { ThinkingIndicator, ToolProgressBubble } from "./ToolProgressBubble";
import type { AIChatDisplayItem, CardFlow, CardSnapshot, ChatMsg, DeletionItem } from "./types";
import {
  createMarkdownStyles,
  extractAssistantPresentation,
  extractSpeakableText,
} from "./rendererUtils";

type RenderMessageOptions = {
  compact?: boolean;
  speakingId?: string | null;
  speakMessage?: (id: string, text: string) => void;
  copyMessage: (text: string) => void;
  token?: string | null;
  calendarSyncEnabled?: boolean;
  onEditMemory: (id: Id<"memories">) => void;
  /** Re-ask the last user question (assistant "Regenerate" / error retry). */
  onRegenerate?: () => void;
  /** Prefill the composer with a previous user message for editing. */
  onEditResend?: (text: string) => void;
};

function isChatMessage(item: AIChatDisplayItem): item is ChatMsg {
  return item.role !== "thinking" && item.role !== "tool_progress";
}

export { extractSpeakableText };

export function useAIChatMessageRenderer({
  compact,
  speakingId,
  speakMessage,
  copyMessage,
  token,
  calendarSyncEnabled,
  onEditMemory,
  onRegenerate,
  onEditResend,
}: RenderMessageOptions) {
  const theme = useAppTheme();
  const aiMdStyles = useMemo(() => createMarkdownStyles(theme, compact, false), [compact, theme]);
  const userMdStyles = useMemo(() => createMarkdownStyles(theme, compact, true), [compact, theme]);

  return useCallback(
    ({ item }: { item: AIChatDisplayItem }) => {
      if (item.role === "thinking") return <ThinkingIndicator />;
      if (item.role === "tool_progress") return <ToolProgressBubble status={item.status ?? {}} />;
      if (!isChatMessage(item)) return null;

      let deletionItems: DeletionItem[] | undefined;
      let cardSnapshots: CardSnapshot[] | undefined;
      let displayMsg = item;
      let turns: number | undefined;
      let flow: CardFlow | undefined;

      if (item.role !== "user") {
        const presentation = extractAssistantPresentation(item);
        deletionItems = presentation.deletionItems;
        cardSnapshots =
          presentation.cardSnapshots.length > 0 ? presentation.cardSnapshots : undefined;
        turns = presentation.turns;
        flow = presentation.flow;
        displayMsg = {
          ...displayMsg,
          content: presentation.cleanText,
        };
      }

      return (
        <ChatBubble
          msg={displayMsg}
          isUser={item.role === "user"}
          mdStyles={item.role === "user" ? userMdStyles : aiMdStyles}
          speakingId={speakingId ?? null}
          onSpeak={speakMessage}
          onCopy={copyMessage}
          token={token}
          deletionItems={deletionItems}
          cardSnapshots={cardSnapshots}
          turns={turns}
          flow={flow}
          calendarSyncEnabled={calendarSyncEnabled}
          onEditMemory={onEditMemory}
          onRegenerate={onRegenerate}
          onEditResend={onEditResend}
        />
      );
    },
    [
      aiMdStyles,
      calendarSyncEnabled,
      copyMessage,
      onEditMemory,
      onEditResend,
      onRegenerate,
      speakMessage,
      speakingId,
      token,
      userMdStyles,
    ],
  );
}
