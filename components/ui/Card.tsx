import React from "react";
import { type ViewStyle } from "react-native";
import { YStack } from "tamagui";

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  noPadding?: boolean;
}

export function Card({ children, style, noPadding }: CardProps) {
  return (
    <YStack
      backgroundColor="$card"
      borderColor="$borderColor"
      borderWidth={1}
      borderRadius={26}
      padding={noPadding ? 0 : 18}
      shadowColor="$shadowColor"
      shadowOffset={{ width: 0, height: 14 }}
      shadowOpacity={0.08}
      shadowRadius={30}
      style={style}
    >
      {children}
    </YStack>
  );
}
