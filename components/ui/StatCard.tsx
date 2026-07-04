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
      backgroundColor="$card"
      borderColor="$borderColor"
      style={appShadow(theme.shadowColor.val, "sm")}
    >
      <Text fontSize={22}>{emoji}</Text>
      <Text fontSize={24} fontFamily="$heading" fontWeight="700" color="$color">
        {count}
      </Text>
      <Text fontSize={12} fontFamily="$body" color="$colorMuted">
        {label}
      </Text>
    </YStack>
  );
}
