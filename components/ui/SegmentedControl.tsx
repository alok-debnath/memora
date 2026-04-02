import React, { useCallback, useEffect, useState } from "react";
import { LayoutChangeEvent, Pressable } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { XStack, YStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";

export interface SegmentOption<T extends string = string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

interface SegmentedControlProps<T extends string = string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** When true the control has no bottom radius, attaching flush to content below */
  attached?: boolean;
}

const PADDING = 3;
const INDICATOR_TIMING = { duration: 180 } as const;

export function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  attached = false,
}: SegmentedControlProps<T>) {
  const theme = useAppTheme();
  const [containerWidth, setContainerWidth] = useState(0);
  const [fallbackSegmentWidth, setFallbackSegmentWidth] = useState(0);
  const activeIndex = options.findIndex((o) => o.value === value);
  const segmentWidth =
    containerWidth > 0 ? (containerWidth - PADDING * 2) / options.length : 0;
  const effectiveSegmentWidth = segmentWidth > 0 ? segmentWidth : fallbackSegmentWidth;

  const indicatorX = useSharedValue(0);

  useEffect(() => {
    if (effectiveSegmentWidth > 0 && activeIndex >= 0) {
      indicatorX.value = withTiming(
        activeIndex * effectiveSegmentWidth,
        INDICATOR_TIMING,
      );
    }
  }, [activeIndex, effectiveSegmentWidth, indicatorX]);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width);
  }, []);

  const handleFirstSegmentLayout = useCallback(
    (e: LayoutChangeEvent) => {
      if (segmentWidth > 0 || fallbackSegmentWidth > 0) return;
      const width = e.nativeEvent.layout.width;
      if (width > 0) {
        setFallbackSegmentWidth(width);
      }
    },
    [fallbackSegmentWidth, segmentWidth],
  );

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    width: effectiveSegmentWidth,
  }));

  return (
    <XStack
      onLayout={handleLayout}
      backgroundColor="$secondary"
      borderTopLeftRadius={14}
      borderTopRightRadius={14}
      borderBottomLeftRadius={attached ? 0 : 14}
      borderBottomRightRadius={attached ? 0 : 14}
      padding={PADDING}
      position="relative"
      alignSelf="stretch"
      minHeight={38}
    >
      {/* Sliding pill indicator */}
      {effectiveSegmentWidth > 0 && (
        <Animated.View
          style={[
            {
              position: "absolute",
              top: PADDING,
              left: PADDING,
              bottom: PADDING,
              borderRadius: 11,
              backgroundColor: theme.card.val,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.1,
              shadowRadius: 4,
              elevation: 2,
            },
            indicatorStyle,
          ]}
        />
      )}

      {/* Option buttons */}
      {options.map(({ value: optValue, label, icon }, idx) => {
        const isActive = optValue === value;
        return (
          <Pressable
            key={optValue}
            style={{ flex: 1 }}
            onPress={() => onChange(optValue)}
            hitSlop={4}
            onLayout={idx === 0 ? handleFirstSegmentLayout : undefined}
          >
            <XStack
              flex={1}
              paddingVertical={7}
              alignItems="center"
              justifyContent="center"
              gap={5}
              borderRadius={11}
              backgroundColor={
                effectiveSegmentWidth === 0 && isActive
                  ? theme.card.val
                  : "transparent"
              }
            >
              {icon}
              <Text
                fontSize={13}
                fontFamily="$body"
                fontWeight={isActive ? "600" : "500"}
                color={isActive ? "$color" : "$colorMuted"}
              >
                {label}
              </Text>
            </XStack>
          </Pressable>
        );
      })}
    </XStack>
  );
}
