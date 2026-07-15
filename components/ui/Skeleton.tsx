import React, { useEffect } from "react";
import { type ViewStyle } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  useReducedMotion,
} from "react-native-reanimated";
import { XStack, YStack } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function Skeleton({ width = "100%", height = 16, borderRadius = 8, style }: SkeletonProps) {
  const theme = useAppTheme();
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = reduceMotion
      ? 0.5
      : withRepeat(
          withSequence(withTiming(0.7, { duration: 800 }), withTiming(0.3, { duration: 800 })),
          -1,
          true,
        );
  }, [opacity, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width: width as number,
          height,
          borderRadius,
          backgroundColor: theme.secondary.val,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

export function SkeletonCard() {
  return (
    <YStack padding={16} gap={12}>
      <Skeleton height={20} width="60%" />
      <Skeleton height={14} width="100%" />
      <Skeleton height={14} width="80%" />
      <XStack gap={8} marginTop={4}>
        <Skeleton height={24} width={60} borderRadius={12} />
        <Skeleton height={24} width={60} borderRadius={12} />
        <Skeleton height={24} width={60} borderRadius={12} />
      </XStack>
    </YStack>
  );
}
