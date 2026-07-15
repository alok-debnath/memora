import React, { useMemo } from "react";
import { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import type { ViewProps } from "react-native";
import { XStack, YStack, Text } from "tamagui";
import { Feather } from "@/lib/icons";
import { useAppTheme } from "@/hooks/useAppTheme";
import { withAlpha } from "@/components/ui/themeHelpers";
import type { ChatSheetController } from "./types";

function EmptyState({ style, onLayout }: Pick<ViewProps, "style" | "onLayout">) {
  const theme = useAppTheme();

  return (
    // VirtualizedList injects the correct platform-specific counter-transform
    // into its empty component. Forward it rather than hard-coding a rotation:
    // web/iOS use scaleY(-1), while Android uses scale(-1).
    <YStack
      onLayout={onLayout}
      flex={1}
      alignItems="center"
      justifyContent="center"
      paddingHorizontal={32}
      gap={12}
      style={style}
    >
      <XStack
        width={52}
        height={52}
        borderRadius={26}
        alignItems="center"
        justifyContent="center"
        backgroundColor={withAlpha(theme.primary.val, "12")}
        borderWidth={1}
        borderColor={withAlpha(theme.primary.val, "1E")}
      >
        <Feather name="message-square" size={22} color={theme.primary.val} />
      </XStack>
      <YStack alignItems="center" gap={4}>
        <Text fontSize={17} fontFamily="$body" fontWeight="700" color={theme.color.val}>
          Ask Memora anything
        </Text>
        <Text fontSize={13} fontFamily="$body" color={theme.colorMuted.val} textAlign="center">
          Search, remember, attach, or speak.
        </Text>
      </YStack>
    </YStack>
  );
}

export function ChatMessageList({ controller }: { controller: ChatSheetController }) {
  const theme = useAppTheme();
  const { displayMessages, renderMessage, keyExtractor, flatListRef } = controller;

  // Inverted list: index 0 renders at the visual bottom, so the newest message
  // is always in view and new messages stay pinned without scroll gymnastics.
  const data = useMemo(() => [...displayMessages].reverse(), [displayMessages]);

  return (
    <BottomSheetFlatList
      ref={flatListRef}
      data={data}
      inverted
      renderItem={renderMessage}
      keyExtractor={keyExtractor}
      style={{ flex: 1, minHeight: 0, backgroundColor: theme.background.val }}
      ListEmptyComponent={<EmptyState />}
      contentContainerStyle={{
        paddingHorizontal: 16,
        // Inverted: content start (paddingTop) is the visual bottom. Composer
        // now floats over the list instead of pushing it up, so this has to
        // clear the floating pill's own height + margins (~92) or the newest
        // message would render underneath it.
        paddingTop: 100,
        paddingBottom: 16,
        flexGrow: 1,
      }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
    />
  );
}
