export type AppSpacing = "xs" | "sm" | "md" | "lg" | "xl" | "xxl";

export const spacing: Record<AppSpacing, number> = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

/** Vertical gap between a screen's top header/hero and the content below it. */
export const CONTENT_GAP = 14;

export type AppRadius = "sm" | "md" | "lg" | "pill";

export const radius: Record<AppRadius, number> = {
  sm: 12,
  md: 16,
  lg: 20,
  pill: 999,
};

export const breakpoints = {
  compact: 0,
  medium: 600,
  expanded: 1024,
  wide: 1280,
} as const;

export const layout = {
  readableMaxWidth: 760,
  standardMaxWidth: 1120,
  workspaceMaxWidth: 1440,
  mediumRailWidth: 72,
  expandedSidebarWidth: 248,
  wideSidebarWidth: 272,
  dockedChatDefaultWidth: 420,
  dockedChatMinWidth: 340,
  dockedChatMaxWidth: 520,
} as const;
