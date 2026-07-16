import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { bottomNavigationLayout } from "@/constants/navigationLayout";
import { spacing } from "@/constants/uiTokens";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";

/**
 * Returns the bottom padding needed for content to clear the
 * floating liquid-glass tab bar on the current device.
 *
 * Scroll-based AppScreen pages receive this automatically. `noScroll` pages
 * must apply it to their own VirtualizedList content container or focus lane.
 */
export function useTabBarBottomPadding(): number {
  const insets = useSafeAreaInsets();
  const { isCompact } = useResponsiveLayout();
  const safeBottom =
    Platform.OS === "android"
      ? Math.max(insets.bottom, bottomNavigationLayout.androidInsetFloor)
      : insets.bottom + bottomNavigationLayout.insetGap;

  if (!isCompact) return spacing.xxl + insets.bottom;

  return (
    bottomNavigationLayout.barHeight +
    bottomNavigationLayout.bottomMargin +
    bottomNavigationLayout.fadeHeight +
    safeBottom
  );
}
