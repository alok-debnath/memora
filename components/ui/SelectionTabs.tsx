import React, { useCallback, useEffect, useMemo, useState } from "react";
import { LayoutChangeEvent, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Text, XStack, YStack } from "tamagui";

import { appShadow, withAlpha } from "@/components/ui/themeHelpers";
import { motion } from "@/constants/motion";
import { control, radius, spacing, typeScale } from "@/constants/uiTokens";
import { useAppTheme } from "@/hooks/useAppTheme";
import { PressableScale } from "@/components/ui/PressableScale";

export type SelectionTabOption<T extends string = string> = {
  value: T;
  label: string;
  compactLabel?: string;
  icon?: React.ReactNode;
  count?: number;
  disabled?: boolean;
};

type SelectionTabsProps<T extends string = string> = {
  options: readonly SelectionTabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  orientation?: "horizontal" | "vertical";
  size?: "compact" | "default";
  attached?: boolean;
  showCompactLabels?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
};

const TRACK_PADDING = 3;
const VERTICAL_GAP = spacing.xs;

export function SelectionTabs<T extends string = string>({
  options,
  value,
  onChange,
  orientation = "horizontal",
  size = "default",
  attached = false,
  showCompactLabels = false,
  style,
  accessibilityLabel,
}: SelectionTabsProps<T>) {
  const theme = useAppTheme();
  const reduceMotion = useReducedMotion();
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const activeIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const itemHeight = size === "compact" ? control.compactHeight : control.defaultHeight;
  const horizontalWidth =
    containerSize.width > 0 ? (containerSize.width - TRACK_PADDING * 2) / options.length : 0;
  const indicatorOffset = useSharedValue(0);

  useEffect(() => {
    const unit = orientation === "horizontal" ? horizontalWidth : itemHeight + VERTICAL_GAP;
    if (unit <= 0) return;
    const destination = activeIndex * unit;
    indicatorOffset.value = reduceMotion ? destination : withTiming(destination, motion.selection);
  }, [activeIndex, horizontalWidth, indicatorOffset, itemHeight, orientation, reduceMotion]);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setContainerSize((current) =>
      current.width === width && current.height === height ? current : { width, height },
    );
  }, []);

  const indicatorStyle = useAnimatedStyle(() => ({
    opacity: orientation === "vertical" || horizontalWidth > 0 ? 1 : 0,
    transform:
      orientation === "horizontal"
        ? [{ translateX: indicatorOffset.value }]
        : [{ translateY: indicatorOffset.value }],
  }));

  const trackStyle = useMemo<ViewStyle>(
    () => ({
      flexDirection: orientation === "horizontal" ? "row" : "column",
      gap: orientation === "vertical" ? VERTICAL_GAP : 0,
    }),
    [orientation],
  );

  const indicatorGeometry: ViewStyle =
    orientation === "horizontal"
      ? {
          top: TRACK_PADDING,
          bottom: TRACK_PADDING,
          left: TRACK_PADDING,
          width: horizontalWidth,
        }
      : {
          top: 0,
          left: 0,
          right: 0,
          height: itemHeight,
        };

  return (
    <XStack
      onLayout={handleLayout}
      accessibilityLabel={accessibilityLabel}
      position="relative"
      alignSelf="stretch"
      minHeight={orientation === "horizontal" ? itemHeight + TRACK_PADDING * 2 : undefined}
      padding={orientation === "horizontal" ? TRACK_PADDING : 0}
      borderWidth={orientation === "horizontal" ? 1 : 0}
      borderColor={theme.borderSubtle.val}
      borderTopLeftRadius={radius.md}
      borderTopRightRadius={radius.md}
      borderBottomLeftRadius={attached ? 0 : radius.md}
      borderBottomRightRadius={attached ? 0 : radius.md}
      backgroundColor={orientation === "horizontal" ? theme.backgroundStrong.val : "transparent"}
      style={[trackStyle, style]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            borderRadius: radius.sm,
            backgroundColor:
              orientation === "horizontal" ? theme.surfaceElevated.val : theme.surfaceAccent.val,
            borderWidth: 1,
            borderColor:
              orientation === "horizontal"
                ? theme.borderColor.val
                : withAlpha(theme.primary.val, "28"),
            ...(orientation === "horizontal" && horizontalWidth > 0
              ? appShadow(theme.shadowColor.val, "xs")
              : null),
          },
          indicatorGeometry,
          indicatorStyle,
        ]}
      />

      {options.map((option) => {
        const active = option.value === value;
        const label = showCompactLabels ? (option.compactLabel ?? option.label) : option.label;
        return (
          <PressableScale
            key={option.value}
            onPress={() => !option.disabled && onChange(option.value)}
            disabled={option.disabled}
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityState={{ selected: active, disabled: option.disabled }}
            hitSlop={Math.max(0, (control.minimumHitSize - itemHeight) / 2)}
            style={{
              flex: orientation === "horizontal" ? 1 : undefined,
              minWidth: 0,
              height: itemHeight,
              opacity: option.disabled ? 0.42 : 1,
              zIndex: 1,
            }}
          >
            <XStack
              flex={1}
              minWidth={0}
              paddingHorizontal={size === "compact" ? spacing.sm : spacing.md}
              alignItems="center"
              justifyContent={orientation === "horizontal" ? "center" : "flex-start"}
              gap={spacing.xs}
              borderRadius={radius.sm}
            >
              {option.icon}
              <Text
                flexShrink={1}
                numberOfLines={1}
                fontFamily="$body"
                fontSize={size === "compact" ? typeScale.metadata : typeScale.control}
                fontWeight={active ? "700" : "500"}
                color={active ? theme.color.val : theme.colorMuted.val}
              >
                {label}
              </Text>
              {typeof option.count === "number" && option.count > 0 ? (
                <YStack
                  minWidth={18}
                  height={18}
                  paddingHorizontal={4}
                  borderRadius={radius.pill}
                  alignItems="center"
                  justifyContent="center"
                  backgroundColor={active ? theme.primary.val : theme.secondary.val}
                >
                  <Text
                    fontFamily="$utility"
                    fontSize={9}
                    fontWeight="700"
                    color={active ? theme.textInverse.val : theme.colorMuted.val}
                  >
                    {option.count > 99 ? "99+" : option.count}
                  </Text>
                </YStack>
              ) : null}
            </XStack>
          </PressableScale>
        );
      })}
    </XStack>
  );
}
