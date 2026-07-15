import { useMemo } from "react";

import { useAppTheme } from "@/hooks/useAppTheme";
import { useSemanticColors } from "@/hooks/useSemanticColors";

/**
 * Fixed categorical hue order for admin charts. Series colors are assigned by
 * entity in this order and never cycled or re-ranked — a filter that changes
 * the series count must not repaint the survivors. Past 6 series, fold into
 * "Other" instead of generating hues.
 */
export function useChartPalette() {
  const theme = useAppTheme();
  const semantic = useSemanticColors();
  return useMemo(
    () => ({
      categorical: [
        semantic.status.info,
        theme.primary.val,
        semantic.status.success,
        semantic.status.warning,
        semantic.integration.openai,
        semantic.status.error,
      ],
      grid: theme.borderSubtle.val,
      axisText: theme.colorMuted.val,
      surface: theme.card.val,
    }),
    [semantic, theme],
  );
}

export function formatCompactNumber(value: number) {
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value);
}

export function formatUsdMicros(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value / 1_000_000);
}
