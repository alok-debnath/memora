import React from "react";
import { ActivityIndicator } from "react-native";
import { useQuery } from "convex/react";
import { Text, XStack, YStack } from "tamagui";

import { api } from "@/convex/_generated/api";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useAdminState } from "@/components/admin/AdminStateContext";
import { InteractiveTimelineChart } from "@/components/admin/InteractiveTimelineChart";
import { integrationAccentColors, statusAccentColors } from "@/constants/colors";

function formatCompact(value: number) {
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value);
}

function formatPct(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}

function Kpi({
  label,
  value,
  hint,
  color,
}: {
  label: string;
  value: string;
  hint: string;
  color: string;
}) {
  return (
    <Card style={{ borderRadius: 20, flex: 1, minWidth: 150 }}>
      <Text fontSize={12} color="$colorMuted">
        {label}
      </Text>
      <Text marginTop={4} fontSize={24} fontFamily="$heading" fontWeight="700" color="$color">
        {value}
      </Text>
      <Text marginTop={1} fontSize={11} color={color}>
        {hint}
      </Text>
    </Card>
  );
}

export default function AdminOverviewScreen() {
  const { range, compareMode, refreshKey, setSelectedTimepoint } = useAdminState();
  const data = useQuery(api.admin.dashboardOverview, { range, compareMode, refreshKey });

  if (!data) {
    return (
      <YStack alignItems="center" paddingVertical={44}>
        <ActivityIndicator color={integrationAccentColors.openai} />
      </YStack>
    );
  }

  return (
    <>
      {data.anomalies.length > 0 ? (
        <YStack>
          <Card style={{ borderRadius: 20 }}>
            <YStack gap={8}>
              <Text fontSize={15} fontFamily="$heading" fontWeight="700" color="$color">
                Anomaly Strip
              </Text>
              {data.anomalies.map((item: any) => (
                <XStack key={item.key} alignItems="center" justifyContent="space-between" gap={8}>
                  <YStack flex={1}>
                    <Text fontSize={12} fontWeight="700" color="$color">
                      {item.title}
                    </Text>
                    <Text fontSize={11} color="$colorMuted">
                      {item.message}
                    </Text>
                  </YStack>
                  <Badge
                    label={item.severity}
                    color={
                      item.severity === "critical"
                        ? statusAccentColors.error
                        : item.severity === "warning"
                          ? statusAccentColors.warning
                          : statusAccentColors.info
                    }
                  />
                </XStack>
              ))}
            </YStack>
          </Card>
        </YStack>
      ) : null}

      <YStack>
        <XStack gap={10} flexWrap="wrap">
          <Kpi
            label="AI requests"
            value={formatCompact(data.current.aiRequests)}
            hint={`${formatCompact(data.current.aiErrors)} errors`}
            color={integrationAccentColors.openai}
          />
          <Kpi
            label="Failure rate"
            value={formatPct(data.current.aiFailureRate)}
            hint={`Prev ${formatPct(data.previous.aiFailureRate)}`}
            color={
              data.current.aiFailureRate > data.previous.aiFailureRate
                ? statusAccentColors.error
                : statusAccentColors.success
            }
          />
          <Kpi
            label="Searches"
            value={formatCompact(data.current.searches)}
            hint={`${formatCompact(data.current.deepSearches)} deep`}
            color={statusAccentColors.info}
          />
          <Kpi
            label="Open alerts"
            value={formatCompact(data.openIncidents)}
            hint="Threshold breaches"
            color={statusAccentColors.warning}
          />
        </XStack>
      </YStack>

      <Card style={{ borderRadius: 24 }}>
        <InteractiveTimelineChart
          title="Traffic Pressure"
          subtitle={`Tap any point to inspect day-level AI/search load. ${
            compareMode === "previous"
              ? "Previous-period overlay is enabled."
              : "Showing current period only."
          }`}
          points={data.timeline.map((row) => ({
            label: row.dayKey.slice(5),
            primary: row.searches,
            secondary: row.aiRequests,
            compareSecondary: row.compareAiRequests,
          }))}
          primaryLabel="Searches"
          secondaryLabel="AI requests"
          compareLabel="Prev AI requests"
          barColor={statusAccentColors.info}
          lineColor={integrationAccentColors.openai}
          onSelectPoint={(point) => setSelectedTimepoint(point?.label ?? null)}
        />
      </Card>

      <YStack>
        <XStack gap={10} flexWrap="wrap" alignItems="stretch">
          <Card style={{ borderRadius: 24, flex: 1, minWidth: 260 }}>
            <YStack gap={10}>
              <Text fontSize={16} fontFamily="$heading" fontWeight="700" color="$color">
                Provider Comparison
              </Text>
              {data.comparison.provider.map((row: any) => (
                <XStack key={row.key} justifyContent="space-between" alignItems="center">
                  <YStack>
                    <Text fontSize={13} fontWeight="700" color="$color">
                      {row.key}
                    </Text>
                    <Text fontSize={11} color="$colorMuted">
                      {formatCompact(row.requests)} calls
                    </Text>
                  </YStack>
                  <Badge
                    label={formatPct(row.failureRate)}
                    color={
                      row.failureRate > 0.08 ? statusAccentColors.error : statusAccentColors.success
                    }
                  />
                </XStack>
              ))}
            </YStack>
          </Card>

          <Card style={{ borderRadius: 24, flex: 1, minWidth: 260 }}>
            <YStack gap={10}>
              <Text fontSize={16} fontFamily="$heading" fontWeight="700" color="$color">
                Capability Comparison
              </Text>
              {data.comparison.capability.map((row: any) => (
                <XStack key={row.key} justifyContent="space-between" alignItems="center">
                  <YStack>
                    <Text fontSize={13} fontWeight="700" color="$color">
                      {row.key}
                    </Text>
                    <Text fontSize={11} color="$colorMuted">
                      {formatCompact(row.requests)} calls
                    </Text>
                  </YStack>
                  <Badge
                    label={formatPct(row.failureRate)}
                    color={
                      row.failureRate > 0.08 ? statusAccentColors.error : statusAccentColors.success
                    }
                  />
                </XStack>
              ))}
            </YStack>
          </Card>
        </XStack>
      </YStack>
    </>
  );
}
