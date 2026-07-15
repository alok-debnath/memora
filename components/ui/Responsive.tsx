import React from "react";
import { type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import { Text, XStack, YStack } from "tamagui";

import { useAppTheme } from "@/hooks/useAppTheme";
import { getAdaptiveColumnCount, shouldSplitWorkspace } from "@/hooks/useResponsiveLayout";
import { radius, spacing } from "@/constants/uiTokens";
import type { StatStripItem } from "@/components/ui/StatStrip";

type WorkspaceComposition = "primary-aside" | "balanced";

/**
 * A container-measured page composition. Unlike a window breakpoint, this keeps
 * responding when the navigation shell or docked chat changes the available width.
 */
export function WorkspaceSplit({
  children,
  aside,
  composition = "primary-aside",
  asideWidth = 320,
  gap = spacing.lg,
  splitAt = 820,
  asideFirstOnCompact = false,
  asidePosition = "end",
  fill = false,
  style,
}: {
  children: React.ReactNode;
  aside: React.ReactNode;
  composition?: WorkspaceComposition;
  asideWidth?: number;
  gap?: number;
  splitAt?: number;
  asideFirstOnCompact?: boolean;
  asidePosition?: "start" | "end";
  fill?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const [width, setWidth] = React.useState(0);
  const onLayout = React.useCallback((event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  }, []);
  const split = shouldSplitWorkspace(width, splitAt);

  if (aside === null || aside === undefined || aside === false) {
    return (
      <YStack width="100%" flex={fill ? 1 : undefined} style={style}>
        {children}
      </YStack>
    );
  }
  const orderedChildren = asideFirstOnCompact ? [aside, children] : [children, aside];

  if (!split) {
    return (
      <YStack onLayout={onLayout} gap={gap} width="100%" flex={fill ? 1 : undefined} style={style}>
        {orderedChildren.map((child, index) => (
          <YStack key={index} width="100%" flex={fill && index === 0 ? 1 : undefined}>
            {child}
          </YStack>
        ))}
      </YStack>
    );
  }

  const primarySlot = (
    <YStack
      flex={composition === "balanced" ? 1 : 2}
      minWidth={0}
      height={fill ? "100%" : undefined}
    >
      {children}
    </YStack>
  );
  const asideSlot = (
    <YStack
      width={composition === "primary-aside" ? asideWidth : undefined}
      flex={composition === "balanced" ? 1 : undefined}
      flexShrink={0}
      minWidth={0}
      height={fill ? "100%" : undefined}
    >
      {aside}
    </YStack>
  );

  return (
    <XStack
      onLayout={onLayout}
      gap={gap}
      width="100%"
      alignItems={fill ? "stretch" : "flex-start"}
      flex={fill ? 1 : undefined}
      style={style}
    >
      {asidePosition === "start" ? asideSlot : primarySlot}
      {asidePosition === "start" ? primarySlot : asideSlot}
    </XStack>
  );
}

/** @deprecated Prefer WorkspaceSplit for new screens. */
export function AdaptiveSplit({
  children,
  aside,
  asideWidth = 320,
  gap = spacing.lg,
  collapseBelow = "expanded",
}: {
  children: React.ReactNode;
  aside: React.ReactNode;
  asideWidth?: number;
  gap?: number;
  collapseBelow?: "medium" | "expanded" | "wide";
}) {
  const splitAt = collapseBelow === "medium" ? 600 : collapseBelow === "wide" ? 1040 : 820;
  return (
    <WorkspaceSplit aside={aside} asideWidth={asideWidth} gap={gap} splitAt={splitAt}>
      {children}
    </WorkspaceSplit>
  );
}

export function SectionGrid({
  children,
  minimumColumnWidth = 280,
  maximumColumns = 3,
  gap = spacing.lg,
  featuredFirst = false,
  fullWidthIndices = [],
  style,
}: {
  children: React.ReactNode;
  minimumColumnWidth?: number;
  maximumColumns?: number;
  gap?: number;
  /** Lets the identity/summary panel establish hierarchy above supporting columns. */
  featuredFirst?: boolean;
  /** Explicitly promotes important sections across every active column. */
  fullWidthIndices?: number[];
  style?: StyleProp<ViewStyle>;
}) {
  const [width, setWidth] = React.useState(0);
  const columns = getAdaptiveColumnCount(width, minimumColumnWidth, maximumColumns, gap);
  const onLayout = React.useCallback((event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  }, []);
  const itemWidth = width > 0 ? Math.max(0, (width - gap * (columns - 1)) / columns) : "100%";

  return (
    <XStack onLayout={onLayout} flexWrap="wrap" gap={gap} width="100%" style={style}>
      {React.Children.map(children, (child, index) => (
        <YStack
          key={index}
          width={
            columns > 1 && (fullWidthIndices.includes(index) || (featuredFirst && index === 0))
              ? "100%"
              : itemWidth
          }
          minWidth={0}
        >
          {child}
        </YStack>
      ))}
    </XStack>
  );
}

/** @deprecated Prefer the semantically named SectionGrid. */
export const AdaptiveGrid = SectionGrid;

export function ResponsiveStatGrid({
  items,
  minimumColumnWidth = 150,
  maximumColumns = 4,
}: {
  items: StatStripItem[];
  minimumColumnWidth?: number;
  maximumColumns?: number;
}) {
  const theme = useAppTheme();

  return (
    <SectionGrid
      minimumColumnWidth={minimumColumnWidth}
      maximumColumns={maximumColumns}
      gap={spacing.sm}
    >
      {items.map((item) => (
        <YStack
          key={item.label}
          minHeight={76}
          paddingHorizontal={spacing.md}
          paddingVertical={spacing.sm}
          justifyContent="center"
          borderRadius={radius.sm}
          borderWidth={1}
          borderColor={theme.borderSubtle.val}
          backgroundColor={theme.backgroundStrong.val}
        >
          <Text
            fontSize={20}
            lineHeight={24}
            fontFamily="$heading"
            fontWeight="700"
            color={item.color ?? theme.primary.val}
          >
            {item.value}
          </Text>
          <Text fontSize={11} lineHeight={16} fontFamily="$body" color={theme.colorMuted.val}>
            {item.label}
          </Text>
        </YStack>
      ))}
    </SectionGrid>
  );
}
