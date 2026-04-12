import React, { useState, type ReactNode } from "react";
import { XStack, YStack, Text } from "tamagui";

interface SheetHeaderProps {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
  paddingHorizontal?: number;
}

export function SheetHeader({
  title,
  subtitle,
  left,
  right,
  paddingHorizontal = 20,
}: SheetHeaderProps) {
  const [leftWidth, setLeftWidth] = useState(0);
  const [rightWidth, setRightWidth] = useState(0);
  const safePad = Math.max(leftWidth, rightWidth);

  return (
    <XStack
      minHeight={44}
      paddingVertical={10}
      paddingHorizontal={paddingHorizontal}
      alignItems="center"
    >
      <XStack minWidth={safePad} justifyContent="flex-start" alignItems="center">
        <XStack onLayout={(e) => setLeftWidth(e.nativeEvent.layout.width)}>{left ?? null}</XStack>
      </XStack>

      <YStack flex={1} alignItems="center" justifyContent="center">
        <Text
          color="$color"
          fontSize={18}
          fontFamily="$body"
          fontWeight="600"
          textAlign="center"
          numberOfLines={2}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            color="$colorMuted"
            fontSize={12}
            fontFamily="$body"
            fontWeight="500"
            textAlign="center"
            marginTop={2}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        ) : null}
      </YStack>

      <XStack minWidth={safePad} justifyContent="flex-end" alignItems="center">
        <XStack onLayout={(e) => setRightWidth(e.nativeEvent.layout.width)}>{right ?? null}</XStack>
      </XStack>
    </XStack>
  );
}
