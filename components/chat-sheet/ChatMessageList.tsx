import React, { useMemo } from "react";
import { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import { XStack, YStack, Text } from "tamagui";
import { Feather } from "@/lib/icons";
import { useAppTheme } from "@/hooks/useAppTheme";
import { withAlpha } from "@/components/ui/themeHelpers";
import type { ChatSheetController } from "./types";

function EmptyState() {
  const theme = useAppTheme();

  return (
    // The list is inverted, so counter-flip the empty state upright.
    <YStack
      flex={1}
      alignItems="center"
      justifyContent="center"
      paddingHorizontal={32}
      gap={14}
      style={{ transform: [{ scaleY: -1 }] }}
    >
      <XStack
        width={56}
        height={56}
        borderRadius={28}
        alignItems="center"
        justifyContent="center"
        backgroundColor={withAlpha(theme.primary.val, "12")}
        borderWidth={1}
        borderColor={withAlpha(theme.primary.val, "1E")}
      >
        <Feather name="message-square" size={24} color={theme.primary.val} />
      </XStack>
      <YStack alignItems="center" gap={4}>
        <Text fontSize={17} fontFamily="$body" fontWeight="700" color="$color">
          Ask Memora anything
        </Text>
        <Text fontSize={13} fontFamily="$body" color="$colorMuted" textAlign="center">
          Search memories, set reminders, attach files, or speak naturally to capture something
          fast.
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
        // Inverted: content start (paddingTop) is the visual bottom.
        paddingTop: 12,
        paddingBottom: 16,
        flexGrow: 1,
      }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
    />
  );
}
