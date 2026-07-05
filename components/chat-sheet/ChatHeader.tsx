import React from "react";
import { XStack, YStack, Text } from "tamagui";
import { Feather } from "@/lib/icons";
import { useAppTheme } from "@/hooks/useAppTheme";
import { withAlpha } from "@/components/ui/themeHelpers";
import { PressableScale } from "@/components/ui/PressableScale";

export const ChatHeader = React.memo(function ChatHeader({
  messageCount,
  onClear,
  onClose,
}: {
  messageCount: number;
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
      paddingTop={8}
      paddingBottom={12}
      borderBottomWidth={1}
      borderBottomColor={theme.borderSubtle.val}
    >
      <XStack flex={1} alignItems="center" gap={12}>
        <XStack
          width={38}
          height={38}
          borderRadius={19}
          alignItems="center"
          justifyContent="center"
          backgroundColor={withAlpha(theme.primary.val, "14")}
        >
          <Feather name="cpu" size={17} color={theme.primary.val} />
        </XStack>
        <YStack flex={1} minWidth={0}>
          <Text fontSize={17} fontFamily="$body" fontWeight="700" color="$color" numberOfLines={1}>
            Memora
          </Text>
          <Text fontSize={12} fontFamily="$body" color="$colorMuted" numberOfLines={1}>
            {messageCount === 0
              ? "Ask anything about your memories"
              : `${messageCount} ${messageCount === 1 ? "message" : "messages"}`}
          </Text>
        </YStack>
      </XStack>

      <XStack alignItems="center" gap={6}>
        {messageCount > 0 ? (
          <PressableScale onPress={onClear}>
            <XStack
              alignItems="center"
              gap={6}
              paddingHorizontal={10}
              height={36}
              borderRadius={18}
              borderWidth={1}
              borderColor="$borderColor"
              backgroundColor="$card"
            >
              <Feather name="trash-2" size={13} color={theme.colorMuted.val} />
              <Text fontSize={12} fontFamily="$body" color="$colorMuted">
                Clear
              </Text>
            </XStack>
          </PressableScale>
        ) : null}
        <PressableScale onPress={onClose}>
          <YStack
            width={36}
            height={36}
            borderRadius={18}
            alignItems="center"
            justifyContent="center"
            backgroundColor="$card"
            borderWidth={1}
            borderColor="$borderColor"
          >
            <Feather name="x" size={16} color={theme.color.val} />
          </YStack>
        </PressableScale>
      </XStack>
    </XStack>
  );
});
