import React from "react";
import { Feather, type FeatherIconName } from "@/lib/icons";
import { YStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";

interface EmptyStateProps {
  icon: FeatherIconName;
  title: string;
  description: string;
}

export function EmptyState({ icon, title, description }: EmptyStateProps) {
  const theme = useAppTheme();
  return (
    <YStack
      alignItems="center"
      justifyContent="center"
      paddingVertical={56}
      paddingHorizontal={28}
      backgroundColor={theme.surfaceElevated.val}
      borderWidth={1}
      borderColor={theme.borderColor.val}
      borderRadius={28}
      gap={8}
    >
      <YStack
        width={78}
        height={78}
        borderRadius={39}
        backgroundColor={theme.primary.val + "16"}
        alignItems="center"
        justifyContent="center"
        marginBottom={8}
      >
        <Feather name={icon} size={32} color={theme.primary.val} />
      </YStack>
      <Text
        color={theme.color.val}
        fontSize={20}
        fontFamily="$heading"
        fontWeight="700"
        textAlign="center"
      >
        {title}
      </Text>
      <Text
        color={theme.colorMuted.val}
        fontSize={14}
        fontFamily="$body"
        textAlign="center"
        lineHeight={21}
        maxWidth={320}
      >
        {description}
      </Text>
    </YStack>
  );
}
