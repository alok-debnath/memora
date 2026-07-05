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
    // Inverted FlatList rotates its scroll content 180deg, so anything
    // rendered inside it (including this empty state) renders upside down
    // unless counter-rotated the same way.
    <YStack
      flex={1}
      alignItems="center"
      justifyContent="center"
      paddingHorizontal={32}
      gap={14}
      style={{ transform: [{ rotate: "180deg" }] }}
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
