import React from "react";
import { BottomSheetFooter, type BottomSheetFooterProps } from "@gorhom/bottom-sheet";
import { YStack } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import { ChatInputBar } from "./ChatComposer";
import type { AIChatController } from "./types";

export function AIChatPanelFooter({
  controller,
  bottomInset = 0,
  onHeightChange,
  ...props
}: BottomSheetFooterProps & {
  controller: AIChatController;
  bottomInset?: number;
  onHeightChange?: (height: number) => void;
}) {
  const theme = useAppTheme();
  return (
    <BottomSheetFooter {...props}>
      <YStack
        onLayout={(event) => {
          onHeightChange?.(event.nativeEvent.layout.height);
        }}
        backgroundColor={theme.background.val}
        borderTopWidth={1}
        borderTopColor={theme.borderSubtle.val}
        paddingHorizontal={16}
        paddingTop={10}
        paddingBottom={Math.max(8, bottomInset)}
        gap={10}
      >
        <ChatInputBar
          isSending={controller.isSending}
          onSend={controller.handleSend}
          chatInputMode={controller.chatInputMode}
          setChatInputMode={controller.setChatInputMode}
          attachments={controller.attachments}
          onRemoveAttachment={controller.onRemoveAttachment}
          onPickImages={controller.onPickImages}
          onPickCamera={controller.onPickCamera}
          onPickDocument={controller.onPickDocument}
          driveConnected={controller.driveConnected}
          onRequestDriveAccess={controller.onRequestDriveAccess}
        />
      </YStack>
    </BottomSheetFooter>
  );
}
