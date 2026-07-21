import React from "react";
import Svg, { Circle } from "react-native-svg";
import { XStack, YStack, Text } from "tamagui";

import { PressableScale } from "@/components/ui/PressableScale";
import { withAlpha } from "@/components/ui/themeHelpers";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import { useChartPalette, formatCompactNumber, stablePaletteIndex } from "./palette";

export type DonutSlice = { label: string; value: number };

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
  const responsive = useResponsiveLayout();
  const [selectedLabel, setSelectedLabel] = React.useState<string | null>(null);
  const sorted = [...slices].sort((a, b) => b.value - a.value);
  const head = sorted.slice(0, 5);
  const tail = sorted.slice(5);
  const rows =
    tail.length > 0
      ? [...head, { label: "Other", value: tail.reduce((sum, slice) => sum + slice.value, 0) }]
      : head;
  const total = rows.reduce((sum, slice) => sum + slice.value, 0);
  const selected = rows.find((slice) => slice.label === selectedLabel) ?? null;

  if (total === 0)
    return (
      <Text fontSize={12} color={theme.colorMuted.val}>
        No data in this range.
      </Text>
    );

  const strokeWidth = 16;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const segments = rows.map((slice) => {
    const fraction = slice.value / total;
    const length = Math.max(0, fraction * circumference - 2);
    const segment = {
      ...slice,
      color: palette.categorical[stablePaletteIndex(slice.label, palette.categorical.length)],
      dashArray: `${length} ${circumference - length}`,
      dashOffset: -offset,
    };
    offset += fraction * circumference;
    return segment;
  });
  const centerValue = selected?.value ?? total;
  const centerCaption = selected ? `${Math.round((selected.value / total) * 100)}%` : centerLabel;

  return (
    <XStack
      gap={16}
      alignItems="center"
      flexDirection={responsive.isCompact ? "column" : "row"}
      accessibilityLabel={`${centerLabel ?? "Distribution"}. Total ${total}. ${rows.map((row) => `${row.label} ${Math.round((row.value / total) * 100)} percent`).join(", ")}`}
    >
      <YStack width={size} height={size} alignItems="center" justifyContent="center">
        <Svg width={size} height={size}>
          {segments.map((segment) => (
            <Circle
              key={segment.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={segment.color}
              strokeWidth={
                selectedLabel && selectedLabel !== segment.label ? strokeWidth - 5 : strokeWidth
              }
              strokeOpacity={selectedLabel && selectedLabel !== segment.label ? 0.35 : 1}
              strokeDasharray={segment.dashArray}
              strokeDashoffset={segment.dashOffset}
              fill="none"
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          ))}
        </Svg>
        <YStack position="absolute" alignItems="center">
          <Text fontSize={16} fontFamily="$heading" fontWeight="700" color={theme.color.val}>
            {formatCompactNumber(centerValue)}
          </Text>
          {centerCaption ? (
            <Text fontSize={10} color={theme.colorMuted.val}>
              {centerCaption}
            </Text>
          ) : null}
        </YStack>
      </YStack>
      <YStack gap={3} flex={1} minWidth={responsive.isCompact ? "100%" : 180}>
        {segments.map((slice) => {
          const active = selectedLabel === slice.label;
          return (
            <PressableScale
              key={slice.label}
              onPress={() => setSelectedLabel(active ? null : slice.label)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${slice.label}, ${formatCompactNumber(slice.value)}, ${Math.round((slice.value / total) * 100)} percent`}
            >
              <XStack
                minHeight={40}
                paddingHorizontal={8}
                alignItems="center"
                gap={8}
                borderRadius={10}
                backgroundColor={active ? withAlpha(slice.color, "14") : "transparent"}
              >
                <YStack width={8} height={8} borderRadius={4} backgroundColor={slice.color} />
                <Text flex={1} fontSize={12} color={theme.color.val} numberOfLines={1}>
                  {slice.label}
                </Text>
                <Text fontSize={11} fontWeight="700" color={theme.color.val}>
                  {formatCompactNumber(slice.value)}
                </Text>
                <Text width={38} textAlign="right" fontSize={11} color={theme.colorMuted.val}>
                  {Math.round((slice.value / total) * 100)}%
                </Text>
              </XStack>
            </PressableScale>
          );
        })}
      </YStack>
    </XStack>
  );
}
