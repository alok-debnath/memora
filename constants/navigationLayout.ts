/** Geometry shared by the floating primary navigation and page-content clearance. */
export const bottomNavigationLayout = {
  barHeight: 60,
  bottomMargin: 14,
  fadeHeight: 14,
  insetGap: 8,
  androidInsetFloor: 8,
  /**
   * Breathing room between the last piece of content and the top of the
   * floating bar. Padding-only: the bar's own position is unaffected.
   */
  contentClearance: 24,
} as const;
