import React, { useCallback, useEffect, useRef } from "react";
import { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import Animated, { ZoomIn } from "react-native-reanimated";
import type { ViewToken } from "react-native";
import { XStack, YStack, Text } from "tamagui";
import { Feather } from "@/lib/icons";
import { useAppTheme } from "@/hooks/useAppTheme";
import { withAlpha } from "@/components/ui/themeHelpers";
import type { AIChatController, AIChatDisplayItem } from "./types";
import { CHAT_BOTTOM_SPACING } from "./types";

const FEATURE_BULLETS = [
  "Save memories and reminders",
  "Find anything instantly",
  "Edit or delete entries",
  "Sync reminders to Google Calendar",
];

function EmptyState() {
  const theme = useAppTheme();

  return (
    <YStack flex={1} justifyContent="center" paddingHorizontal={20} paddingVertical={28} gap={18}>
      <YStack
        borderRadius={26}
        borderWidth={1}
        borderColor={theme.borderSubtle.val}
        backgroundColor={theme.surfaceElevated.val}
        padding={22}
      >
        <YStack gap={18}>
          <YStack gap={12}>
            <Animated.View entering={ZoomIn.duration(250)}>
              <XStack
                width={64}
                height={64}
                borderRadius={32}
                alignItems="center"
                justifyContent="center"
                backgroundColor={withAlpha(theme.primary.val, "14")}
                borderWidth={1}
                borderColor={withAlpha(theme.primary.val, "20")}
              >
                <Feather name="message-square" size={28} color={theme.primary.val} />
              </XStack>
            </Animated.View>
            <YStack gap={6}>
              <XStack
                alignSelf="flex-start"
                paddingHorizontal={10}
                paddingVertical={5}
                borderRadius={999}
                backgroundColor={withAlpha(theme.primary.val, "0F")}
                borderWidth={1}
                borderColor={withAlpha(theme.primary.val, "18")}
              >
                <Text fontSize={11} fontFamily="$body" fontWeight="700" color="$primary">
                  AI memory assistant
                </Text>
              </XStack>
              <Text fontSize={24} fontFamily="$body" fontWeight="800" color="$color">
                Ask Memora anything
              </Text>
              <Text fontSize={14} fontFamily="$body" color="$colorMuted" lineHeight={22}>
                Search memories, update reminders, attach files, or speak naturally to capture
                something fast.
              </Text>
            </YStack>
          </YStack>

          <YStack gap={10}>
            {FEATURE_BULLETS.map((bullet) => (
              <XStack
                key={bullet}
                alignItems="center"
                gap={10}
                paddingHorizontal={12}
                paddingVertical={11}
                borderRadius={16}
                backgroundColor={theme.surface.val}
                borderWidth={1}
                borderColor={theme.borderSubtle.val}
              >
                <XStack
                  width={24}
                  height={24}
                  borderRadius={12}
                  alignItems="center"
                  justifyContent="center"
                  backgroundColor={withAlpha(theme.primary.val, "12")}
                >
                  <Feather name="check" size={12} color={theme.primary.val} />
                </XStack>
                <Text fontSize={14} fontFamily="$body" color="$colorMuted" flex={1}>
                  {bullet}
                </Text>
              </XStack>
            ))}
          </YStack>
        </YStack>
      </YStack>
    </YStack>
  );
}

export function AIChatPanel({
  controller,
  footerHeight = 0,
}: {
  controller: AIChatController;
  footerHeight?: number;
}) {
  const { theme, displayMessages, renderMessage, keyExtractor, flatListRef } = controller;
  const isNearBottomRef = useRef(true);
  const didInitialScrollRef = useRef(false);
  const prevDisplayCountRef = useRef(0);
  const lastMessageIdRef = useRef<string | undefined>(
    displayMessages[displayMessages.length - 1]?._id,
  );

  lastMessageIdRef.current = displayMessages[displayMessages.length - 1]?._id;

  const scrollToBottom = useCallback(
    (animated: boolean) => {
      flatListRef.current?.scrollToEnd({ animated });
    },
    [flatListRef],
  );

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken<AIChatDisplayItem>[] }) => {
      const currentLastMessageId = lastMessageIdRef.current;
      if (!currentLastMessageId) {
        isNearBottomRef.current = true;
        return;
      }

      isNearBottomRef.current = viewableItems.some(
        (entry) => entry.item?._id === currentLastMessageId,
      );
    },
  );
  const viewabilityConfig = useRef<{
    itemVisiblePercentThreshold: number;
  }>({
    itemVisiblePercentThreshold: 20,
  });
  const listFooter = displayMessages.length > 0 ? <YStack flex={1} minHeight={0} /> : null;

  useEffect(() => {
    prevDisplayCountRef.current = displayMessages.length;
  }, []);

  return (
    <BottomSheetFlatList
      ref={flatListRef}
      data={displayMessages}
      renderItem={renderMessage}
      keyExtractor={keyExtractor}
      style={{ flex: 1, backgroundColor: theme.background.val }}
      ListEmptyComponent={<EmptyState />}
      ListFooterComponent={listFooter}
      onContentSizeChange={() => {
        if (!didInitialScrollRef.current) {
          didInitialScrollRef.current = true;
          requestAnimationFrame(() => {
            scrollToBottom(false);
          });
          prevDisplayCountRef.current = displayMessages.length;
          return;
        }

        if (displayMessages.length > prevDisplayCountRef.current && isNearBottomRef.current) {
          requestAnimationFrame(() => {
            scrollToBottom(true);
          });
        }

        prevDisplayCountRef.current = displayMessages.length;
      }}
      onViewableItemsChanged={onViewableItemsChanged.current}
      viewabilityConfig={viewabilityConfig.current}
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingTop: 18,
        paddingBottom: footerHeight + CHAT_BOTTOM_SPACING,
        flexGrow: 1,
      }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
    />
  );
}
