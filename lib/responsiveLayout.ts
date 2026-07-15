import { breakpoints, layout } from "@/constants/uiTokens";

export type WidthClass = "compact" | "medium" | "expanded" | "wide";
export type NavigationMode = "bottom" | "rail" | "sidebar";

export function getWidthClass(width: number): WidthClass {
  if (width >= breakpoints.wide) return "wide";
  if (width >= breakpoints.expanded) return "expanded";
  if (width >= breakpoints.medium) return "medium";
  return "compact";
}

export function getNavigationMode(widthClass: WidthClass): NavigationMode {
  if (widthClass === "compact") return "bottom";
  if (widthClass === "medium") return "rail";
  return "sidebar";
}

export function getNavigationWidth(widthClass: WidthClass) {
  if (widthClass === "medium") return layout.mediumRailWidth;
  if (widthClass === "expanded") return layout.expandedSidebarWidth;
  if (widthClass === "wide") return layout.wideSidebarWidth;
  return 0;
}

export function getAdaptiveColumnCount(
  availableWidth: number,
  minimumColumnWidth: number,
  maximumColumns = 5,
  gap = 12,
) {
  if (availableWidth <= 0 || minimumColumnWidth <= 0) return 1;
  return Math.max(
    1,
    Math.min(maximumColumns, Math.floor((availableWidth + gap) / (minimumColumnWidth + gap))),
  );
}

export function shouldSplitWorkspace(availableWidth: number, splitAt = 820) {
  return availableWidth >= splitAt;
}
