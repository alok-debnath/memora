import React from "react";
import { ActivityIndicator } from "react-native";
import { useQuery } from "convex/react";
import { Text, XStack, YStack } from "tamagui";

import { api } from "@/convex/_generated/api";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useAdminState } from "@/components/admin/AdminStateContext";
import { useAppTheme } from "@/hooks/useAppTheme";
import { InteractiveTimelineChart } from "@/components/admin/InteractiveTimelineChart";
import { useSemanticColors } from "@/hooks/useSemanticColors";

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
  const theme = useAppTheme();
  return (
    <Card style={{ borderRadius: 20, flex: 1, minWidth: 150 }}>
      <Text fontSize={12} color={theme.colorMuted.val}>
        {label}
      </Text>
      <Text
        marginTop={4}
        fontSize={24}
        fontFamily="$heading"
        fontWeight="700"
        color={theme.color.val}
      >
        {value}
      </Text>
      <Text marginTop={1} fontSize={11} color={color}>
        {hint}
      </Text>
    </Card>
  );
}

export default function AdminOverviewScreen() {
  const theme = useAppTheme();
  const semantic = useSemanticColors();
  const { range, compareMode, refreshKey, setSelectedTimepoint } = useAdminState();
  const data = useQuery(api.admin.dashboardOverview, { range, compareMode, refreshKey });

  if (!data) {
    return (
      <YStack alignItems="center" paddingVertical={44}>
        <ActivityIndicator color={semantic.integration.openai} />
      </YStack>
    );
  }

  return (
    <>
      {data.anomalies.length > 0 ? (
        <YStack>
          <Card style={{ borderRadius: 20 }}>
            <YStack gap={8}>
              <Text fontSize={15} fontFamily="$heading" fontWeight="700" color={theme.color.val}>
                Anomaly Strip
              </Text>
              {data.anomalies.map((item: any) => (
                <XStack key={item.key} alignItems="center" justifyContent="space-between" gap={8}>
                  <YStack flex={1}>
                    <Text fontSize={12} fontWeight="700" color={theme.color.val}>
                      {item.title}
                    </Text>
                    <Text fontSize={11} color={theme.colorMuted.val}>
                      {item.message}
                    </Text>
                  </YStack>
                  <Badge
                    label={item.severity}
                    color={
                      item.severity === "critical"
                        ? semantic.status.error
                        : item.severity === "warning"
                          ? semantic.status.warning
                          : semantic.status.info
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
            color={semantic.integration.openai}
          />
          <Kpi
            label="Failure rate"
            value={formatPct(data.current.aiFailureRate)}
            hint={`Prev ${formatPct(data.previous.aiFailureRate)}`}
            color={
              data.current.aiFailureRate > data.previous.aiFailureRate
                ? semantic.status.error
                : semantic.status.success
            }
          />
          <Kpi
            label="Searches"
            value={formatCompact(data.current.searches)}
            hint={`${formatCompact(data.current.deepSearches)} deep`}
            color={semantic.status.info}
          />
          <Kpi
            label="Open alerts"
            value={formatCompact(data.openIncidents)}
            hint="Threshold breaches"
            color={semantic.status.warning}
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
          barColor={semantic.status.info}
          lineColor={semantic.integration.openai}
          onSelectPoint={(point) => setSelectedTimepoint(point?.label ?? null)}
        />
      </Card>

      <YStack>
        <XStack gap={10} flexWrap="wrap" alignItems="stretch">
          <Card style={{ borderRadius: 24, flex: 1, minWidth: 260 }}>
            <YStack gap={10}>
              <Text fontSize={16} fontFamily="$heading" fontWeight="700" color={theme.color.val}>
                Provider Comparison
              </Text>
              {data.comparison.provider.map((row: any) => (
                <XStack key={row.key} justifyContent="space-between" alignItems="center">
                  <YStack>
                    <Text fontSize={13} fontWeight="700" color={theme.color.val}>
                      {row.key}
                    </Text>
                    <Text fontSize={11} color={theme.colorMuted.val}>
                      {formatCompact(row.requests)} calls
                    </Text>
                  </YStack>
                  <Badge
                    label={formatPct(row.failureRate)}
                    color={row.failureRate > 0.08 ? semantic.status.error : semantic.status.success}
                  />
                </XStack>
              ))}
            </YStack>
          </Card>

          <Card style={{ borderRadius: 24, flex: 1, minWidth: 260 }}>
            <YStack gap={10}>
              <Text fontSize={16} fontFamily="$heading" fontWeight="700" color={theme.color.val}>
                Capability Comparison
              </Text>
              {data.comparison.capability.map((row: any) => (
                <XStack key={row.key} justifyContent="space-between" alignItems="center">
                  <YStack>
                    <Text fontSize={13} fontWeight="700" color={theme.color.val}>
                      {row.key}
                    </Text>
                    <Text fontSize={11} color={theme.colorMuted.val}>
                      {formatCompact(row.requests)} calls
                    </Text>
                  </YStack>
                  <Badge
                    label={formatPct(row.failureRate)}
                    color={row.failureRate > 0.08 ? semantic.status.error : semantic.status.success}
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
