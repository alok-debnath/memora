export type AppSpacing = "xs" | "sm" | "md" | "lg" | "xl" | "xxl";

export const spacing: Record<AppSpacing, number> = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export type AppRadius = "sm" | "md" | "lg" | "pill";

export const radius: Record<AppRadius, number> = {
  sm: 12,
  md: 16,
  lg: 20,
  pill: 999,
};
