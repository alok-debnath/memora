import React from "react";
import type { ViewProps } from "react-native";
import { Feather, type FeatherIconName } from "@/lib/icons";
import { YStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";

interface EmptyStateProps {
  icon: FeatherIconName;
  title: string;
  description: string;
  eyebrow?: string;
  action?: React.ReactNode;
  size?: "compact" | "default";
  variant?: "card" | "plain";
  style?: ViewProps["style"];
  onLayout?: ViewProps["onLayout"];
}

export function EmptyState({
  icon,
  title,
  description,
  eyebrow,
  action,
  size = "default",
  variant = "card",
  style,
  onLayout,
}: EmptyStateProps) {
  const theme = useAppTheme();
  const compact = size === "compact";
  return (
    <YStack
      onLayout={onLayout}
      alignItems="center"
      justifyContent="center"
      paddingVertical={compact ? 24 : 56}
      paddingHorizontal={compact ? 20 : 28}
      backgroundColor={variant === "card" ? theme.surfaceElevated.val : "transparent"}
      borderWidth={variant === "card" ? 1 : 0}
      borderColor={variant === "card" ? theme.borderColor.val : "transparent"}
      borderRadius={compact ? 20 : 28}
      gap={compact ? 6 : 8}
      style={style}
    >
      <YStack
        width={compact ? 48 : 78}
        height={compact ? 48 : 78}
        borderRadius={compact ? 16 : 39}
        backgroundColor={theme.primary.val + "16"}
        alignItems="center"
        justifyContent="center"
        marginBottom={compact ? 4 : 8}
      >
        <Feather name={icon} size={compact ? 20 : 32} color={theme.primary.val} />
      </YStack>
      {eyebrow ? (
        <Text
          color={theme.primary.val}
          fontSize={10}
          fontFamily="$utility"
          fontWeight="700"
          textTransform="uppercase"
          letterSpacing={1}
          textAlign="center"
        >
          {eyebrow}
        </Text>
      ) : null}
      <Text
        color={theme.color.val}
        fontSize={compact ? 18 : 20}
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
      {action ? <YStack marginTop={compact ? 10 : 14}>{action}</YStack> : null}
    </YStack>
  );
}
