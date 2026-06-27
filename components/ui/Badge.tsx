import React from "react";
import { Feather, type FeatherIconName } from "@/lib/icons";
import { XStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import { getStatusColors, withAlpha, type StatusTone } from "@/components/ui/themeHelpers";

interface BadgeProps {
  label: string;
  tone?: StatusTone;
  color?: string;
  small?: boolean;
  icon?: FeatherIconName;
}

export function Badge({ label, tone = "accent", color, small, icon }: BadgeProps) {
  const theme = useAppTheme();
  const semanticColors = getStatusColors(theme, tone);
  const bgColor = color ? withAlpha(color, "20") : semanticColors.background;
  const borderColor = color ? withAlpha(color, "2B") : semanticColors.border;
  const textColor = color ?? semanticColors.text;

  return (
    <XStack
      backgroundColor={bgColor}
      borderColor={borderColor}
      borderWidth={1}
      paddingHorizontal={small ? 8 : 10}
      paddingVertical={small ? 2 : 4}
      borderRadius={20}
      alignItems="center"
      gap={icon ? 5 : 0}
    >
      {icon ? <Feather name={icon} size={small ? 10 : 12} color={textColor} /> : null}
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
