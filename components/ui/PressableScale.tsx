import React from "react";
import {
  Platform,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useReducedMotion,
  withTiming,
} from "react-native-reanimated";
import { motion } from "@/constants/motion";
import { useAppTheme } from "@/hooks/useAppTheme";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface PressableScaleProps extends PressableProps {
  scale?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

export function PressableScale({ scale = 0.985, style, children, ...props }: PressableScaleProps) {
  const scaleValue = useSharedValue(1);
  const reduceMotion = useReducedMotion();
  const isDisabled = props.disabled;
  const theme = useAppTheme();
  const [focused, setFocused] = React.useState(false);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleValue.value }],
  }));

  return (
    <AnimatedPressable
      {...props}
      accessibilityRole={props.accessibilityRole ?? (props.onPress ? "button" : undefined)}
      style={[
        animatedStyle,
        style,
        Platform.OS === "web" && focused
          ? ({
              outlineStyle: "solid",
              outlineWidth: 2,
              outlineColor: theme.focusRing.val,
              outlineOffset: 2,
            } as ViewStyle)
          : null,
      ]}
      onFocus={(event) => {
        setFocused(true);
        props.onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        props.onBlur?.(event);
      }}
      onPressIn={(e) => {
        if (isDisabled) {
          props.onPressIn?.(e);
          return;
        }
        scaleValue.value = reduceMotion ? 1 : withTiming(scale, motion.pressIn);
        props.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        if (isDisabled) {
          props.onPressOut?.(e);
          return;
        }
        scaleValue.value = reduceMotion ? 1 : withTiming(1, motion.pressOut);
        props.onPressOut?.(e);
      }}
    >
      {children}
    </AnimatedPressable>
  );
}
