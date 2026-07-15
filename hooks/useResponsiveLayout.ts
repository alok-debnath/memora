import { Platform, useWindowDimensions } from "react-native";

import { getNavigationMode, getNavigationWidth, getWidthClass } from "@/lib/responsiveLayout";

export {
  getAdaptiveColumnCount,
  getNavigationMode,
  getNavigationWidth,
  shouldSplitWorkspace,
  getWidthClass,
} from "@/lib/responsiveLayout";
export type { NavigationMode, WidthClass } from "@/lib/responsiveLayout";

export function useResponsiveLayout() {
  const { width, height, scale, fontScale } = useWindowDimensions();
  const widthClass = getWidthClass(width);
  const navigationMode = getNavigationMode(widthClass);
  const navigationWidth = getNavigationWidth(widthClass);

  return {
    width,
    height,
    scale,
    fontScale,
    widthClass,
    navigationMode,
    navigationWidth,
    isCompact: widthClass === "compact",
    isMedium: widthClass === "medium",
    isExpanded: widthClass === "expanded" || widthClass === "wide",
    isWide: widthClass === "wide",
    isLandscape: width > height,
    isWeb: Platform.OS === "web",
    contentWidth: Math.max(0, width - navigationWidth),
  } as const;
}
