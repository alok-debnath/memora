import React from "react";
import { ScrollView } from "react-native";
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

import { PressableScale } from "@/components/ui/PressableScale";
import { withAlpha } from "@/components/ui/themeHelpers";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useSemanticColors } from "@/hooks/useSemanticColors";

function formatCompact(value: number) {
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value);
}

type TimelinePoint = {
  label: string;
  primary: number;
  secondary: number;
  compareSecondary?: number;
};

export function InteractiveTimelineChart({
  title,
  subtitle,
  points,
  primaryLabel,
  secondaryLabel,
  compareLabel = "Previous period",
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
  const resolvedCompareLineColor = compareLineColor ?? semantic.status.warning;
  const [selectedIndex, setSelectedIndex] = React.useState<number>(Math.max(points.length - 1, 0));
  const [windowSize, setWindowSize] = React.useState<7 | 14 | "all">("all");
  const [showPrimary, setShowPrimary] = React.useState(true);
  const [showSecondary, setShowSecondary] = React.useState(true);
  const [showCompare, setShowCompare] = React.useState(true);

  const visiblePoints = React.useMemo(() => {
    if (windowSize === "all" || points.length <= windowSize) return points;
    return points.slice(points.length - windowSize);
  }, [points, windowSize]);

  const hasCompare = visiblePoints.some((point) => point.compareSecondary !== undefined);
  const selected = visiblePoints[selectedIndex] ?? visiblePoints[visiblePoints.length - 1] ?? null;

  React.useEffect(() => {
    if (selectedIndex >= visiblePoints.length) {
      setSelectedIndex(Math.max(visiblePoints.length - 1, 0));
    }
  }, [selectedIndex, visiblePoints.length]);

  React.useEffect(() => {
    onSelectPoint?.(selected);
  }, [onSelectPoint, selected]);

  const width = Math.max(320, visiblePoints.length * 32);
  const height = 212;
  const chartTop = 18;
  const chartHeight = 118;
  const chartBottom = chartTop + chartHeight;
  const step = width / Math.max(visiblePoints.length, 1);
  const barWidth = Math.max(10, Math.min(14, width / Math.max(visiblePoints.length * 2, 1)));

  const maxPrimary = Math.max(1, ...visiblePoints.map((point) => point.primary));
  const maxSecondary = Math.max(
    1,
    ...visiblePoints.map((point) => point.secondary),
    ...visiblePoints.map((point) => point.compareSecondary ?? 0),
  );

  const linePoints = visiblePoints.map((point, index) => {
    const x = index * step + step / 2;
    const y = chartBottom - (point.secondary / maxSecondary) * chartHeight;
    return { x, y };
  });
  const comparePoints = visiblePoints.map((point, index) => {
    const x = index * step + step / 2;
    const y = chartBottom - ((point.compareSecondary ?? 0) / maxSecondary) * chartHeight;
    return { x, y };
  });

  const linePath = linePoints
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const comparePath = comparePoints
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const areaPath =
    linePoints.length > 1
      ? `${linePath} L ${linePoints[linePoints.length - 1]?.x ?? 0} ${chartBottom} L ${
          linePoints[0]?.x ?? 0
        } ${chartBottom} Z`
      : "";

  const selectedLinePoint = linePoints[selectedIndex] ?? null;
  const gridStroke = withAlpha(theme.color.val, "2E");
  const axisColor = withAlpha(theme.color.val, "7A");
  const dotStroke = withAlpha(theme.background.val, "F0");
  const inactiveChipBorder = withAlpha(theme.shadowColor.val, "22");
  const inactiveDot = withAlpha(semantic.status.neutral, "77");

  return (
    <YStack>
      <YStack gap={12}>
        <YStack gap={4}>
          <Text fontSize={17} fontFamily="$heading" fontWeight="700" color={theme.color.val}>
            {title}
          </Text>
          <Text fontSize={12} color={theme.colorMuted.val}>
            {subtitle}
          </Text>
        </YStack>

        <XStack gap={8} flexWrap="wrap">
          <ToggleChip
            active={showPrimary}
            color={barColor}
            label={primaryLabel}
            onPress={() => setShowPrimary((current) => !current)}
            inactiveBorder={inactiveChipBorder}
            inactiveDotColor={inactiveDot}
          />
          <ToggleChip
            active={showSecondary}
            color={lineColor}
            label={secondaryLabel}
            onPress={() => setShowSecondary((current) => !current)}
            inactiveBorder={inactiveChipBorder}
            inactiveDotColor={inactiveDot}
          />
          {hasCompare ? (
            <ToggleChip
              active={showCompare}
              color={resolvedCompareLineColor}
              label={compareLabel}
              onPress={() => setShowCompare((current) => !current)}
              inactiveBorder={inactiveChipBorder}
              inactiveDotColor={inactiveDot}
            />
          ) : null}
        </XStack>

        <XStack gap={8}>
          <RangeChip
            label="7"
            active={windowSize === 7}
            onPress={() => setWindowSize(7)}
            inactiveBorder={inactiveChipBorder}
            activeColor={semantic.status.info}
          />
          <RangeChip
            label="14"
            active={windowSize === 14}
            onPress={() => setWindowSize(14)}
            inactiveBorder={inactiveChipBorder}
            activeColor={semantic.status.info}
          />
          <RangeChip
            label="All"
            active={windowSize === "all"}
            onPress={() => setWindowSize("all")}
            inactiveBorder={inactiveChipBorder}
            activeColor={semantic.status.info}
          />
        </XStack>

        {selected ? (
          <XStack gap={10} flexWrap="wrap">
            {showPrimary ? (
              <StatPill
                color={barColor}
                label={`${primaryLabel} (${selected.label})`}
                value={formatCompact(selected.primary)}
              />
            ) : null}
            {showSecondary ? (
              <StatPill
                color={lineColor}
                label={secondaryLabel}
                value={formatCompact(selected.secondary)}
              />
            ) : null}
            {showCompare && selected.compareSecondary !== undefined ? (
              <StatPill
                color={resolvedCompareLineColor}
                label={compareLabel}
                value={formatCompact(selected.compareSecondary)}
              />
            ) : null}
          </XStack>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Svg width={width} height={height}>
            <Defs>
              <SvgLinearGradient id="lineAreaFade" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor={lineColor} stopOpacity={0.25} />
                <Stop offset="100%" stopColor={lineColor} stopOpacity={0.02} />
              </SvgLinearGradient>
            </Defs>

            {[0.25, 0.5, 0.75, 1].map((grid) => {
              const y = chartBottom - grid * chartHeight;
              return (
                <Line
                  key={`grid-${grid}`}
                  x1={0}
                  y1={y}
                  x2={width}
                  y2={y}
                  stroke={gridStroke}
                  strokeOpacity={0.11}
                  strokeDasharray="4 6"
                />
              );
            })}

            {showSecondary && linePoints.length > 1 ? (
              <Path d={areaPath} fill="url(#lineAreaFade)" />
            ) : null}

            {visiblePoints.map((point, index) => {
              const x = index * step + step / 2 - barWidth / 2;
              const barHeight = (point.primary / maxPrimary) * chartHeight;
              const isSelected = index === selectedIndex;
              const isTick =
                index === 0 ||
                index === visiblePoints.length - 1 ||
                index === Math.floor(visiblePoints.length / 2);
              return (
                <React.Fragment key={`${point.label}-${index}`}>
                  {showPrimary ? (
                    <Rect
                      x={x}
                      y={chartBottom - barHeight}
                      width={barWidth}
                      height={Math.max(4, barHeight)}
                      rx={6}
                      fill={barColor}
                      opacity={isSelected ? 1 : 0.76}
                      onPress={() => setSelectedIndex(index)}
                    />
                  ) : null}
                  {isTick ? (
                    <SvgText
                      x={index * step + step / 2}
                      y={height - 16}
                      fontSize={10}
                      fill={axisColor}
                      textAnchor="middle"
                    >
                      {point.label}
                    </SvgText>
                  ) : null}
                </React.Fragment>
              );
            })}

            {showSecondary && linePoints.length > 1 ? (
              <Path
                d={linePath}
                fill="none"
                stroke={lineColor}
                strokeWidth={3}
                strokeLinecap="round"
              />
            ) : null}

            {showCompare && hasCompare && comparePoints.length > 1 ? (
              <Path
                d={comparePath}
                fill="none"
                stroke={resolvedCompareLineColor}
                strokeWidth={2}
                strokeDasharray="6 4"
                strokeLinecap="round"
              />
            ) : null}

            {showSecondary
              ? linePoints.map((point, index) => {
                  const isSelected = index === selectedIndex;
                  return (
                    <Circle
                      key={`dot-${index}`}
                      cx={point.x}
                      cy={point.y}
                      r={isSelected ? 5 : 3.5}
                      fill={lineColor}
                      stroke={dotStroke}
                      strokeWidth={1.5}
                      onPress={() => setSelectedIndex(index)}
                    />
                  );
                })
              : null}

            {selectedLinePoint ? (
              <Line
                x1={selectedLinePoint.x}
                y1={chartTop - 6}
                x2={selectedLinePoint.x}
                y2={chartBottom + 8}
                stroke={lineColor}
                strokeOpacity={0.25}
                strokeDasharray="3 5"
              />
            ) : null}
          </Svg>
        </ScrollView>
      </YStack>
    </YStack>
  );
}

function ToggleChip({
  active,
  color,
  label,
  onPress,
  inactiveBorder,
  inactiveDotColor,
}: {
  active: boolean;
  color: string;
  label: string;
  onPress: () => void;
  inactiveBorder: string;
  inactiveDotColor: string;
}) {
  const theme = useAppTheme();
  return (
    <PressableScale onPress={onPress}>
      <XStack
        alignItems="center"
        gap={6}
        paddingHorizontal={10}
        paddingVertical={7}
        borderRadius={10}
        borderWidth={1}
        borderColor={active ? color : inactiveBorder}
        backgroundColor={active ? color + "1A" : "transparent"}
      >
        <YStack
          width={7}
          height={7}
          borderRadius={99}
          backgroundColor={active ? color : inactiveDotColor}
        />
        <Text
          fontSize={11}
          fontWeight={active ? "700" : "500"}
          color={active ? theme.color.val : theme.colorMuted.val}
        >
          {label}
        </Text>
      </XStack>
    </PressableScale>
  );
}

function RangeChip({
  label,
  active,
  onPress,
  inactiveBorder,
  activeColor,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  inactiveBorder: string;
  activeColor: string;
}) {
  const theme = useAppTheme();
  return (
    <PressableScale onPress={onPress}>
      <XStack
        alignItems="center"
        justifyContent="center"
        minWidth={42}
        paddingHorizontal={10}
        paddingVertical={6}
        borderRadius={10}
        borderWidth={1}
        borderColor={active ? activeColor : inactiveBorder}
        backgroundColor={active ? activeColor + "14" : "transparent"}
      >
        <Text
          fontSize={11}
          fontWeight={active ? "700" : "500"}
          color={active ? theme.color.val : theme.colorMuted.val}
        >
          {label}
        </Text>
      </XStack>
    </PressableScale>
  );
}

function StatPill({ label, value, color }: { label: string; value: string; color: string }) {
  const theme = useAppTheme();
  return (
    <YStack
      paddingHorizontal={12}
      paddingVertical={8}
      borderRadius={14}
      borderWidth={1}
      borderColor={color + "40"}
      backgroundColor={color + "1A"}
    >
      <Text fontSize={11} color={theme.colorMuted.val}>
        {label}
      </Text>
      <Text fontSize={14} fontFamily="$heading" fontWeight="700" color={theme.color.val}>
        {value}
      </Text>
    </YStack>
  );
}
