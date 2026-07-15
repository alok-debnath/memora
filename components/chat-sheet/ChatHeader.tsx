import React from "react";
import { XStack, YStack, Text } from "tamagui";
import { Feather } from "@/lib/icons";
import { useAppTheme } from "@/hooks/useAppTheme";
import { withAlpha } from "@/components/ui/themeHelpers";
import { AppIconButton } from "@/components/ui/AppIconButton";

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
          <AppIconButton
            icon={showingConversations ? "message-circle" : "list"}
            label={showingConversations ? "Return to current chat" : "Show conversations"}
            onPress={onToggleConversations}
            variant={showingConversations ? "soft" : "ghost"}
            size="compact"
          />
        ) : null}
        {messageCount > 0 && !showingConversations ? (
          <AppIconButton
            icon="trash-2"
            label="Clear conversation"
            onPress={onClear}
            size="compact"
          />
        ) : null}
        <AppIconButton icon="x" label="Close chat" onPress={onClose} size="compact" />
      </XStack>
    </XStack>
  );
});
