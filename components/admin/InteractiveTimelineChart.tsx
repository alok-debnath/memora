/* Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V4 */
import React from "react";
import { Platform } from "react-native";
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient as SvgLinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from "react-native-svg";
import { Text, XStack, YStack } from "tamagui";

import { FilterChipGroup, type FilterChipOption } from "@/components/ui/FilterChipGroup";
import { withAlpha } from "@/components/ui/themeHelpers";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useSemanticColors } from "@/hooks/useSemanticColors";
import {
  bucketTimelinePoints,
  createCountTicks,
  getLabelIndices,
  getTimelineBucketCount,
  getTimelineLayout,
  type TimelinePoint,
} from "@/components/admin/charts/timelineGeometry";

function formatCompact(value: number) {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(
    value,
  );
}

function linePath(points: Array<{ x: number; y: number }>) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

export { type TimelinePoint } from "@/components/admin/charts/timelineGeometry";

export function InteractiveTimelineChart({
  title,
  subtitle,
  points,
  primaryLabel,
  secondaryLabel,
  compareLabel = "Previous AI requests",
  barColor,
  lineColor,
  compareLineColor,
  onSelectPoint,
}: {
  title: string;
  subtitle: string;
  points: TimelinePoint[];
  primaryLabel: string;
  secondaryLabel: string;
  compareLabel?: string;
  barColor: string;
  lineColor: string;
  compareLineColor?: string;
  onSelectPoint?: (point: TimelinePoint | null) => void;
}) {
  const theme = useAppTheme();
  const semantic = useSemanticColors();
  const compareColor = compareLineColor ?? semantic.status.warning;
  const [availableWidth, setAvailableWidth] = React.useState(320);
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [visibleSeries, setVisibleSeries] = React.useState<
    Array<"primary" | "secondary" | "compare">
  >(["primary", "secondary", "compare"]);
  const layout = getTimelineLayout(availableWidth);
  const buckets = React.useMemo(
    () => bucketTimelinePoints(points, getTimelineBucketCount(points.length, availableWidth)),
    [availableWidth, points],
  );
  const hasCompare = buckets.some((point) => point.compareSecondary !== undefined);
  const selected = buckets[selectedIndex] ?? buckets[buckets.length - 1] ?? null;
  const showPrimary = visibleSeries.includes("primary");
  const showSecondary = visibleSeries.includes("secondary");
  const showCompare = hasCompare && visibleSeries.includes("compare");

  React.useEffect(
    () => setSelectedIndex((current) => Math.min(current, Math.max(0, buckets.length - 1))),
    [buckets.length],
  );
  React.useEffect(() => onSelectPoint?.(selected), [onSelectPoint, selected]);

  const chartWidth = Math.max(1, availableWidth);
  const plotTop = 16;
  const plotBottom = layout.chartHeight - 42;
  const plotHeight = plotBottom - plotTop;
  const plotWidth = chartWidth - layout.insetLeft - layout.insetRight;
  const step = plotWidth / Math.max(1, buckets.length);
  const barWidth = Math.max(4, Math.min(18, step * 0.56));
  const scale = createCountTicks(
    buckets.flatMap((point) => [
      showPrimary ? point.primary : 0,
      showSecondary ? point.secondary : 0,
      showCompare ? (point.compareSecondary ?? 0) : 0,
    ]),
  );
  const yFor = (value: number) => plotBottom - (Math.max(0, value) / scale.max) * plotHeight;
  const xFor = (index: number) => layout.insetLeft + step * index + step / 2;
  const aiPoints = buckets.map((point, index) => ({ x: xFor(index), y: yFor(point.secondary) }));
  const previousPoints = buckets.map((point, index) => ({
    x: xFor(index),
    y: yFor(point.compareSecondary ?? 0),
  }));
  const aiPath = linePath(aiPoints);
  const previousPath = linePath(previousPoints);
  const areaPath =
    aiPoints.length > 1
      ? `${aiPath} L ${aiPoints[aiPoints.length - 1]!.x} ${plotBottom} L ${aiPoints[0]!.x} ${plotBottom} Z`
      : "";
  const labelIndices = new Set(getLabelIndices(buckets.length, availableWidth));
  const seriesOptions: FilterChipOption<"primary" | "secondary" | "compare">[] = [
    { value: "primary", label: primaryLabel, color: barColor, showColorSwatch: true },
    { value: "secondary", label: secondaryLabel, color: lineColor, showColorSwatch: true },
    ...(hasCompare
      ? [
          {
            value: "compare" as const,
            label: compareLabel,
            color: compareColor,
            showColorSwatch: true,
          },
        ]
      : []),
  ];
  const rangeSummary =
    buckets.length > 0
      ? `${buckets[0]!.startLabel} to ${buckets[buckets.length - 1]!.endLabel}`
      : "No dates available";
  const accessibilitySummary = selected
    ? `${title}. ${selected.rangeLabel ?? selected.label}. ${primaryLabel}: ${selected.primary}. ${secondaryLabel}: ${selected.secondary}.${selected.compareSecondary === undefined ? "" : ` ${compareLabel}: ${selected.compareSecondary}.`}`
    : `${title}. No data in this period.`;

  return (
    <YStack
      gap={12}
      onLayout={(event) =>
        setAvailableWidth(Math.max(280, Math.round(event.nativeEvent.layout.width)))
      }
      accessibilityRole="summary"
      accessibilityLabel={accessibilitySummary}
    >
      <XStack alignItems="flex-start" justifyContent="space-between" gap={12} flexWrap="wrap">
        <YStack flex={1} minWidth={200} gap={2}>
          <Text
            fontSize={17}
            lineHeight={22}
            fontFamily="$heading"
            fontWeight="700"
            color={theme.color.val}
          >
            {title}
          </Text>
          <Text fontSize={12} lineHeight={17} color={theme.colorMuted.val}>
            {subtitle}
          </Text>
        </YStack>
        <Text
          fontSize={10}
          textTransform="uppercase"
          letterSpacing={0.6}
          color={theme.colorMuted.val}
        >
          {rangeSummary}
        </Text>
      </XStack>

      <FilterChipGroup
        options={seriesOptions}
        values={visibleSeries}
        onValuesChange={setVisibleSeries}
        size="compact"
        accessibilityLabel="Visible chart series"
      />

      <XStack gap={8} flexWrap="wrap">
        <SummaryMetric
          label="Range"
          value={selected?.rangeLabel ?? selected?.label ?? "—"}
          color={theme.colorMuted.val}
        />
        {showPrimary ? (
          <SummaryMetric
            label={primaryLabel}
            value={selected ? formatCompact(selected.primary) : "—"}
            color={barColor}
          />
        ) : null}
        {showSecondary ? (
          <SummaryMetric
            label={secondaryLabel}
            value={selected ? formatCompact(selected.secondary) : "—"}
            color={lineColor}
          />
        ) : null}
        {showCompare ? (
          <SummaryMetric
            label={compareLabel}
            value={
              selected?.compareSecondary === undefined
                ? "—"
                : formatCompact(selected.compareSecondary)
            }
            color={compareColor}
          />
        ) : null}
      </XStack>

      {buckets.length === 0 ? (
        <YStack minHeight={layout.chartHeight} alignItems="center" justifyContent="center">
          <Text fontSize={12} color={theme.colorMuted.val}>
            No timeline data in this period.
          </Text>
        </YStack>
      ) : (
        <Svg
          width={chartWidth}
          height={layout.chartHeight}
          accessibilityLabel={accessibilitySummary}
        >
          <Defs>
            <SvgLinearGradient id="adminTimelineArea" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={lineColor} stopOpacity={0.14} />
              <Stop offset="100%" stopColor={lineColor} stopOpacity={0.01} />
            </SvgLinearGradient>
          </Defs>
          {scale.ticks.map((tick) => {
            const y = yFor(tick);
            return (
              <React.Fragment key={`tick-${tick}`}>
                <Line
                  x1={layout.insetLeft}
                  y1={y}
                  x2={chartWidth - layout.insetRight}
                  y2={y}
                  stroke={theme.borderColor.val}
                  strokeWidth={1}
                />
                <SvgText
                  x={layout.insetLeft - 7}
                  y={y + 3}
                  fontSize={9}
                  fill={theme.colorMuted.val}
                  textAnchor="end"
                >
                  {formatCompact(tick)}
                </SvgText>
              </React.Fragment>
            );
          })}
          {showSecondary && areaPath ? <Path d={areaPath} fill="url(#adminTimelineArea)" /> : null}
          {buckets.map((point, index) => {
            const x = xFor(index);
            const selectedPoint = index === selectedIndex;
            return (
              <React.Fragment key={`${point.label}-${index}`}>
                {showPrimary ? (
                  <Rect
                    x={x - barWidth / 2}
                    y={yFor(point.primary)}
                    width={barWidth}
                    height={Math.max(1, plotBottom - yFor(point.primary))}
                    rx={3}
                    fill={barColor}
                    opacity={selectedPoint ? 1 : 0.7}
                  />
                ) : null}
                {labelIndices.has(index) ? (
                  <SvgText
                    x={x}
                    y={layout.chartHeight - 16}
                    fontSize={9}
                    fill={theme.colorMuted.val}
                    textAnchor="middle"
                  >
                    {point.label}
                  </SvgText>
                ) : null}
                <Rect
                  x={x - step / 2}
                  y={plotTop}
                  width={step}
                  height={plotHeight}
                  fill="transparent"
                  onPress={() => setSelectedIndex(index)}
                  {...(Platform.OS === "web"
                    ? { onMouseEnter: () => setSelectedIndex(index) }
                    : {})}
                />
              </React.Fragment>
            );
          })}
          {showSecondary && aiPoints.length > 1 ? (
            <Path
              d={aiPath}
              fill="none"
              stroke={lineColor}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}
          {showCompare && previousPoints.length > 1 ? (
            <Path
              d={previousPath}
              fill="none"
              stroke={compareColor}
              strokeWidth={2}
              strokeDasharray="6 5"
              strokeLinecap="round"
            />
          ) : null}
          {showSecondary && aiPoints.length === 1 ? (
            <Circle cx={aiPoints[0]!.x} cy={aiPoints[0]!.y} r={4} fill={lineColor} />
          ) : null}
          {selected ? (
            <Line
              x1={xFor(selectedIndex)}
              y1={plotTop}
              x2={xFor(selectedIndex)}
              y2={plotBottom}
              stroke={withAlpha(theme.color.val, "38")}
              strokeDasharray="3 4"
            />
          ) : null}
          {showSecondary && aiPoints[selectedIndex] ? (
            <Circle
              cx={aiPoints[selectedIndex]!.x}
              cy={aiPoints[selectedIndex]!.y}
              r={4.5}
              fill={lineColor}
              stroke={theme.card.val}
              strokeWidth={2}
            />
          ) : null}
        </Svg>
      )}
    </YStack>
  );
}

function SummaryMetric({ label, value, color }: { label: string; value: string; color: string }) {
  const theme = useAppTheme();
  return (
    <YStack minWidth={96} flexGrow={1} paddingVertical={7} borderTopWidth={2} borderColor={color}>
      <Text fontSize={10} color={theme.colorMuted.val} numberOfLines={1}>
        {label}
      </Text>
      <Text
        fontSize={13}
        fontFamily="$heading"
        fontWeight="700"
        color={theme.color.val}
        numberOfLines={1}
      >
        {value}
      </Text>
    </YStack>
  );
}
