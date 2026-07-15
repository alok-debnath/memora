import React from "react";
import { ActivityIndicator } from "react-native";
import { useQuery } from "convex/react";
import { Text, XStack, YStack } from "tamagui";

import { api } from "@/convex/_generated/api";
import { SurfaceCard } from "@/components/ui/SurfaceCard";
import { useAdminState } from "@/components/admin/AdminStateContext";
import { AdminStatTile } from "@/components/admin/AdminStatTile";
import { AlertBanner } from "@/components/admin/AlertBanner";
import { BarChart } from "@/components/admin/charts/BarChart";
import { formatCompactNumber } from "@/components/admin/charts/palette";
import { useAppTheme } from "@/hooks/useAppTheme";
import { InteractiveTimelineChart } from "@/components/admin/InteractiveTimelineChart";
import { useSemanticColors } from "@/hooks/useSemanticColors";

function formatPct(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}

function deltaPct(current: number, previous: number): number | undefined {
  if (previous <= 0) return undefined;
  return (current - previous) / previous;
}

export default function AdminOverviewScreen() {
  const theme = useAppTheme();
  const semantic = useSemanticColors();
  const { range, compareMode, setSelectedTimepoint } = useAdminState();
  const data = useQuery(api.admin.dashboardOverview, { range, compareMode });

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
        <YStack gap={8}>
          {data.anomalies.map((item) => (
            <AlertBanner
              key={item.key}
              alert={{
                key: item.key,
                severity: item.severity,
                title: item.title,
                message: item.message,
                updatedAt: Date.now(),
              }}
            />
          ))}
        </YStack>
      ) : null}

      <YStack>
        <XStack gap={10} flexWrap="wrap">
          <AdminStatTile
            label="AI requests"
            value={formatCompactNumber(data.current.aiRequests)}
            hint={`${formatCompactNumber(data.current.aiErrors)} errors`}
            deltaPct={deltaPct(data.current.aiRequests, data.previous.aiRequests)}
          />
          <AdminStatTile
            label="Failure rate"
            value={formatPct(data.current.aiFailureRate)}
            hint={`Prev ${formatPct(data.previous.aiFailureRate)}`}
            deltaPct={deltaPct(data.current.aiFailureRate, data.previous.aiFailureRate)}
            goodWhenDown
          />
          <AdminStatTile
            label="Searches"
            value={formatCompactNumber(data.current.searches)}
            hint={`${formatCompactNumber(data.current.deepSearches)} deep`}
            deltaPct={deltaPct(data.current.searches, data.previous.searches)}
          />
          <AdminStatTile
            label="Open alerts"
            value={formatCompactNumber(data.openIncidents)}
            hint="Threshold breaches"
          />
        </XStack>
      </YStack>

      <SurfaceCard style={{ borderRadius: 16 }}>
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
      </SurfaceCard>

      <YStack>
        <XStack gap={10} flexWrap="wrap" alignItems="stretch">
          <SurfaceCard style={{ borderRadius: 16, flex: 1, minWidth: 260 }}>
            <YStack gap={12}>
              <Text fontSize={16} fontFamily="$heading" fontWeight="700" color={theme.color.val}>
                Provider Comparison
              </Text>
              <BarChart
                rows={data.comparison.provider.map(
                  (row: { key: string; requests: number; failureRate: number }) => ({
                    label: row.key,
                    value: row.requests,
                    detail: `${formatPct(row.failureRate)} fail`,
                    color: row.failureRate > 0.08 ? semantic.status.error : semantic.status.info,
                  }),
                )}
              />
            </YStack>
          </SurfaceCard>

          <SurfaceCard style={{ borderRadius: 16, flex: 1, minWidth: 260 }}>
            <YStack gap={12}>
              <Text fontSize={16} fontFamily="$heading" fontWeight="700" color={theme.color.val}>
                Capability Comparison
              </Text>
              <BarChart
                rows={data.comparison.capability.map(
                  (row: { key: string; requests: number; failureRate: number }) => ({
                    label: row.key,
                    value: row.requests,
                    detail: `${formatPct(row.failureRate)} fail`,
                    color: row.failureRate > 0.08 ? semantic.status.error : semantic.status.info,
                  }),
                )}
              />
            </YStack>
          </SurfaceCard>
        </XStack>
      </YStack>
    </>
  );
}
