import React, { useCallback, useMemo } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { useAppTheme } from "@/hooks/useAppTheme";
import { ChatBubble } from "./ChatBubble";
import { ThinkingIndicator, ToolProgressBubble } from "./ToolProgressBubble";
import type { AIChatDisplayItem, CardFlow, CardRef, ChatMsg, DeletionItem } from "./types";
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
      let cards: CardRef[] | undefined;
      let displayMsg = item;
      let cardIsCached: boolean | undefined;
      let cardTurns: number | undefined;
      let cardFlow: CardFlow | undefined;

      if (item.role !== "user") {
        const presentation = extractAssistantPresentation(item);
        deletionItems = presentation.deletionItems;
        cards = presentation.cards.length > 0 ? presentation.cards : undefined;
        cardIsCached = presentation.isCached;
        cardTurns = presentation.turns;
        cardFlow = presentation.flow;
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
          cards={cards}
          cardIsCached={cardIsCached}
          cardTurns={cardTurns}
          cardFlow={cardFlow}
          calendarSyncEnabled={calendarSyncEnabled}
          onEditMemory={onEditMemory}
        />
      );
    },
    [
      aiMdStyles,
      calendarSyncEnabled,
      copyMessage,
      onEditMemory,
      speakMessage,
      speakingId,
      token,
      userMdStyles,
    ],
  );
}
