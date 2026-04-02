import React from "react";
import { YStack, Text } from "tamagui";

interface StatCardProps {
  emoji: string;
  count: number;
  label: string;
}

export function StatCard({ emoji, count, label }: StatCardProps) {
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
      shadowColor="$shadowColor"
      shadowOffset={{ width: 0, height: 10 }}
      shadowOpacity={0.06}
      shadowRadius={24}
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
