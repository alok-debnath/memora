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
      alignItems="center"
      justifyContent="center"
      borderRadius={16}
      paddingVertical={14}
      paddingHorizontal={8}
      borderWidth={0.5}
      gap={2}
      backgroundColor="$card"
      borderColor="$borderColor"
    >
      <Text fontSize={24} marginBottom={2}>{emoji}</Text>
      <Text fontSize={20} fontFamily="$body" fontWeight="700" color="$color">{count}</Text>
      <Text fontSize={12} fontFamily="$body" marginTop={1} color="$colorMuted">{label}</Text>
    </YStack>
  );
}
