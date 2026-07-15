import React from "react";
import { XStack, YStack, Text } from "tamagui";

import { useAppTheme } from "@/hooks/useAppTheme";
import { useChartPalette, formatCompactNumber } from "./palette";

export type BarChartRow = {
  label: string;
  value: number;
  /** Optional right-aligned secondary text (e.g. cost, failure rate). */
  detail?: string;
  /** Explicit color; defaults to the first categorical hue for every row (magnitude, not identity). */
  color?: string;
};

/**
 * Horizontal bar list — magnitude comparison across named rows. One hue by
 * default (magnitude is not identity); pass per-row colors only when rows are
 * genuinely different entities.
 */
export function BarChart({ rows, maxRows = 10 }: { rows: BarChartRow[]; maxRows?: number }) {
  const theme = useAppTheme();
  const palette = useChartPalette();
  const visible = rows.slice(0, maxRows);
  const max = Math.max(1, ...visible.map((row) => row.value));

  if (visible.length === 0) {
    return (
      <Text fontSize={12} fontFamily="$body" color={theme.colorMuted.val}>
        No data in this range.
      </Text>
    );
  }

  return (
    <YStack gap={8}>
      {visible.map((row) => (
        <YStack key={row.label} gap={3}>
          <XStack justifyContent="space-between" alignItems="center" gap={8}>
            <Text
              fontSize={12}
              fontFamily="$body"
              fontWeight="600"
              color={theme.color.val}
              numberOfLines={1}
              flexShrink={1}
            >
              {row.label}
            </Text>
            <Text fontSize={11} fontFamily="$body" color={theme.colorMuted.val}>
              {formatCompactNumber(row.value)}
              {row.detail ? ` · ${row.detail}` : ""}
            </Text>
          </XStack>
          <XStack height={8} borderRadius={4} backgroundColor={palette.grid} overflow="hidden">
            <YStack
              width={`${Math.max(2, (row.value / max) * 100)}%`}
              backgroundColor={row.color ?? palette.categorical[0]}
              borderRadius={4}
            />
          </XStack>
        </YStack>
      ))}
    </YStack>
  );
}
