import React from "react";
import { BlurView } from "expo-blur";
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import {
  Platform,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { useAppTheme } from "@/hooks/useAppTheme";
import { useThemeStore } from "@/store/theme";
import { appShadow, withAlpha, type AppShadowLevel } from "@/components/ui/themeHelpers";

type GlassSurfaceProps = {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  radius?: number;
  intensity?: number;
  interactive?: boolean;
  border?: boolean;
  shadowLevel?: AppShadowLevel | false;
  onLayout?: (event: LayoutChangeEvent) => void;
};

function canUseNativeLiquidGlass() {
  return Platform.OS === "ios" && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
}

export function GlassSurface({
  children,
  style,
  contentStyle,
  radius = 18,
  intensity = 12,
  interactive = false,
  border = true,
  shadowLevel = "xs",
  onLayout,
}: GlassSurfaceProps) {
  const theme = useAppTheme();
  const resolvedMode = useThemeStore((state) => state.resolvedMode);
  const isDark = resolvedMode === "dark";
  const useLiquidGlass = canUseNativeLiquidGlass();
  const fallbackFill = isDark
    ? withAlpha(theme.backgroundStrong.val, "D9")
    : withAlpha(theme.surfaceElevated.val, "F0");
  const overlayFill = isDark
    ? withAlpha(theme.background.val, "18")
    : withAlpha(theme.card.val, "18");

  return (
    <View
      onLayout={onLayout}
      style={[
        styles.shell,
        {
          borderRadius: radius,
        },
        shadowLevel ? appShadow(theme.shadowColor.val, shadowLevel) : null,
        style,
      ]}
    >
      <View style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: "hidden" }]}>
        {useLiquidGlass ? (
          <GlassView
            style={StyleSheet.absoluteFill}
            glassEffectStyle={{ style: "regular", animate: true, animationDuration: 0.24 }}
            colorScheme={isDark ? "dark" : "light"}
            isInteractive={interactive}
          />
        ) : Platform.OS === "web" ? (
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: fallbackFill,
                // @ts-ignore web-only CSS property
                backdropFilter: `blur(${Math.round(intensity * 1.8)}px) saturate(150%)`,
              },
            ]}
          />
        ) : (
          <>
            <BlurView
              style={StyleSheet.absoluteFill}
              intensity={intensity}
              tint={isDark ? "dark" : "light"}
            />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: fallbackFill }]} />
          </>
        )}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: overlayFill }]} />
      </View>

      {border ? (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            styles.border,
            {
              borderRadius: radius,
              borderColor: isDark
                ? withAlpha(theme.borderColor.val, "82")
                : withAlpha(theme.borderStrong.val, "45"),
            },
          ]}
        />
      ) : null}

      <View style={[styles.content, contentStyle]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    overflow: "hidden",
  },
  border: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  content: {
    position: "relative",
    zIndex: 1,
  },
});
