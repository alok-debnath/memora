import React, { useCallback, useMemo } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { useAppTheme } from "@/hooks/useAppTheme";
import { ChatBubble } from "./ChatBubble";
import { ThinkingIndicator, ToolProgressBubble } from "./ToolProgressBubble";
import type { AIChatDisplayItem, CardFlow, ChatMsg, DeletionItem } from "./types";
import {
  createMarkdownStyles,
  extractSpeakableText,
  parseCardIds,
  parseDeletionProposal,
} from "./rendererUtils";

type RenderMessageOptions = {
  compact?: boolean;
  speakingId: string | null;
  speakMessage: (id: string, text: string) => void;
  copyMessage: (text: string) => void;
  token?: string | null;
  calendarSyncEnabled?: boolean;
  onDeepSearch: (messageId: string, query: string) => void;
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
  onDeepSearch,
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
      let cardIds: Id<"memories">[] | undefined;
      let displayMsg = item;
      let cardIsCached: boolean | undefined;
      let cardTurns: number | undefined;
      let cardFlow: CardFlow | undefined;

      if (item.role !== "user") {
        let content = item.content ?? "";
        const deletionProposal = parseDeletionProposal(content);
        if (deletionProposal) {
          deletionItems = deletionProposal.items;
          content = deletionProposal.cleanText;
        }

        const parsedCards = parseCardIds(content);
        if (parsedCards) {
          cardIds = parsedCards.ids;
          cardIsCached = parsedCards.isCached;
          cardTurns = parsedCards.turns;
          cardFlow = parsedCards.flow;
          content = parsedCards.cleanText;
        }

        displayMsg = {
          ...displayMsg,
          content: content
            .replace(/<!--MEMORA_SEARCH_RESULTS:[\s\S]*?-->/g, "")
            .replace(/<!--[\s\S]*?-->/g, "")
            .trim(),
        };
      }

      return (
        <ChatBubble
          msg={displayMsg}
          isUser={item.role === "user"}
          mdStyles={item.role === "user" ? userMdStyles : aiMdStyles}
          speakingId={speakingId}
          onSpeak={speakMessage}
          onCopy={copyMessage}
          token={token}
          deletionItems={deletionItems}
          cardIds={cardIds}
          cardIsCached={cardIsCached}
          cardTurns={cardTurns}
          cardFlow={cardFlow}
          calendarSyncEnabled={calendarSyncEnabled}
          onDeepSearch={onDeepSearch}
          onEditMemory={onEditMemory}
        />
      );
    },
    [
      aiMdStyles,
      calendarSyncEnabled,
      copyMessage,
      onDeepSearch,
      onEditMemory,
      speakMessage,
      speakingId,
      token,
      userMdStyles,
    ],
  );
}
