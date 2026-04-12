import React, { useMemo, useState } from "react";
import { View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import Svg, { Line, Path, Rect, Text as SvgText } from "react-native-svg";
import Animated, { FadeInUp } from "react-native-reanimated";
import { Text, XStack, YStack } from "tamagui";

import { api } from "@/convex/_generated/api";
import { MorePageScaffold } from "@/components/ui/MorePageScaffold";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { PopoverMenu } from "@/components/ui/PopoverMenu";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useAuth } from "@/hooks/useAuth";
import { integrationAccentColors, statAccentColors, statusAccentColors } from "@/constants/colors";
import { withAlpha } from "@/components/ui/themeHelpers";

type RangeKey = "7d" | "30d" | "90d";

const RANGE_OPTIONS = [
  { value: "7d" as const, label: "7D" },
  { value: "30d" as const, label: "30D" },
  { value: "90d" as const, label: "90D" },
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

function formatTrackedDate(timestamp: number | null | undefined) {
  if (!timestamp) return "not tracking yet";
  return new Date(timestamp).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function KPI({
  icon,
  label,
  value,
  tone,
  hint,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  value: string;
  tone: string;
  hint: string;
}) {
  return (
    <Card style={{ flex: 1, minWidth: "47%", borderRadius: 24 }}>
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
        <Text fontSize={11} fontFamily="$body" color="$colorMuted">
          {hint}
        </Text>
      </XStack>
      <Text marginTop={16} fontSize={26} fontFamily="$heading" fontWeight="700" color="$color">
        {value}
      </Text>
      <Text marginTop={4} fontSize={12} fontFamily="$body" color="$colorMuted">
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
    memoryCreates: number;
    aiRequests: number;
  }>;
  barColor: string;
  lineColor: string;
}) {
  const width = Math.max(280, data.length * 24);
  const height = 160;
  const chartHeight = 106;
  const barWidth = Math.max(8, Math.min(14, width / Math.max(data.length * 2, 1)));
  const step = width / Math.max(data.length, 1);
  const maxBar = Math.max(1, ...data.map((item) => item.memoryCreates));
  const maxLine = Math.max(1, ...data.map((item) => item.aiRequests));
  const linePoints = data.map((item, index) => {
    const x = index * step + step / 2;
    const y = chartHeight - (item.aiRequests / maxLine) * chartHeight;
    return { x, y };
  });
  const path = linePoints
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");

  return (
    <Svg width={width} height={height}>
      {data.map((item, index) => {
        const x = index * step + step / 2 - barWidth / 2;
        const barHeight = (item.memoryCreates / maxBar) * chartHeight;
        const isTick =
          index === 0 || index === data.length - 1 || index === Math.floor(data.length / 2);
        return (
          <React.Fragment key={item.dayKey}>
            <Rect
              x={x}
              y={chartHeight - barHeight}
              width={barWidth}
              height={Math.max(4, barHeight)}
              rx={5}
              fill={barColor}
              opacity={0.8}
            />
            {isTick ? (
              <SvgText
                x={index * step + step / 2}
                y={height - 8}
                fontSize={10}
                fill="#7A7A7A"
                textAnchor="middle"
              >
                {formatDateLabel(item.dayKey)}
              </SvgText>
            ) : null}
          </React.Fragment>
        );
      })}
      {linePoints.length > 1 ? (
        <Path d={path} fill="none" stroke={lineColor} strokeWidth={2.5} />
      ) : null}
      {linePoints.map((point, index) => (
        <Rect
          key={`${data[index]?.dayKey}-dot`}
          x={point.x - 2}
          y={point.y - 2}
          width={4}
          height={4}
          rx={2}
          fill={lineColor}
        />
      ))}
    </Svg>
  );
}

export default function AnalyticsScreen() {
  const theme = useAppTheme();
  const { token } = useAuth();
  const [range, setRange] = useState<RangeKey>("30d");
  const [detailPanel, setDetailPanel] = useState<"none" | "models" | "events">("none");

  const overview = useQuery(api.analytics.overview, token ? { token, range } : "skip");
  const aiBreakdown = useQuery(api.analytics.aiBreakdown, token ? { token, range } : "skip") ?? [];
  const recentEventsResult = useQuery(
    api.analytics.recentEvents,
    token ? { token, paginationOpts: { numItems: 10, cursor: null } } : "skip",
  );
  const recentEvents = recentEventsResult?.page ?? [];

  const summaryLine = useMemo(() => {
    if (!overview) return "Loading telemetry and history…";
    return `${formatCompactNumber(overview.rangeTotals.aiRequests)} AI calls, ${formatUsdMicros(
      overview.rangeTotals.aiCostUsdMicros,
    )} spend, ${formatBytes(overview.totals.liveStorageBytes)} live storage.`;
  }, [overview]);

  const topModels = useMemo(() => aiBreakdown.slice(0, 5), [aiBreakdown]);

  return (
    <MorePageScaffold title="Analytics" scrollProps={{ contentContainerStyle: { gap: 18 } }}>
      <Animated.View entering={FadeInUp.duration(360)}>
        <Card
          style={{
            borderRadius: 28,
            padding: 20,
            backgroundColor: theme.card.val,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              position: "absolute",
              right: -20,
              top: -18,
              width: 150,
              height: 150,
              borderRadius: 999,
              backgroundColor: withAlpha(theme.primary.val, "12"),
            }}
          />
          <XStack justifyContent="space-between" gap={14}>
            <YStack flex={1} gap={6}>
              <Badge label="Analytics" color={theme.primary.val} />
              <Text
                fontSize={30}
                lineHeight={34}
                fontFamily="$heading"
                fontWeight="700"
                color="$color"
              >
                Personal ops, without the clutter
              </Text>
              <Text fontSize={14} lineHeight={20} fontFamily="$body" color="$colorMuted">
                {summaryLine}
              </Text>
            </YStack>
            <PopoverMenu
              items={[
                {
                  label: "Show model costs",
                  icon: "cpu",
                  onPress: () => setDetailPanel("models"),
                },
                {
                  label: "Show recent AI events",
                  icon: "clock",
                  onPress: () => setDetailPanel("events"),
                },
                {
                  label: "Hide details",
                  icon: "eye-off",
                  onPress: () => setDetailPanel("none"),
                },
              ]}
            >
              <YStack
                width={44}
                height={44}
                borderRadius={14}
                alignItems="center"
                justifyContent="center"
                backgroundColor={withAlpha(theme.primary.val, "14")}
              >
                <Feather name="more-horizontal" size={18} color={theme.primary.val} />
              </YStack>
            </PopoverMenu>
          </XStack>

          <XStack marginTop={18} gap={10} flexWrap="wrap">
            <Badge
              label={`${overview?.consistency.streakDays ?? 0} day streak`}
              color={theme.primary.val}
            />
            <Badge label={`${overview?.consistency.activeDays ?? 0} active days`} />
            <Badge label={`Tracking since ${formatTrackedDate(overview?.trackingStartedAt)}`} />
          </XStack>
        </Card>
      </Animated.View>

      <Animated.View entering={FadeInUp.delay(80).duration(360)}>
        <SegmentedControl options={RANGE_OPTIONS} value={range} onChange={setRange} />
      </Animated.View>

      <XStack flexWrap="wrap" gap={10}>
        <Animated.View
          entering={FadeInUp.delay(110).duration(360)}
          style={{ flex: 1, minWidth: "46%" }}
        >
          <KPI
            icon="layers"
            label="Total memories"
            value={formatCompactNumber(overview?.totals.totalMemories ?? 0)}
            hint={`${formatCompactNumber(overview?.rangeTotals.memoriesCreated ?? 0)} new in range`}
            tone={statAccentColors.memories}
          />
        </Animated.View>
        <Animated.View
          entering={FadeInUp.delay(140).duration(360)}
          style={{ flex: 1, minWidth: "46%" }}
        >
          <KPI
            icon="book-open"
            label="Diary entries"
            value={formatCompactNumber(overview?.totals.totalDiaryEntries ?? 0)}
            hint={`${formatCompactNumber(overview?.rangeTotals.diaryEntries ?? 0)} logged in range`}
            tone={statAccentColors.diary}
          />
        </Animated.View>
        <Animated.View
          entering={FadeInUp.delay(170).duration(360)}
          style={{ flex: 1, minWidth: "46%" }}
        >
          <KPI
            icon="cpu"
            label="AI spend"
            value={formatUsdMicros(overview?.rangeTotals.aiCostUsdMicros ?? 0)}
            hint={`${formatCompactNumber(overview?.rangeTotals.aiRequests ?? 0)} requests`}
            tone={integrationAccentColors.openai}
          />
        </Animated.View>
        <Animated.View
          entering={FadeInUp.delay(200).duration(360)}
          style={{ flex: 1, minWidth: "46%" }}
        >
          <KPI
            icon="hard-drive"
            label="Live storage"
            value={formatBytes(overview?.totals.liveStorageBytes ?? 0)}
            hint={`${formatCompactNumber(overview?.totals.liveStorageCount ?? 0)} files`}
            tone={statusAccentColors.info}
          />
        </Animated.View>
      </XStack>

      <Animated.View entering={FadeInUp.delay(240).duration(360)}>
        <SectionLabel>Activity Mix</SectionLabel>
        <Card style={{ borderRadius: 26 }}>
          <XStack alignItems="center" justifyContent="space-between" marginBottom={12}>
            <YStack gap={2}>
              <Text fontSize={18} fontFamily="$heading" fontWeight="700" color="$color">
                Output vs AI load
              </Text>
              <Text fontSize={13} fontFamily="$body" color="$colorMuted">
                Bars show memories created. The line tracks AI requests over the same range.
              </Text>
            </YStack>
            <XStack gap={10}>
              <XStack alignItems="center" gap={6}>
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: theme.primary.val,
                  }}
                />
                <Text fontSize={12} color="$colorMuted">
                  Memories
                </Text>
              </XStack>
              <XStack alignItems="center" gap={6}>
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: integrationAccentColors.openai,
                  }}
                />
                <Text fontSize={12} color="$colorMuted">
                  AI calls
                </Text>
              </XStack>
            </XStack>
          </XStack>
          <TimelineChart
            data={(overview?.timeline ?? []).map((item) => ({
              dayKey: item.dayKey,
              memoryCreates: item.memoryCreates,
              aiRequests: item.aiRequests,
            }))}
            barColor={theme.primary.val}
            lineColor={integrationAccentColors.openai}
          />
        </Card>
      </Animated.View>

      <Animated.View entering={FadeInUp.delay(280).duration(360)}>
        <SectionLabel>AI Usage</SectionLabel>
        <Card style={{ borderRadius: 26 }}>
          <XStack justifyContent="space-between" gap={16}>
            <YStack flex={1} gap={10}>
              <Text fontSize={18} fontFamily="$heading" fontWeight="700" color="$color">
                Model spend and token load
              </Text>
              <XStack gap={10} flexWrap="wrap">
                <Badge
                  label={`${formatCompactNumber(overview?.rangeTotals.aiInputTokens ?? 0)} input tokens`}
                  color={integrationAccentColors.openai}
                />
                <Badge
                  label={`${formatCompactNumber(overview?.rangeTotals.aiOutputTokens ?? 0)} output tokens`}
                />
                <Badge
                  label={`${Math.round((overview?.rangeTotals.failureRate ?? 0) * 100)}% failure rate`}
                  color={
                    (overview?.rangeTotals.failureRate ?? 0) > 0.08
                      ? statusAccentColors.error
                      : statusAccentColors.success
                  }
                />
              </XStack>
            </YStack>
            <YStack
              minWidth={120}
              paddingHorizontal={14}
              paddingVertical={12}
              borderRadius={18}
              backgroundColor={withAlpha(integrationAccentColors.openai, "12")}
              gap={4}
            >
              <Text fontSize={12} color="$colorMuted">
                Top model
              </Text>
              <Text fontSize={15} fontFamily="$body" fontWeight="700" color="$color">
                {overview?.topModel?.model ?? "No data"}
              </Text>
              <Text fontSize={12} color="$colorMuted">
                {overview?.topModel?.feature ?? "Waiting for tracked usage"}
              </Text>
            </YStack>
          </XStack>

          {topModels.length > 0 ? (
            <YStack marginTop={16} gap={10}>
              {topModels.slice(0, 3).map((item) => (
                <XStack
                  key={`${item.provider}-${item.model}-${item.operation}-${item.feature}`}
                  alignItems="center"
                  gap={10}
                >
                  <YStack
                    width={10}
                    height={10}
                    borderRadius={5}
                    backgroundColor={integrationAccentColors.openai}
                  />
                  <YStack flex={1}>
                    <Text fontSize={13} fontWeight="600" color="$color">
                      {item.model}
                    </Text>
                    <Text fontSize={12} color="$colorMuted">
                      {item.feature} · {item.operation} · {formatCompactNumber(item.requests)} calls
                    </Text>
                  </YStack>
                  <Text fontSize={13} fontWeight="700" color="$color">
                    {formatUsdMicros(item.costUsdMicros)}
                  </Text>
                </XStack>
              ))}
            </YStack>
          ) : (
            <Text marginTop={16} fontSize={13} color="$colorMuted">
              AI tracking starts from the rollout of this analytics update.
            </Text>
          )}
        </Card>
      </Animated.View>

      <Animated.View entering={FadeInUp.delay(320).duration(360)}>
        <SectionLabel>Storage Footprint</SectionLabel>
        <Card style={{ borderRadius: 26 }}>
          <XStack flexWrap="wrap" gap={10}>
            <YStack
              flex={1}
              minWidth={110}
              padding={14}
              borderRadius={18}
              backgroundColor={withAlpha(statusAccentColors.info, "10")}
            >
              <Text fontSize={12} color="$colorMuted">
                Files live
              </Text>
              <Text fontSize={24} fontFamily="$heading" fontWeight="700" color="$color">
                {formatCompactNumber(overview?.totals.liveStorageCount ?? 0)}
              </Text>
            </YStack>
            <YStack
              flex={1}
              minWidth={110}
              padding={14}
              borderRadius={18}
              backgroundColor={withAlpha(statusAccentColors.success, "10")}
            >
              <Text fontSize={12} color="$colorMuted">
                Uploaded in range
              </Text>
              <Text fontSize={24} fontFamily="$heading" fontWeight="700" color="$color">
                {formatBytes(overview?.rangeTotals.attachmentBytesUploaded ?? 0)}
              </Text>
            </YStack>
            <YStack
              flex={1}
              minWidth={110}
              padding={14}
              borderRadius={18}
              backgroundColor={withAlpha(statusAccentColors.warning, "10")}
            >
              <Text fontSize={12} color="$colorMuted">
                Images / docs
              </Text>
              <Text fontSize={24} fontFamily="$heading" fontWeight="700" color="$color">
                {overview?.totals.liveImageCount ?? 0}/{overview?.totals.liveDocumentCount ?? 0}
              </Text>
            </YStack>
          </XStack>
        </Card>
      </Animated.View>

      <Animated.View entering={FadeInUp.delay(360).duration(360)}>
        <SectionLabel>Topic Footprint</SectionLabel>
        <Card style={{ borderRadius: 26 }}>
          {overview?.topTopics?.length ? (
            <YStack gap={10}>
              {overview.topTopics.map((topic) => (
                <XStack key={topic.id} alignItems="center" gap={10}>
                  <YStack width={10} height={10} borderRadius={5} backgroundColor={topic.color} />
                  <Text flex={1} fontSize={13} fontWeight="600" color="$color" numberOfLines={1}>
                    {topic.name}
                  </Text>
                  <Text fontSize={12} color="$colorMuted">
                    {topic.memoryCount}
                  </Text>
                </XStack>
              ))}
            </YStack>
          ) : (
            <Text fontSize={13} color="$colorMuted">
              Topic analytics will fill in as your memories continue to be processed.
            </Text>
          )}
        </Card>
      </Animated.View>

      {detailPanel === "models" ? (
        <Animated.View entering={FadeInUp.delay(420).duration(360)}>
          <SectionLabel>Model Cost Drilldown</SectionLabel>
          <Card style={{ borderRadius: 26 }}>
            <YStack gap={12}>
              {aiBreakdown.length > 0 ? (
                aiBreakdown.map((item) => (
                  <XStack
                    key={`${item.provider}-${item.model}-${item.operation}-${item.feature}`}
                    alignItems="center"
                    gap={10}
                  >
                    <YStack flex={1}>
                      <Text fontSize={13} fontWeight="700" color="$color">
                        {item.model}
                      </Text>
                      <Text fontSize={12} color="$colorMuted">
                        {item.feature} · {item.operation}
                      </Text>
                    </YStack>
                    <YStack alignItems="flex-end">
                      <Text fontSize={13} fontWeight="700" color="$color">
                        {formatUsdMicros(item.costUsdMicros)}
                      </Text>
                      <Text fontSize={11} color="$colorMuted">
                        {formatCompactNumber(item.totalTokens)} tokens
                      </Text>
                    </YStack>
                  </XStack>
                ))
              ) : (
                <Text fontSize={13} color="$colorMuted">
                  No model-level AI data yet for this range.
                </Text>
              )}
            </YStack>
          </Card>
        </Animated.View>
      ) : null}

      {detailPanel === "events" ? (
        <Animated.View entering={FadeInUp.delay(420).duration(360)}>
          <SectionLabel>Recent AI Events</SectionLabel>
          <Card style={{ borderRadius: 26 }}>
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
                          ? statusAccentColors.error
                          : integrationAccentColors.openai
                      }
                    />
                    <YStack flex={1}>
                      <Text fontSize={13} fontWeight="700" color="$color">
                        {event.model}
                      </Text>
                      <Text fontSize={12} color="$colorMuted">
                        {event.feature} · {event.operation} ·{" "}
                        {new Date(event.occurredAt).toLocaleString()}
                      </Text>
                    </YStack>
                    <YStack alignItems="flex-end">
                      <Text fontSize={12} fontWeight="700" color="$color">
                        {event.costUsdMicros ? formatUsdMicros(event.costUsdMicros) : "n/a"}
                      </Text>
                      <Text fontSize={11} color="$colorMuted">
                        {event.totalTokens
                          ? `${formatCompactNumber(event.totalTokens)} tok`
                          : event.status}
                      </Text>
                    </YStack>
                  </XStack>
                ))
              ) : (
                <Text fontSize={13} color="$colorMuted">
                  No recent AI events yet.
                </Text>
              )}
            </YStack>
          </Card>
        </Animated.View>
      ) : null}
    </MorePageScaffold>
  );
}
