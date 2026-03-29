import React from "react";
import { XStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";

interface BadgeProps {
  label: string;
  color?: string;
  small?: boolean;
}

export function Badge({ label, color, small }: BadgeProps) {
  const theme = useAppTheme();
  const bgColor = color ? `${color}20` : theme.accent.val;
  const textColor = color ?? theme.primary.val;

  return (
    <XStack
      backgroundColor={bgColor}
      paddingHorizontal={small ? 8 : 10}
      paddingVertical={small ? 2 : 4}
      borderRadius={20}
    >
      <Text
        color={textColor}
        fontSize={small ? 10 : 12}
        fontFamily="$body"
        fontWeight="500"
        numberOfLines={1}
      >
        {label}
      </Text>
    </XStack>
  );
}
