import React from "react";
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from "react-native-reanimated";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const PRESS_ANIMATION = { duration: 120 } as const;

interface PressableScaleProps extends PressableProps {
  scale?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

export function PressableScale({ scale = 0.96, style, children, ...props }: PressableScaleProps) {
  const scaleValue = useSharedValue(1);
  const isDisabled = props.disabled;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleValue.value }],
  }));

  return (
    <AnimatedPressable
      {...props}
      style={[animatedStyle, style]}
      onPressIn={(e) => {
        if (isDisabled) {
          props.onPressIn?.(e);
          return;
        }
        scaleValue.value = withTiming(scale, PRESS_ANIMATION);
        props.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        if (isDisabled) {
          props.onPressOut?.(e);
          return;
        }
        scaleValue.value = withTiming(1, PRESS_ANIMATION);
        props.onPressOut?.(e);
      }}
    >
      {children}
    </AnimatedPressable>
  );
}
