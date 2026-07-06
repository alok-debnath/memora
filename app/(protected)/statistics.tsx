import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, useWindowDimensions } from "react-native";
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { FlatList } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@/lib/icons";
import { useQuery } from "convex/react";
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

import { api } from "@/convex/_generated/api";
import { AppScreen } from "@/components/ui/AppScreen";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { PressableScale } from "@/components/ui/PressableScale";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useAuth } from "@/hooks/useAuth";
import { useIsLargeScreen } from "@/hooks/useIsLargeScreen";
import { useSemanticColors } from "@/hooks/useSemanticColors";
import { appShadow, withAlpha } from "@/components/ui/themeHelpers";

type RangeKey = "7d" | "30d" | "90d";
type SpendSource = "combined" | "memora" | "user_byok";

const RANGE_OPTIONS = [
  { value: "7d" as const, label: "7D" },
  { value: "30d" as const, label: "30D" },
  { value: "90d" as const, label: "90D" },
];

const SPEND_SOURCE_OPTIONS = [
  { value: "combined" as const, label: "Combined" },
  { value: "memora" as const, label: "Memora" },
  { value: "user_byok" as const, label: "Your key" },
];

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value);
}

function formatUsdMicros(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100_000 ? 2 : 4,
  }).format(value / 1_000_000);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = -1;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

function formatDateLabel(dayKey: string) {
  const date = new Date(`${dayKey}T00:00:00.000Z`);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatFeatureLabel(feature: string) {
  const map: Record<string, string> = {
    memory_chat: "Chat assistant",
    attachment_extraction: "Image / document extraction",
    memory_capture: "Memory structuring",
    memory_processing: "Memory processing",
    memory_search: "Search grounding",
    topic_management: "Topic assignment",
    diary_processing: "Diary processing",
    conflict_detection: "Conflict detection",
    audio_transcription: "Audio transcription",
  };
  return map[feature] ?? feature.replace(/_/g, " ");
}

function formatStageLabel(stage: string | null | undefined) {
  if (!stage) return "unspecified";
  return stage.replace(/_/g, " ");
}

function formatBilledToLabel(source: string | null | undefined) {
  if (source === "combined") return "Combined";
  return source === "user_byok" ? "Your key" : "Memora";
}

function KPI({
  icon,
  label,
  value,
  tone,
  hint,
  width,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  value: string;
  tone: string;
  hint: string;
  width: number;
}) {
  const theme = useAppTheme();
  return (
    <Card style={{ width, borderRadius: 16 }}>
      <XStack alignItems="flex-start" justifyContent="space-between">
        <YStack
          width={42}
          height={42}
          borderRadius={14}
          alignItems="center"
          justifyContent="center"
          backgroundColor={withAlpha(tone, "16")}
        >
          <Feather name={icon} size={18} color={tone} />
        </YStack>
        <Text fontSize={11} fontFamily="$body" color={theme.colorMuted.val}>
          {hint}
        </Text>
      </XStack>
      <Text
        marginTop={16}
        fontSize={26}
        fontFamily="$heading"
        fontWeight="700"
        color={theme.color.val}
      >
        {value}
      </Text>
      <Text marginTop={4} fontSize={12} fontFamily="$body" color={theme.colorMuted.val}>
        {label}
      </Text>
    </Card>
  );
}

function TimelineChart({
  data,
  barColor,
  lineColor,
}: {
  data: Array<{
    dayKey: string;
    primaryValue: number;
    secondaryValue: number;
  }>;
  barColor: string;
  lineColor: string;
}) {
  const theme = useAppTheme();
  const width = Math.max(280, data.length * 24);
  const height = 184;
  const chartTop = 16;
  const chartHeight = 110;
  const chartBottom = chartTop + chartHeight;
  const barWidth = Math.max(8, Math.min(14, width / Math.max(data.length * 2, 1)));
  const step = width / Math.max(data.length, 1);
  const maxBar = Math.max(1, ...data.map((item) => item.primaryValue));
  const maxLine = Math.max(1, ...data.map((item) => item.secondaryValue));
  const linePoints = data.map((item, index) => {
    const x = index * step + step / 2;
    const y = chartBottom - (item.secondaryValue / maxLine) * chartHeight;
    return { x, y };
  });
  const path = linePoints
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const areaPath =
    linePoints.length > 1
      ? `${path} L ${linePoints[linePoints.length - 1]?.x ?? 0} ${chartBottom} L ${
          linePoints[0]?.x ?? 0
        } ${chartBottom} Z`
      : "";
  const peakBar = data.reduce(
    (best, item) => (item.primaryValue > best.primaryValue ? item : best),
    data[0] ?? { dayKey: "", primaryValue: 0, secondaryValue: 0 },
  );
  const peakLine = data.reduce(
    (best, item) => (item.secondaryValue > best.secondaryValue ? item : best),
    data[0] ?? { dayKey: "", primaryValue: 0, secondaryValue: 0 },
  );
  const gridValues = [0.25, 0.5, 0.75, 1];
  const axisColor = withAlpha(theme.color.val, "7A");
  const gridStroke = withAlpha(theme.color.val, "2E");
  const dotStroke = withAlpha(theme.background.val, "F0");

  return (
    <Svg width={width} height={height}>
      <Defs>
        <SvgLinearGradient id="aiAreaFade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={lineColor} stopOpacity={0.26} />
          <Stop offset="100%" stopColor={lineColor} stopOpacity={0.02} />
        </SvgLinearGradient>
      </Defs>
      {gridValues.map((value) => {
        const y = chartBottom - value * chartHeight;
        return (
          <Line
            key={`grid-${value}`}
            x1={0}
            y1={y}
            x2={width}
            y2={y}
            stroke={gridStroke}
            strokeOpacity={value === 1 ? 0.2 : 0.1}
            strokeDasharray="4 6"
          />
        );
      })}
      {linePoints.length > 1 ? <Path d={areaPath} fill="url(#aiAreaFade)" /> : null}
      {data.map((item, index) => {
        const x = index * step + step / 2 - barWidth / 2;
        const barHeight = (item.primaryValue / maxBar) * chartHeight;
        const isTick =
          index === 0 || index === data.length - 1 || index === Math.floor(data.length / 2);
        const isPeakBar = item.dayKey === peakBar.dayKey && item.primaryValue > 0;
        return (
          <React.Fragment key={item.dayKey}>
            <Rect
              x={x}
              y={chartBottom - barHeight}
              width={barWidth}
              height={Math.max(4, barHeight)}
              rx={5}
              fill={barColor}
              opacity={isPeakBar ? 0.96 : 0.78}
            />
            {isPeakBar ? (
              <Rect
                x={x - 2}
                y={chartBottom - barHeight - 4}
                width={barWidth + 4}
                height={Math.max(8, barHeight + 4)}
                rx={7}
                stroke={barColor}
                strokeOpacity={0.24}
                fill="transparent"
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
                {formatDateLabel(item.dayKey)}
              </SvgText>
            ) : null}
          </React.Fragment>
        );
      })}
      {linePoints.length > 1 ? (
        <Path d={path} fill="none" stroke={lineColor} strokeWidth={3} strokeLinecap="round" />
      ) : null}
      {linePoints.map((point, index) => (
        <Circle
          key={`${data[index]?.dayKey}-dot`}
          cx={point.x}
          cy={point.y}
          r={data[index]?.dayKey === peakLine.dayKey && data[index]?.secondaryValue > 0 ? 4.5 : 3}
          fill={lineColor}
          stroke={dotStroke}
          strokeWidth={1.5}
        />
      ))}
      <Line
        x1={0}
        y1={chartBottom}
        x2={width}
        y2={chartBottom}
        stroke={gridStroke}
        strokeOpacity={0.12}
      />
    </Svg>
  );
}

function DetailToggle({
  icon,
  label,
  active,
  onPress,
  tone,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  active: boolean;
  onPress: () => void;
  tone: string;
}) {
  const theme = useAppTheme();
  return (
    <PressableScale onPress={onPress}>
      <XStack
        alignItems="center"
        gap={8}
        paddingHorizontal={12}
        paddingVertical={10}
        borderRadius={999}
        borderWidth={1}
        borderColor={active ? tone : withAlpha(tone, "24")}
        backgroundColor={active ? withAlpha(tone, "14") : theme.background.val}
      >
        <Feather name={icon} size={14} color={tone} />
        <Text
          fontSize={12}
          fontFamily="$body"
          fontWeight={active ? "700" : "500"}
          color={active ? tone : theme.colorMuted.val}
        >
          {label}
        </Text>
      </XStack>
    </PressableScale>
  );
}

function getDetailPanelMeta(
  detailPanel: "none" | "models" | "events" | "features",
): { title: string; subtitle: string } | null {
  switch (detailPanel) {
    case "features":
      return {
        title: "Feature Breakdown",
        subtitle: "User-visible actions and background AI stages",
      };
    case "models":
      return {
        title: "Model Costs",
        subtitle: "Spend and token load by model",
      };
    case "events":
      return {
        title: "Recent Usage Events",
        subtitle: "Latest tracked AI operations",
      };
    default:
      return null;
  }
}

export default function AnalyticsScreen() {
  const theme = useAppTheme();
  const semantic = useSemanticColors();
  const insets = useSafeAreaInsets();
  const isLargeScreen = useIsLargeScreen();
  const modalRef = useRef<BottomSheetModal>(null);
  const presentedRef = useRef(false);
  const { token } = useAuth();
  const { width: windowWidth } = useWindowDimensions();
  const [range, setRange] = useState<RangeKey>("7d");
  const [spendSource, setSpendSource] = useState<SpendSource>("combined");
  const [detailPanel, setDetailPanel] = useState<"none" | "models" | "events" | "features">("none");
  const isCompact = windowWidth < 720;
  const contentWidth = Math.min(windowWidth - 32, 1040);
  const kpiWidth = isCompact
    ? Math.max(150, Math.floor((contentWidth - 10) / 2))
    : Math.max(200, Math.floor((contentWidth - 30) / 4));

  const overview = useQuery(api.analytics.overview, token ? { token, range, spendSource } : "skip");
  const aiBreakdown =
    useQuery(api.analytics.aiBreakdown, token ? { token, range, spendSource } : "skip") ?? [];
  const aiFeatureBreakdown =
    useQuery(api.analytics.aiFeatureBreakdown, token ? { token, range, spendSource } : "skip") ??
    [];
  const detailMeta = getDetailPanelMeta(detailPanel);
  const detailOpen = detailPanel !== "none";

  const handleDismiss = useCallback(() => {
    presentedRef.current = false;
    setDetailPanel("none");
  }, []);

  const renderBackdrop = useCallback(
    (props: React.ComponentProps<typeof BottomSheetBackdrop>) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
      />
    ),
    [],
  );

  useEffect(() => {
    if (detailOpen && !presentedRef.current) {
      modalRef.current?.present();
      presentedRef.current = true;
      return;
    }

    if (!detailOpen && presentedRef.current) {
      modalRef.current?.dismiss();
    }
  }, [detailOpen]);
  const recentEventsResult = useQuery(
    api.analytics.recentEvents,
    token ? { token, range, spendSource, paginationOpts: { numItems: 10, cursor: null } } : "skip",
  );
  const recentEvents = recentEventsResult?.page ?? [];

  const topModels = useMemo(() => aiBreakdown.slice(0, 5), [aiBreakdown]);
  const topBackgroundFeature = useMemo(
    () => aiFeatureBreakdown.find((item) => item.visibility === "background") ?? null,
    [aiFeatureBreakdown],
  );
  const actionToOpRatio = useMemo(() => {
    const actions = overview?.rangeTotals.aiActions ?? 0;
    const ops = overview?.rangeTotals.aiRequests ?? 0;
    if (actions <= 0 || ops <= 0) return null;
    return ops / actions;
  }, [overview]);
  const usageFlowStats = useMemo(() => {
    const timeline = overview?.timeline ?? [];
    const totals = timeline.reduce(
      (acc, item) => {
        acc.searches += item.searches ?? 0;
        acc.aiRequests += item.aiRequests ?? 0;
        return acc;
      },
      { searches: 0, aiRequests: 0 },
    );
    const peakSearchDay = timeline.reduce(
      (best, item) => ((item.searches ?? 0) > (best?.searches ?? 0) ? item : best),
      timeline[0],
    );
    const peakAiDay = timeline.reduce(
      (best, item) => ((item.aiRequests ?? 0) > (best?.aiRequests ?? 0) ? item : best),
      timeline[0],
    );

    return {
      searches: totals.searches,
      aiRequests: totals.aiRequests,
      peakSearchDay,
      peakAiDay,
    };
  }, [overview]);
  const usageFlowScale = useMemo(() => {
    const timeline = overview?.timeline ?? [];
    return {
      maxSearches: Math.max(1, ...timeline.map((item) => item.searches ?? 0)),
      maxAiCalls: Math.max(1, ...timeline.map((item) => item.aiRequests ?? 0)),
    };
  }, [overview]);

  return (
    <AppScreen showBack title="Analytics">
      <XStack gap={10} flexWrap="wrap">
        <Badge
          label={`${Math.round((overview?.rangeTotals.searchCacheHitRate ?? 0) * 100)}% search cache hit`}
          color={semantic.status.info}
        />
        <Badge
          label={`${formatBilledToLabel(spendSource)} spend view`}
          color={semantic.integration.openai}
        />
      </XStack>

      <YStack>
        <YStack gap={10}>
          <SegmentedControl options={RANGE_OPTIONS} value={range} onChange={setRange} />
          <SegmentedControl
            options={SPEND_SOURCE_OPTIONS}
            value={spendSource}
            onChange={(value) => setSpendSource(value as SpendSource)}
          />
        </YStack>
      </YStack>

      <XStack flexWrap="wrap" gap={10} alignItems="flex-start">
        <YStack style={{ width: kpiWidth }}>
          <KPI
            icon="cpu"
            label="AI spend"
            value={formatUsdMicros(overview?.rangeTotals.aiCostUsdMicros ?? 0)}
            hint={`${formatCompactNumber(overview?.rangeTotals.aiRequests ?? 0)} requests`}
            tone={semantic.integration.openai}
            width={kpiWidth}
          />
        </YStack>
        <YStack style={{ width: kpiWidth }}>
          <KPI
            icon="search"
            label="Searches"
            value={formatCompactNumber(overview?.rangeTotals.searches ?? 0)}
            hint={`${formatCompactNumber(overview?.rangeTotals.deepSearches ?? 0)} deep scans`}
            tone={semantic.stat.diary}
            width={kpiWidth}
          />
        </YStack>
        <YStack style={{ width: kpiWidth }}>
          <KPI
            icon="activity"
            label="AI actions"
            value={formatCompactNumber(overview?.rangeTotals.aiActions ?? 0)}
            hint={`${formatCompactNumber(overview?.rangeTotals.backgroundAiOperations ?? 0)} background ops`}
            tone={theme.primary.val}
            width={kpiWidth}
          />
        </YStack>
        <YStack style={{ width: kpiWidth }}>
          <KPI
            icon="layers"
            label="AI backend ops"
            value={formatCompactNumber(overview?.rangeTotals.aiRequests ?? 0)}
            hint={`${formatCompactNumber(overview?.rangeTotals.backgroundAiOperations ?? 0)} background`}
            tone={semantic.status.warning}
            width={kpiWidth}
          />
        </YStack>
      </XStack>

      <YStack>
        <SectionLabel>Usage Flow</SectionLabel>
        <Card
          style={{
            borderRadius: 16,
            overflow: "hidden",
          }}
        >
          <YStack gap={0}>
            <XStack
              alignItems={isCompact ? "flex-start" : "center"}
              justifyContent="space-between"
              flexWrap="wrap"
              gap={10}
              marginBottom={12}
            >
              <YStack gap={2} flex={1} minWidth={isCompact ? "100%" : 0}>
                <Text fontSize={18} fontFamily="$heading" fontWeight="700" color={theme.color.val}>
                  Search vs AI load
                </Text>
                <Text fontSize={13} fontFamily="$body" color={theme.colorMuted.val}>
                  Search demand and AI backend pressure plotted together across the selected window.
                </Text>
              </YStack>
              <XStack gap={10} flexWrap="wrap">
                <XStack alignItems="center" gap={6}>
                  <View
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: theme.primary.val,
                    }}
                  />
                  <Text fontSize={12} color={theme.colorMuted.val}>
                    Searches
                  </Text>
                </XStack>
                <XStack alignItems="center" gap={6}>
                  <View
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: semantic.integration.openai,
                    }}
                  />
                  <Text fontSize={12} color={theme.colorMuted.val}>
                    AI calls
                  </Text>
                </XStack>
              </XStack>
            </XStack>
            <XStack gap={10} flexWrap="wrap" marginBottom={10}>
              <YStack
                minWidth={isCompact ? 132 : 148}
                paddingHorizontal={12}
                paddingVertical={10}
                borderRadius={14}
                backgroundColor={withAlpha(theme.primary.val, "10")}
              >
                <Text fontSize={11} color={theme.colorMuted.val}>
                  Searches in range
                </Text>
                <Text fontSize={18} fontFamily="$heading" fontWeight="700" color={theme.color.val}>
                  {formatCompactNumber(usageFlowStats.searches)}
                </Text>
              </YStack>
              <YStack
                minWidth={isCompact ? 132 : 148}
                paddingHorizontal={12}
                paddingVertical={10}
                borderRadius={14}
                backgroundColor={withAlpha(semantic.integration.openai, "10")}
              >
                <Text fontSize={11} color={theme.colorMuted.val}>
                  AI calls in range
                </Text>
                <Text fontSize={18} fontFamily="$heading" fontWeight="700" color={theme.color.val}>
                  {formatCompactNumber(usageFlowStats.aiRequests)}
                </Text>
              </YStack>
              <YStack
                flex={1}
                minWidth={isCompact ? "100%" : 220}
                paddingHorizontal={12}
                paddingVertical={10}
                borderRadius={14}
                backgroundColor={theme.backgroundStrong.val}
              >
                <Text fontSize={11} color={theme.colorMuted.val}>
                  Peak days
                </Text>
                <Text fontSize={13} fontFamily="$body" fontWeight="600" color={theme.color.val}>
                  Search peak:{" "}
                  {usageFlowStats.peakSearchDay
                    ? `${formatDateLabel(usageFlowStats.peakSearchDay.dayKey)}`
                    : "No data"}
                </Text>
                <Text fontSize={12} color={theme.colorMuted.val}>
                  AI peak:{" "}
                  {usageFlowStats.peakAiDay
                    ? formatDateLabel(usageFlowStats.peakAiDay.dayKey)
                    : "No data"}
                </Text>
              </YStack>
            </XStack>
            <FlatList
              horizontal
              data={[0]}
              keyExtractor={() => "timeline"}
              renderItem={() => (
                <YStack>
                  <XStack justifyContent="space-between" alignItems="center" marginBottom={8}>
                    <Text fontSize={10} color={theme.colorMuted.val}>
                      {formatCompactNumber(usageFlowScale.maxSearches)} searches
                    </Text>
                    <Text fontSize={10} color={theme.colorMuted.val}>
                      {formatCompactNumber(usageFlowScale.maxAiCalls)} AI calls
                    </Text>
                  </XStack>
                  <TimelineChart
                    data={(overview?.timeline ?? []).map((item) => ({
                      dayKey: item.dayKey,
                      primaryValue: item.searches ?? 0,
                      secondaryValue: item.aiRequests,
                    }))}
                    barColor={theme.primary.val}
                    lineColor={semantic.integration.openai}
                  />
                </YStack>
              )}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingRight: 8, paddingBottom: 2 }}
              nestedScrollEnabled
            />
          </YStack>
        </Card>
      </YStack>

      <YStack>
        <SectionLabel>AI Usage</SectionLabel>
        <Card style={{ borderRadius: 16 }}>
          <YStack gap={10} marginBottom={16}>
            <XStack alignItems="center" justifyContent="space-between" gap={12} flexWrap="wrap">
              <Text fontSize={18} fontFamily="$heading" fontWeight="700" color={theme.color.val}>
                AI detail views
              </Text>
              {detailPanel !== "none" ? (
                <Badge
                  label={
                    detailPanel === "features"
                      ? "Feature breakdown open"
                      : detailPanel === "models"
                        ? "Model costs open"
                        : "Recent events open"
                  }
                  color={theme.primary.val}
                />
              ) : null}
            </XStack>
            <Text fontSize={13} fontFamily="$body" color={theme.colorMuted.val}>
              Choose a detailed view here. Costs and usage below are filtered to{" "}
              {formatBilledToLabel(spendSource).toLowerCase()} traffic.
            </Text>
            <XStack gap={8} flexWrap="wrap">
              <DetailToggle
                icon="layers"
                label="Feature breakdown"
                active={detailPanel === "features"}
                onPress={() =>
                  setDetailPanel((current) => (current === "features" ? "none" : "features"))
                }
                tone={theme.primary.val}
              />
              <DetailToggle
                icon="cpu"
                label="Model costs"
                active={detailPanel === "models"}
                onPress={() =>
                  setDetailPanel((current) => (current === "models" ? "none" : "models"))
                }
                tone={semantic.integration.openai}
              />
              <DetailToggle
                icon="clock"
                label="Recent events"
                active={detailPanel === "events"}
                onPress={() =>
                  setDetailPanel((current) => (current === "events" ? "none" : "events"))
                }
                tone={semantic.status.info}
              />
            </XStack>
          </YStack>

          <XStack justifyContent="space-between" gap={16} flexWrap="wrap">
            <YStack flex={1} gap={10}>
              <Text fontSize={17} fontFamily="$heading" fontWeight="700" color={theme.color.val}>
                Model spend and token load
              </Text>
              <Text fontSize={13} color={theme.colorMuted.val} lineHeight={18}>
                User-visible actions stay compact here. Detailed pipeline work, fallback chains, and
                recent operations live in the drilldowns.
              </Text>
              <XStack gap={10} flexWrap="wrap">
                <Badge
                  label={`${formatCompactNumber(overview?.rangeTotals.aiInputTokens ?? 0)} input tokens`}
                  color={semantic.integration.openai}
                />
                <Badge
                  label={`${formatCompactNumber(overview?.rangeTotals.aiOutputTokens ?? 0)} output tokens`}
                />
                <Badge
                  label={`${formatCompactNumber(overview?.rangeTotals.aiRequests ?? 0)} backend ops`}
                  color={semantic.status.info}
                />
                <Badge
                  label={`${Math.round((overview?.rangeTotals.failureRate ?? 0) * 100)}% failure rate`}
                  color={
                    (overview?.rangeTotals.failureRate ?? 0) > 0.08
                      ? semantic.status.error
                      : semantic.status.success
                  }
                />
                {actionToOpRatio ? (
                  <Badge
                    label={`${actionToOpRatio.toFixed(1)} ops / action`}
                    color={semantic.status.warning}
                  />
                ) : null}
              </XStack>
            </YStack>
            <YStack
              minWidth={isCompact ? "100%" : 120}
              paddingHorizontal={14}
              paddingVertical={12}
              borderRadius={18}
              backgroundColor={withAlpha(semantic.integration.openai, "12")}
              gap={4}
            >
              <Text fontSize={12} color={theme.colorMuted.val}>
                Top model
              </Text>
              <Text fontSize={15} fontFamily="$body" fontWeight="700" color={theme.color.val}>
                {overview?.topModel?.model ?? "No data"}
              </Text>
              <Text fontSize={12} color={theme.colorMuted.val}>
                {overview?.topModel?.feature
                  ? formatFeatureLabel(overview.topModel.feature)
                  : "Waiting for tracked usage"}
              </Text>
              {topBackgroundFeature ? (
                <Text fontSize={12} color={theme.colorMuted.val}>
                  Top background: {formatFeatureLabel(topBackgroundFeature.feature)}
                </Text>
              ) : null}
            </YStack>
          </XStack>

          {topModels.length > 0 ? (
            <YStack marginTop={16} gap={10}>
              {topModels.slice(0, 3).map((item, index) => (
                <XStack
                  key={`${item.provider}-${item.model}-${item.operation}-${item.feature}-${index}`}
                  alignItems="center"
                  gap={10}
                >
                  <YStack
                    width={10}
                    height={10}
                    borderRadius={5}
                    backgroundColor={semantic.integration.openai}
                  />
                  <YStack flex={1}>
                    <Text fontSize={13} fontWeight="600" color={theme.color.val}>
                      {item.model}
                    </Text>
                    <Text fontSize={12} color={theme.colorMuted.val}>
                      {formatFeatureLabel(item.feature)} · {formatStageLabel(item.stage)} ·{" "}
                      {formatBilledToLabel(item.billedTo)} · {formatCompactNumber(item.requests)}{" "}
                      calls
                    </Text>
                  </YStack>
                  <Text fontSize={13} fontWeight="700" color={theme.color.val}>
                    {formatUsdMicros(item.costUsdMicros)}
                  </Text>
                </XStack>
              ))}
            </YStack>
          ) : (
            <Text marginTop={16} fontSize={13} color={theme.colorMuted.val}>
              AI tracking starts from the rollout of this analytics update.
            </Text>
          )}
        </Card>
      </YStack>

      <YStack>
        <SectionLabel>Search & Retrieval</SectionLabel>
        <Card style={{ borderRadius: 16 }}>
          <XStack flexWrap="wrap" gap={10}>
            <YStack
              flex={1}
              minWidth={110}
              padding={14}
              borderRadius={18}
              backgroundColor={withAlpha(theme.primary.val, "10")}
            >
              <Text fontSize={12} color={theme.colorMuted.val}>
                Cache hit rate
              </Text>
              <Text fontSize={24} fontFamily="$heading" fontWeight="700" color={theme.color.val}>
                {Math.round((overview?.rangeTotals.searchCacheHitRate ?? 0) * 100)}%
              </Text>
            </YStack>
            <YStack
              flex={1}
              minWidth={110}
              padding={14}
              borderRadius={18}
              backgroundColor={withAlpha(semantic.status.success, "10")}
            >
              <Text fontSize={12} color={theme.colorMuted.val}>
                Avg latency
              </Text>
              <Text fontSize={24} fontFamily="$heading" fontWeight="700" color={theme.color.val}>
                {Math.round(overview?.rangeTotals.avgSearchLatencyMs ?? 0)} ms
              </Text>
            </YStack>
            <YStack
              flex={1}
              minWidth={110}
              padding={14}
              borderRadius={18}
              backgroundColor={withAlpha(semantic.status.warning, "10")}
            >
              <Text fontSize={12} color={theme.colorMuted.val}>
                Vector / full-text
              </Text>
              <Text fontSize={24} fontFamily="$heading" fontWeight="700" color={theme.color.val}>
                {formatCompactNumber(overview?.rangeTotals.vectorSearches ?? 0)}/
                {formatCompactNumber(overview?.rangeTotals.fullTextSearches ?? 0)}
              </Text>
            </YStack>
          </XStack>
          <XStack marginTop={14} gap={10} flexWrap="wrap">
            <Badge
              label={`${formatCompactNumber(overview?.rangeTotals.keywordSearches ?? 0)} keyword assists`}
            />
            <Badge
              label={`${Math.round(overview?.rangeTotals.avgSearchResults ?? 0)} avg results`}
            />
            <Badge
              label={`${formatCompactNumber(overview?.totals.totalSearches ?? 0)} tracked searches`}
            />
          </XStack>
        </Card>
      </YStack>

      <BottomSheetModal
        ref={modalRef}
        index={0}
        name="analyticsDetail"
        snapPoints={["86%"]}
        keyboardBehavior="interactive"
        enablePanDownToClose
        detached={isLargeScreen}
        style={
          isLargeScreen
            ? {
                marginHorizontal: 16,
                width: "100%",
                maxWidth: 720,
                alignSelf: "center",
              }
            : undefined
        }
        topInset={isLargeScreen ? insets.top + 16 : insets.top}
        bottomInset={isLargeScreen ? insets.bottom + 16 : insets.bottom}
        keyboardBlurBehavior="restore"
        enableBlurKeyboardOnGesture
        enableContentPanningGesture={false}
        android_keyboardInputMode="adjustResize"
        stackBehavior="push"
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: theme.surface.val }}
        onDismiss={handleDismiss}
      >
        <BottomSheetScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 10,
            paddingBottom: 32,
            gap: 14,
          }}
          nestedScrollEnabled
        >
          <XStack alignItems="center" justifyContent="space-between" gap={12}>
            <YStack flex={1} minWidth={0} gap={2}>
              <Text fontSize={18} fontWeight="700" color={theme.color.val}>
                {detailMeta?.title ?? "AI Details"}
              </Text>
              {detailMeta?.subtitle ? (
                <Text fontSize={13} lineHeight={18} color={theme.colorMuted.val}>
                  {detailMeta.subtitle}
                </Text>
              ) : null}
            </YStack>
            <PressableScale onPress={() => setDetailPanel("none")}>
              <YStack width={36} height={36} alignItems="center" justifyContent="center">
                <Feather name="x" size={18} color={theme.colorMuted.val} />
              </YStack>
            </PressableScale>
          </XStack>

          {detailPanel === "features" ? (
            <Card style={{ borderRadius: 16 }}>
              <YStack gap={12}>
                <Text fontSize={13} color={theme.colorMuted.val}>
                  {formatCompactNumber(overview?.rangeTotals.aiActions ?? 0)} user-visible actions
                  triggered {formatCompactNumber(overview?.rangeTotals.aiRequests ?? 0)} backend AI
                  operations in this range.
                </Text>
                {aiFeatureBreakdown.length > 0 ? (
                  aiFeatureBreakdown.map((item) => (
                    <YStack
                      key={`${item.feature}-${item.stage}-${item.visibility}`}
                      gap={8}
                      padding={12}
                      borderRadius={14}
                      backgroundColor={withAlpha(
                        item.visibility === "user_visible"
                          ? theme.primary.val
                          : semantic.integration.openai,
                        "08",
                      )}
                      style={appShadow(
                        item.visibility === "user_visible"
                          ? theme.primary.val
                          : semantic.integration.openai,
                        "hairline",
                      )}
                    >
                      <XStack alignItems="center" gap={10}>
                        <YStack
                          width={10}
                          height={10}
                          borderRadius={5}
                          backgroundColor={
                            item.visibility === "user_visible"
                              ? theme.primary.val
                              : semantic.integration.openai
                          }
                        />
                        <YStack flex={1}>
                          <Text fontSize={13} fontWeight="700" color={theme.color.val}>
                            {formatFeatureLabel(item.feature)}
                          </Text>
                          <Text fontSize={12} color={theme.colorMuted.val}>
                            {formatStageLabel(item.stage)} ·{" "}
                            {item.visibility === "user_visible" ? "user visible" : "background"} ·{" "}
                            {formatBilledToLabel(item.billedTo)} ·{" "}
                            {formatCompactNumber(item.requests)} calls
                          </Text>
                        </YStack>
                        <YStack alignItems="flex-end">
                          <Text fontSize={13} fontWeight="700" color={theme.color.val}>
                            {formatUsdMicros(item.costUsdMicros)}
                          </Text>
                          <Text fontSize={11} color={theme.colorMuted.val}>
                            {formatCompactNumber(item.totalTokens)} tokens
                          </Text>
                        </YStack>
                      </XStack>
                      <XStack gap={8} flexWrap="wrap">
                        <Badge
                          label={`${formatCompactNumber(item.inputTokens)} in`}
                          color={semantic.integration.openai}
                        />
                        <Badge label={`${formatCompactNumber(item.outputTokens)} out`} />
                        <Badge
                          label={`${Math.round(
                            item.requests > 0 ? ((item.errors ?? 0) / item.requests) * 100 : 0,
                          )}% failures`}
                          color={
                            (item.errors ?? 0) > 0 ? semantic.status.error : semantic.status.success
                          }
                        />
                      </XStack>
                    </YStack>
                  ))
                ) : (
                  <Text fontSize={13} color={theme.colorMuted.val}>
                    No feature-level AI data yet for this range.
                  </Text>
                )}
              </YStack>
            </Card>
          ) : null}

          {detailPanel === "models" ? (
            <Card style={{ borderRadius: 16 }}>
              <YStack gap={12}>
                {aiBreakdown.length > 0 ? (
                  aiBreakdown.map((item, index) => (
                    <XStack
                      key={`${item.provider}-${item.model}-${item.operation}-${item.feature}-${index}`}
                      alignItems="center"
                      gap={10}
                    >
                      <YStack flex={1}>
                        <Text fontSize={13} fontWeight="700" color={theme.color.val}>
                          {item.model}
                        </Text>
                        <Text fontSize={12} color={theme.colorMuted.val}>
                          {formatFeatureLabel(item.feature)} · {formatStageLabel(item.stage)} ·{" "}
                          {formatBilledToLabel(item.billedTo)}
                        </Text>
                      </YStack>
                      <YStack alignItems="flex-end">
                        <Text fontSize={13} fontWeight="700" color={theme.color.val}>
                          {formatUsdMicros(item.costUsdMicros)}
                        </Text>
                        <Text fontSize={11} color={theme.colorMuted.val}>
                          {formatCompactNumber(item.totalTokens)} tokens
                        </Text>
                      </YStack>
                    </XStack>
                  ))
                ) : (
                  <Text fontSize={13} color={theme.colorMuted.val}>
                    No model-level AI data yet for this range.
                  </Text>
                )}
              </YStack>
            </Card>
          ) : null}

          {detailPanel === "events" ? (
            <Card style={{ borderRadius: 16 }}>
              <YStack gap={12}>
                {recentEvents.length > 0 ? (
                  recentEvents.map((event) => (
                    <XStack key={event._id} alignItems="center" gap={10}>
                      <YStack
                        width={12}
                        height={12}
                        borderRadius={6}
                        backgroundColor={
                          event.status === "error"
                            ? semantic.status.error
                            : semantic.integration.openai
                        }
                      />
                      <YStack flex={1}>
                        <Text fontSize={13} fontWeight="700" color={theme.color.val}>
                          {event.model}
                        </Text>
                        <Text fontSize={12} color={theme.colorMuted.val}>
                          {formatFeatureLabel(event.feature)} · {formatStageLabel(event.stage)} ·{" "}
                          {formatBilledToLabel(event.billedTo)} ·{" "}
                          {new Date(event.occurredAt).toLocaleString()}
                        </Text>
                      </YStack>
                      <YStack alignItems="flex-end">
                        <Text fontSize={12} fontWeight="700" color={theme.color.val}>
                          {event.costUsdMicros ? formatUsdMicros(event.costUsdMicros) : "n/a"}
                        </Text>
                        <Text fontSize={11} color={theme.colorMuted.val}>
                          {event.totalTokens
                            ? `${formatCompactNumber(event.totalTokens)} tok`
                            : (event.visibility ?? event.status)}
                        </Text>
                      </YStack>
                    </XStack>
                  ))
                ) : (
                  <Text fontSize={13} color={theme.colorMuted.val}>
                    No recent AI events yet.
                  </Text>
                )}
              </YStack>
            </Card>
          ) : null}
        </BottomSheetScrollView>
      </BottomSheetModal>
    </AppScreen>
  );
}
