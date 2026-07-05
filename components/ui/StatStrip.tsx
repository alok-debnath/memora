import React from "react";
import { Text, XStack, YStack } from "tamagui";

import { useAppTheme } from "@/hooks/useAppTheme";

export type StatStripItem = {
  label: string;
  value: string | number;
  color?: string;
};

type StatStripProps = {
  items: StatStripItem[];
  accent?: string;
};

export function StatStrip({ items, accent }: StatStripProps) {
  const theme = useAppTheme();
  const fallbackColor = accent ?? theme.primary.val;

  return (
    <XStack
      gap={0}
      borderRadius={14}
      borderWidth={1}
      borderColor={theme.borderSubtle.val}
      backgroundColor={theme.backgroundStrong.val}
      overflow="hidden"
    >
      {items.map((stat, index) => {
        const color = stat.color ?? fallbackColor;
        return (
          <YStack
            key={`${stat.label}-${stat.value}`}
            flex={1}
            paddingHorizontal={10}
            paddingVertical={8}
            borderLeftWidth={index === 0 ? 0 : 1}
            borderLeftColor={theme.borderSubtle.val}
            gap={1}
          >
            <Text fontSize={15} fontFamily="$heading" fontWeight="700" color={color}>
              {stat.value}
            </Text>
            <Text fontSize={10} fontFamily="$body" color={theme.colorMuted.val}>
              {stat.label}
            </Text>
          </YStack>
        );
      })}
    </XStack>
  );
}
