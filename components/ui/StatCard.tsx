import React from "react";
import { YStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import { appShadow } from "@/components/ui/themeHelpers";

interface StatCardProps {
  emoji: string;
  count: number;
  label: string;
}

export function StatCard({ emoji, count, label }: StatCardProps) {
  const theme = useAppTheme();

  return (
    <YStack
      flex={1}
      borderRadius={22}
      paddingVertical={16}
      paddingHorizontal={14}
      borderWidth={1}
      gap={6}
      backgroundColor={theme.surfaceElevated.val}
      borderColor={theme.borderColor.val}
      style={appShadow(theme.shadowColor.val, "xs")}
    >
      <Text fontSize={22}>{emoji}</Text>
      <Text fontSize={24} fontFamily="$heading" fontWeight="700" color={theme.color.val}>
        {count}
      </Text>
      <Text fontSize={12} fontFamily="$body" color={theme.colorMuted.val}>
        {label}
      </Text>
    </YStack>
  );
}
