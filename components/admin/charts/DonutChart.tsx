import React from "react";
import Svg, { Circle } from "react-native-svg";
import { XStack, YStack, Text } from "tamagui";

import { useAppTheme } from "@/hooks/useAppTheme";
import { useChartPalette, formatCompactNumber } from "./palette";

export type DonutSlice = {
  label: string;
  value: number;
};

/**
 * Part-of-whole donut with legend. Slices take the fixed categorical order;
 * beyond 5 slices the tail folds into "Other". A 2px surface gap separates
 * segments (stroke dash spacing).
 */
export function DonutChart({
  slices,
  size = 132,
  centerLabel,
}: {
  slices: DonutSlice[];
  size?: number;
  centerLabel?: string;
}) {
  const theme = useAppTheme();
  const palette = useChartPalette();

  const sorted = [...slices].sort((a, b) => b.value - a.value);
  const head = sorted.slice(0, 5);
  const tail = sorted.slice(5);
  const rows =
    tail.length > 0
      ? [...head, { label: "Other", value: tail.reduce((sum, slice) => sum + slice.value, 0) }]
      : head;
  const total = rows.reduce((sum, slice) => sum + slice.value, 0);

  if (total === 0) {
    return (
      <Text fontSize={12} fontFamily="$body" color={theme.colorMuted.val}>
        No data in this range.
      </Text>
    );
  }

  const strokeWidth = 16;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const gap = 2;

  let offset = 0;
  const segments = rows.map((slice, index) => {
    const fraction = slice.value / total;
    const length = Math.max(0, fraction * circumference - gap);
    const segment = {
      key: slice.label,
      color: palette.categorical[index % palette.categorical.length],
      dashArray: `${length} ${circumference - length}`,
      dashOffset: -offset,
    };
    offset += fraction * circumference;
    return segment;
  });

  return (
    <XStack gap={16} alignItems="center" flexWrap="wrap">
      <YStack width={size} height={size} alignItems="center" justifyContent="center">
        <Svg width={size} height={size}>
          {segments.map((segment) => (
            <Circle
              key={segment.key}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={segment.color}
              strokeWidth={strokeWidth}
              strokeDasharray={segment.dashArray}
              strokeDashoffset={segment.dashOffset}
              strokeLinecap="butt"
              fill="none"
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          ))}
        </Svg>
        <YStack position="absolute" alignItems="center">
          <Text fontSize={16} fontFamily="$heading" fontWeight="700" color={theme.color.val}>
            {formatCompactNumber(total)}
          </Text>
          {centerLabel ? (
            <Text fontSize={10} fontFamily="$body" color={theme.colorMuted.val}>
              {centerLabel}
            </Text>
          ) : null}
        </YStack>
      </YStack>

      <YStack gap={6} flex={1} minWidth={140}>
        {rows.map((slice, index) => (
          <XStack key={slice.label} alignItems="center" gap={8}>
            <YStack
              width={8}
              height={8}
              borderRadius={4}
              backgroundColor={palette.categorical[index % palette.categorical.length]}
            />
            <Text
              flex={1}
              fontSize={12}
              fontFamily="$body"
              color={theme.color.val}
              numberOfLines={1}
            >
              {slice.label}
            </Text>
            <Text fontSize={11} fontFamily="$body" color={theme.colorMuted.val}>
              {Math.round((slice.value / total) * 100)}%
            </Text>
          </XStack>
        ))}
      </YStack>
    </XStack>
  );
}
