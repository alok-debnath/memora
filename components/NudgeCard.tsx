import React from "react";
import { Feather } from "@/lib/icons";
import { PressableScale } from "./ui/PressableScale";
import { XStack, YStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import { appShadow } from "@/components/ui/themeHelpers";

interface NudgeCardProps {
  title: string;
  message: string;
  onDismiss: () => void;
  index?: number;
}

export function NudgeCard({ title, message, onDismiss }: NudgeCardProps) {
  const theme = useAppTheme();

  return (
    <PressableScale
      style={{
        width: 268,
        padding: 14,
        borderRadius: 16,
        borderWidth: 1,
        backgroundColor: theme.accent.val,
        borderColor: theme.borderColor.val,
        marginRight: 12,
        ...appShadow(theme.shadowColor.val, "xs"),
      }}
    >
      <XStack alignItems="center" gap={10} marginBottom={8}>
        <YStack
          width={28}
          height={28}
          borderRadius={10}
          backgroundColor={theme.primary.val + "18"}
          alignItems="center"
          justifyContent="center"
        >
          <Feather name="star" size={16} color={theme.primary.val} />
        </YStack>
        <Text
          flex={1}
          fontSize={14}
          fontFamily="$heading"
          fontWeight="600"
          color={theme.color.val}
          numberOfLines={1}
        >
          {title}
        </Text>
        <PressableScale
          onPress={onDismiss}
          style={{
            width: 28,
            height: 28,
            borderRadius: 10,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: theme.backgroundStrong.val,
          }}
        >
          <Feather name="x" size={16} color={theme.colorMuted.val} />
        </PressableScale>
      </XStack>
      <Text
        fontSize={13}
        fontFamily="$body"
        lineHeight={19}
        color={theme.colorMuted.val}
        numberOfLines={3}
      >
        {message}
      </Text>
    </PressableScale>
  );
}
