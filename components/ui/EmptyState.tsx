import React from "react";
import { Feather } from "@expo/vector-icons";
import { YStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";

interface EmptyStateProps {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  description: string;
}

export function EmptyState({ icon, title, description }: EmptyStateProps) {
  const theme = useAppTheme();
  return (
    <YStack alignItems="center" justifyContent="center" paddingVertical={60} paddingHorizontal={40}>
      <YStack
        width={72}
        height={72}
        borderRadius={36}
        backgroundColor="$accent"
        alignItems="center"
        justifyContent="center"
        marginBottom={20}
      >
        <Feather name={icon} size={32} color={theme.primary.val} />
      </YStack>
      <Text
        color="$color"
        fontSize={18}
        fontFamily="$body"
        fontWeight="600"
        textAlign="center"
        marginBottom={8}
      >
        {title}
      </Text>
      <Text color="$colorMuted" fontSize={14} fontFamily="$body" textAlign="center" lineHeight={20}>
        {description}
      </Text>
    </YStack>
  );
}
