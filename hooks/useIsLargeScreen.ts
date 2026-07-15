import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";

export function useIsLargeScreen() {
  return !useResponsiveLayout().isCompact;
}
