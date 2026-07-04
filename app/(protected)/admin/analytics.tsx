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

function formatUsdMicros(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value / 1_000_000);
}

export default function AdminAnalyticsLabScreen() {
  const { range, segmentFamily, compareMode, refreshKey, setSelectedTimepoint } = useAdminState();
  const data = useQuery(api.admin.analyticsLab, { range, segmentFamily, compareMode, refreshKey });

  if (!data) {
    return (
      <YStack alignItems="center" paddingVertical={44}>
        <ActivityIndicator color={statusAccentColors.info} />
      </YStack>
    );
  }

  const totalSearches = data.timeline.reduce((acc, row) => acc + row.searches, 0);
  const totalAi = data.timeline.reduce((acc, row) => acc + row.aiRequests, 0);
  const totalCost = data.timeline.reduce((acc, row) => acc + row.costUsdMicros, 0);

  return (
    <>
      <YStack>
        <Card style={{ borderRadius: 24 }}>
          <InteractiveTimelineChart
            title="Segment Timeline"
            subtitle={`Live ${segmentFamily} lens. Tap points for day-level comparison. ${
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
      </YStack>

      <YStack>
        <XStack gap={10} flexWrap="wrap">
          <Card style={{ borderRadius: 22, flex: 1, minWidth: 180 }}>
            <Text fontSize={12} color="$colorMuted">
              AI in range
            </Text>
            <Text marginTop={4} fontSize={24} fontFamily="$heading" fontWeight="700" color="$color">
              {formatCompact(totalAi)}
            </Text>
          </Card>
          <Card style={{ borderRadius: 22, flex: 1, minWidth: 180 }}>
            <Text fontSize={12} color="$colorMuted">
              Searches in range
            </Text>
            <Text marginTop={4} fontSize={24} fontFamily="$heading" fontWeight="700" color="$color">
              {formatCompact(totalSearches)}
            </Text>
          </Card>
          <Card style={{ borderRadius: 22, flex: 1, minWidth: 180 }}>
            <Text fontSize={12} color="$colorMuted">
              Estimated cost
            </Text>
            <Text marginTop={4} fontSize={24} fontFamily="$heading" fontWeight="700" color="$color">
              {formatUsdMicros(totalCost)}
            </Text>
          </Card>
        </XStack>
      </YStack>

      <Card style={{ borderRadius: 24 }}>
        <YStack gap={10}>
          <Text fontSize={16} fontFamily="$heading" fontWeight="700" color="$color">
            Segment Distribution
          </Text>
          {data.segments.length === 0 ? (
            <Text fontSize={13} color="$colorMuted">
              No segment data available.
            </Text>
          ) : (
            data.segments.map((segment: any) => (
              <XStack key={segment.key} justifyContent="space-between" alignItems="center">
                <YStack>
                  <Text fontSize={13} fontWeight="700" color="$color">
                    {segment.label}
                  </Text>
                  <Text fontSize={11} color="$colorMuted">
                    {segment.key}
                  </Text>
                </YStack>
                <Badge label={formatCompact(segment.users)} color={statusAccentColors.info} />
              </XStack>
            ))
          )}
        </YStack>
      </Card>
    </>
  );
}
