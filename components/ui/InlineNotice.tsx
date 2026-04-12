import React from "react";
import { Feather } from "@expo/vector-icons";
import { XStack, YStack, Text } from "tamagui";

import { useAppTheme } from "@/hooks/useAppTheme";
import { getStatusColors, type StatusTone } from "@/components/ui/themeHelpers";

type InlineNoticeProps = {
  tone?: StatusTone;
  icon?: keyof typeof Feather.glyphMap;
  title?: string;
  description: string;
};

export function InlineNotice({ tone = "neutral", icon, title, description }: InlineNoticeProps) {
  const theme = useAppTheme();
  const colors = getStatusColors(theme, tone);

  return (
    <XStack
      gap={12}
      alignItems="flex-start"
      padding={14}
      borderRadius={18}
      backgroundColor={colors.background}
      borderWidth={1}
      borderColor={colors.border}
    >
      {icon ? (
        <XStack
          width={28}
          height={28}
          borderRadius={10}
          alignItems="center"
          justifyContent="center"
          backgroundColor={colors.border}
          marginTop={1}
        >
          <Feather name={icon} size={14} color={colors.text} />
        </XStack>
      ) : null}
      <YStack flex={1} gap={title ? 2 : 0}>
        {title ? (
          <Text fontSize={13} fontFamily="$body" fontWeight="700" color={colors.text}>
            {title}
          </Text>
        ) : null}
        <Text fontSize={13} lineHeight={19} color={colors.text}>
          {description}
        </Text>
      </YStack>
    </XStack>
  );
}
