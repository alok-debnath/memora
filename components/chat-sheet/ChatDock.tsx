import React from "react";
import { PanResponder, View } from "react-native";
import { YStack } from "tamagui";

import { layout } from "@/constants/uiTokens";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useUIStore } from "@/store/ui";
import { ScreenErrorBoundary } from "@/components/ui/ScreenErrorBoundary";
import { SheetIdProvider } from "@/components/ui/ContextMenu.shared";
import { ChatSurface } from "./ChatSurface";

function clampDockWidth(width: number) {
  return Math.min(layout.dockedChatMaxWidth, Math.max(layout.dockedChatMinWidth, width));
}

export function ChatDock() {
  const theme = useAppTheme();
  const close = useUIStore((state) => state.closeCommand);
  const [width, setWidth] = React.useState<number>(layout.dockedChatDefaultWidth);
  const widthAtGestureStart = React.useRef(width);

  const responder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 2,
        onPanResponderGrant: () => {
          widthAtGestureStart.current = width;
        },
        onPanResponderMove: (_, gesture) => {
          setWidth(clampDockWidth(widthAtGestureStart.current - gesture.dx));
        },
      }),
    [width],
  );

  return (
    <YStack
      width={width}
      flexShrink={0}
      backgroundColor={theme.background.val}
      borderLeftWidth={1}
      borderLeftColor={theme.borderSubtle.val}
      position="relative"
    >
      <View
        {...responder.panHandlers}
        accessibilityRole="adjustable"
        accessibilityLabel="Resize chat panel"
        style={
          {
            position: "absolute",
            left: -5,
            top: 0,
            bottom: 0,
            width: 10,
            zIndex: 10,
            cursor: "col-resize",
          } as never
        }
      />
      <SheetIdProvider value="unifiedCommand">
        <ScreenErrorBoundary label="Chat">
          <ChatSurface onClose={close} presentation="dock" />
        </ScreenErrorBoundary>
      </SheetIdProvider>
    </YStack>
  );
}
