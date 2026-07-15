import React, { useMemo } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { YStack } from "tamagui";

import { withAlpha } from "@/components/ui/themeHelpers";
import { useAppTheme } from "@/hooks/useAppTheme";
import { ChatComposer } from "./ChatComposer";
import { ChatHeader } from "./ChatHeader";
import { ChatMessageList } from "./ChatMessageList";
import { ConversationList } from "./ConversationList";
import { useChatController } from "./useChatController";

export function ChatSurface({
  onClose,
  presentation = "sheet",
}: {
  onClose: () => void;
  presentation?: "sheet" | "dock";
}) {
  const theme = useAppTheme();
  const controller = useChatController();
  const [showConversations, setShowConversations] = React.useState(false);

  const activeTitle = useMemo(() => {
    if (controller.activeConversationId === null) return "Memora";
    return (
      controller.conversations.find(
        (conversation) => conversation._id === controller.activeConversationId,
      )?.title ?? "Memora"
    );
  }, [controller.activeConversationId, controller.conversations]);

  return (
    <YStack flex={1} minHeight={0} backgroundColor={theme.background.val}>
      <ChatHeader
        messageCount={controller.messages.length}
        title={activeTitle}
        showingConversations={showConversations}
        onToggleConversations={() => setShowConversations((value) => !value)}
        onClear={controller.handleClearChat}
        onClose={onClose}
      />
      {showConversations ? (
        <ConversationList controller={controller} onClose={() => setShowConversations(false)} />
      ) : (
        <YStack flex={1} minHeight={0} position="relative">
          <ChatMessageList controller={controller} />
          <LinearGradient
            colors={[withAlpha(theme.background.val, "00"), theme.background.val]}
            locations={[0, 0.75]}
            pointerEvents="none"
            style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 80 }}
          />
          <YStack pointerEvents="box-none" position="absolute" left={0} right={0} bottom={0}>
            <ChatComposer
              isSending={controller.isSending}
              onSend={controller.handleSend}
              onStop={controller.handleStop}
              prefillText={controller.prefillText}
              onPrefillConsumed={controller.consumePrefill}
              attachments={controller.attachments}
              onRemoveAttachment={controller.onRemoveAttachment}
              onPickImages={controller.onPickImages}
              onPickCamera={controller.onPickCamera}
              onPickDocument={controller.onPickDocument}
              driveConnected={controller.driveConnected}
              onRequestDriveAccess={controller.onRequestDriveAccess}
              standalone={presentation === "dock"}
            />
          </YStack>
        </YStack>
      )}
    </YStack>
  );
}
