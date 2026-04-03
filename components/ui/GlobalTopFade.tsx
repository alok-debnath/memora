import React from "react";
import { Platform, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { YStack } from "tamagui";

import { useThemeStore } from "@/store/theme";
import { selectSheetStack, useUIStore } from "@/store/ui";

// Reanimated's createAnimatedComponent + entering props don't work with
// LinearGradient on web — use a plain gradient there instead.
const AnimatedLinearGradient = Platform.OS !== "web"
  ? Animated.createAnimatedComponent(LinearGradient)
  : LinearGradient;

export function GlobalTopFadeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  if (Platform.OS === "web") {
    return <>{children}</>;
  }

  return (
    <>
      <GlobalTopFadeOverlay />
      {children}
    </>
  );
}

function GlobalTopFadeOverlay() {
  const insets = useSafeAreaInsets();
  const resolvedMode = useThemeStore((state) => state.resolvedMode);
  const isDark = resolvedMode === "dark";
  const sheetStack = useUIStore(selectSheetStack);
  const webInset = Platform.OS === "web" ? 10 : 0;
  const fadeHeight = Math.max(
    insets.top + webInset + 22,
    Platform.OS === "web" ? 30 : 44
  );
  const hasSheetBackdrop = sheetStack.length > 0;
  // Use explicit colors keyed to resolvedMode so the gradient always matches
  // the actual theme, regardless of Tamagui's useTheme() render timing.
  const bg = isDark ? "#18120D" : "#F7F1E8";
  const colors = hasSheetBackdrop
    ? ([
        "rgba(0,0,0,0.5)",
        "rgba(0,0,0,0.42)",
        "rgba(0,0,0,0.28)",
        "rgba(0,0,0,0.14)",
        "rgba(0,0,0,0)",
      ] as const)
    : [
        bg,
        bg + "D8",
        bg + "8A",
        bg + "36",
        bg + "00",
      ] as const;
  const locations = hasSheetBackdrop
    ? ([0, 0.24, 0.5, 0.76, 1] as const)
    : ([0, 0.34, 0.62, 0.82, 1] as const);

  return (
    <YStack pointerEvents="none" style={StyleSheet.absoluteFill} zIndex={1}>
      <AnimatedLinearGradient
        {...(Platform.OS !== "web" ? { entering: FadeIn.duration(260) } : {})}
        colors={colors}
        locations={locations}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{ height: fadeHeight }}
      />
    </YStack>
  );
}
