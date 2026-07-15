import React from "react";
import { XStack, YStack, Text } from "tamagui";
import { Feather } from "@/lib/icons";
import { useAppTheme } from "@/hooks/useAppTheme";
import { withAlpha } from "@/components/ui/themeHelpers";
import { PressableScale } from "@/components/ui/PressableScale";

export const ChatHeader = React.memo(function ChatHeader({
  messageCount,
  title,
  showingConversations,
  onToggleConversations,
  onClear,
  onClose,
}: {
  messageCount: number;
  title?: string;
  showingConversations?: boolean;
  onToggleConversations?: () => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const theme = useAppTheme();

  return (
    <XStack
      alignItems="center"
      justifyContent="space-between"
      gap={12}
      paddingHorizontal={16}
      paddingTop={6}
      paddingBottom={10}
      borderBottomWidth={1}
      borderBottomColor={theme.borderSubtle.val}
    >
      <XStack flex={1} alignItems="center" gap={10}>
        <XStack
          width={34}
          height={34}
          borderRadius={17}
          alignItems="center"
          justifyContent="center"
          backgroundColor={withAlpha(theme.primary.val, "14")}
        >
          <Feather name="message-circle" size={16} color={theme.primary.val} />
        </XStack>
        <YStack flex={1} minWidth={0}>
          <Text
            fontSize={16}
            fontFamily="$body"
            fontWeight="700"
            color={theme.color.val}
            numberOfLines={1}
          >
            {showingConversations ? "Chats" : (title ?? "Memora")}
          </Text>
          <Text fontSize={12} fontFamily="$body" color={theme.colorMuted.val} numberOfLines={1}>
            {showingConversations
              ? "Pick or start a conversation"
              : messageCount === 0
                ? "Memory chat"
                : `${messageCount} messages`}
          </Text>
        </YStack>
      </XStack>

      <XStack alignItems="center" gap={2}>
        {onToggleConversations ? (
          <PressableScale onPress={onToggleConversations}>
            <XStack alignItems="center" justifyContent="center" width={36} height={36}>
              <Feather
                name={showingConversations ? "message-circle" : "list"}
                size={16}
                color={showingConversations ? theme.primary.val : theme.colorMuted.val}
              />
            </XStack>
          </PressableScale>
        ) : null}
        {messageCount > 0 && !showingConversations ? (
          <PressableScale onPress={onClear}>
            <XStack alignItems="center" justifyContent="center" width={36} height={36}>
              <Feather name="trash-2" size={15} color={theme.colorMuted.val} />
            </XStack>
          </PressableScale>
        ) : null}
        <PressableScale onPress={onClose}>
          <YStack width={36} height={36} alignItems="center" justifyContent="center">
            <Feather name="x" size={18} color={theme.colorMuted.val} />
          </YStack>
        </PressableScale>
      </XStack>
    </XStack>
  );
});
