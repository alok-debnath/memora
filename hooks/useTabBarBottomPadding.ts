import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Returns the bottom padding needed for content to clear the
 * floating liquid-glass tab bar on the current device.
 *
 * BAR_H (60) + BAR_BOTTOM_MARGIN (14) + FADE_H (80) + safe-area bottom
 * gives the full container height; content should clear the visible pill
 * plus the gradient fade above it.
 */
export function useTabBarBottomPadding(): number {
  const insets = useSafeAreaInsets();
  // On Android raw insets can be 0 even with gesture bar – add a 8px floor
  const safeBottom = Platform.OS === "android" ? Math.max(insets.bottom, 8) : insets.bottom;
  // 60 (bar) + 14 (float margin) + 80 (fade) + safeBottom
  return 60 + 14 + 80 + safeBottom;
}
