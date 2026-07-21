/* Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V4 */
import React from "react";
import { ActivityIndicator, StyleSheet } from "react-native";
import { Text, XStack, YStack } from "tamagui";

import { Feather } from "@/lib/icons";
import { PressableScale } from "@/components/ui/PressableScale";
import { withAlpha } from "@/components/ui/themeHelpers";
import { control, radius, spacing } from "@/constants/uiTokens";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";

export function AdminPanel({
  children,
  padding = spacing.lg,
}: {
  children: React.ReactNode;
  padding?: number;
}) {
  const theme = useAppTheme();
  return (
    <YStack
      padding={padding}
      borderRadius={radius.md}
      borderWidth={StyleSheet.hairlineWidth}
      borderColor={theme.borderColor.val}
      backgroundColor={theme.card.val}
      overflow="hidden"
    >
      {children}
    </YStack>
  );
}

export function AdminSectionHeader({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: React.ReactNode;
}) {
  const theme = useAppTheme();
  return (
    <XStack alignItems="flex-start" justifyContent="space-between" gap={spacing.md} flexWrap="wrap">
      <YStack flex={1} minWidth={180} gap={2}>
        <Text
          fontSize={17}
          lineHeight={22}
          fontFamily="$heading"
          fontWeight="700"
          color={theme.color.val}
        >
          {title}
        </Text>
        {detail ? (
          <Text fontSize={12} lineHeight={17} color={theme.colorMuted.val}>
            {detail}
          </Text>
        ) : null}
      </YStack>
      {action}
    </XStack>
  );
}

export function AdminMetricGrid({ children }: { children: React.ReactNode }) {
  const responsive = useResponsiveLayout();
  return (
    <XStack gap={spacing.sm} flexWrap="wrap">
      {React.Children.map(children, (child) =>
        React.isValidElement(child)
          ? React.cloneElement(child as React.ReactElement<{ minWidth?: number }>, {
              minWidth: responsive.isCompact ? 145 : responsive.isMedium ? 180 : 200,
            })
          : child,
      )}
    </XStack>
  );
}

export type AdminDataMetric = { label: string; value: string; tone?: "default" | "danger" };

export function AdminDataRow({
  title,
  subtitle,
  metrics,
  action,
  selected,
  onPress,
  accessibilityLabel,
}: {
  title: string;
  subtitle?: string;
  metrics?: AdminDataMetric[];
  action?: React.ReactNode;
  selected?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const theme = useAppTheme();
  const responsive = useResponsiveLayout();
  const content = (
    <XStack
      minHeight={control.minimumHitSize}
      paddingVertical={spacing.md}
      paddingHorizontal={spacing.sm}
      alignItems={responsive.isCompact ? "flex-start" : "center"}
      gap={spacing.md}
      flexDirection={responsive.isCompact ? "column" : "row"}
      borderTopWidth={StyleSheet.hairlineWidth}
      borderColor={theme.borderColor.val}
      backgroundColor={selected ? withAlpha(theme.primary.val, "10") : "transparent"}
    >
      <YStack flex={1} minWidth={0} gap={2}>
        <Text
          fontSize={13}
          lineHeight={18}
          fontWeight="700"
          color={theme.color.val}
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text fontSize={11} lineHeight={16} color={theme.colorMuted.val} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </YStack>
      {metrics?.length ? (
        <XStack gap={spacing.lg} flexWrap="wrap" width={responsive.isCompact ? "100%" : undefined}>
          {metrics.map((metric) => (
            <YStack key={metric.label} minWidth={72} gap={1}>
              <Text
                fontSize={10}
                textTransform="uppercase"
                letterSpacing={0.5}
                color={theme.colorMuted.val}
              >
                {metric.label}
              </Text>
              <Text
                fontSize={12}
                fontWeight="700"
                color={metric.tone === "danger" ? theme.destructive.val : theme.color.val}
              >
                {metric.value}
              </Text>
            </YStack>
          ))}
        </XStack>
      ) : null}
      {action ? (
        <YStack alignSelf={responsive.isCompact ? "flex-end" : "center"}>{action}</YStack>
      ) : null}
    </XStack>
  );

  return onPress ? (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
    >
      {content}
    </PressableScale>
  ) : (
    content
  );
}

export function AdminLoadingState({ label = "Loading workspace" }: { label?: string }) {
  const theme = useAppTheme();
  return (
    <YStack minHeight={180} alignItems="center" justifyContent="center" gap={spacing.sm}>
      <ActivityIndicator color={theme.primary.val} />
      <Text fontSize={12} color={theme.colorMuted.val}>
        {label}
      </Text>
    </YStack>
  );
}

export function AdminEmptyState({
  title,
  detail,
  icon = "inbox",
}: {
  title: string;
  detail?: string;
  icon?: React.ComponentProps<typeof Feather>["name"];
}) {
  const theme = useAppTheme();
  return (
    <YStack paddingVertical={spacing.xl} alignItems="center" gap={spacing.sm}>
      <Feather name={icon} size={18} color={theme.colorMuted.val} />
      <Text fontSize={13} fontWeight="700" color={theme.color.val}>
        {title}
      </Text>
      {detail ? (
        <Text fontSize={11} color={theme.colorMuted.val}>
          {detail}
        </Text>
      ) : null}
    </YStack>
  );
}
