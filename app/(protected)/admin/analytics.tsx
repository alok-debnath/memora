import React from "react";
import { ActivityIndicator } from "react-native";
import { useQuery } from "convex/react";
import { Text, XStack, YStack } from "tamagui";

import { api } from "@/convex/_generated/api";
import { Card } from "@/components/ui/Card";
import { useAdminState } from "@/components/admin/AdminStateContext";
import { AdminStatTile } from "@/components/admin/AdminStatTile";
import { DonutChart } from "@/components/admin/charts/DonutChart";
import { formatCompactNumber, formatUsdMicros } from "@/components/admin/charts/palette";
import { useAppTheme } from "@/hooks/useAppTheme";
import { InteractiveTimelineChart } from "@/components/admin/InteractiveTimelineChart";
import { useSemanticColors } from "@/hooks/useSemanticColors";

export default function AdminAnalyticsLabScreen() {
  const theme = useAppTheme();
  const semantic = useSemanticColors();
  const { range, segmentFamily, compareMode, setSelectedTimepoint } = useAdminState();
  const data = useQuery(api.admin.analyticsLab, { range, segmentFamily, compareMode });

  if (!data) {
    return (
      <YStack alignItems="center" paddingVertical={44}>
        <ActivityIndicator color={semantic.status.info} />
      </YStack>
    );
  }

  const totalSearches = data.timeline.reduce((acc, row) => acc + row.searches, 0);
  const totalAi = data.timeline.reduce((acc, row) => acc + row.aiRequests, 0);
  const totalCost = data.timeline.reduce((acc, row) => acc + row.costUsdMicros, 0);

  return (
    <>
      <YStack>
        <Card style={{ borderRadius: 16 }}>
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
            barColor={semantic.status.info}
            lineColor={semantic.integration.openai}
            onSelectPoint={(point) => setSelectedTimepoint(point?.label ?? null)}
          />
        </Card>
      </YStack>

      <YStack>
        <XStack gap={10} flexWrap="wrap">
          <AdminStatTile label="AI in range" value={formatCompactNumber(totalAi)} />
          <AdminStatTile label="Searches in range" value={formatCompactNumber(totalSearches)} />
          <AdminStatTile label="Estimated cost" value={formatUsdMicros(totalCost)} />
        </XStack>
      </YStack>

      <Card style={{ borderRadius: 16 }}>
        <YStack gap={12}>
          <Text fontSize={16} fontFamily="$heading" fontWeight="700" color={theme.color.val}>
            Segment Distribution
          </Text>
          {data.segments.length === 0 ? (
            <Text fontSize={13} color={theme.colorMuted.val}>
              No segment data available.
            </Text>
          ) : (
            <DonutChart
              slices={data.segments.map((segment: { label: string; users: number }) => ({
                label: segment.label,
                value: segment.users,
              }))}
              centerLabel={segmentFamily}
            />
          )}
        </YStack>
      </Card>
    </>
  );
}
