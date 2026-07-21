import React from "react";
import { useQuery } from "convex/react";
import { XStack, YStack } from "tamagui";

import { api } from "@/convex/_generated/api";
import { useAdminState } from "@/components/admin/AdminStateContext";
import { AdminStatTile } from "@/components/admin/AdminStatTile";
import { DonutChart } from "@/components/admin/charts/DonutChart";
import { formatCompactNumber, formatUsdMicros } from "@/components/admin/charts/palette";
import { InteractiveTimelineChart } from "@/components/admin/InteractiveTimelineChart";
import { useSemanticColors } from "@/hooks/useSemanticColors";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import {
  AdminEmptyState,
  AdminLoadingState,
  AdminMetricGrid,
  AdminPanel,
  AdminSectionHeader,
} from "@/components/admin/AdminWorkspace";

export default function AdminAnalyticsLabScreen() {
  const semantic = useSemanticColors();
  const responsive = useResponsiveLayout();
  const { range, segmentFamily, compareMode, refreshKey, setSelectedTimepoint } = useAdminState();
  const data = useQuery(api.admin.analyticsLab, { range, segmentFamily, compareMode, refreshKey });

  if (!data) return <AdminLoadingState label="Loading analytics" />;

  const totalSearches = data.timeline.reduce((acc, row) => acc + row.searches, 0);
  const totalAi = data.timeline.reduce((acc, row) => acc + row.aiRequests, 0);
  const totalCost = data.timeline.reduce((acc, row) => acc + row.costUsdMicros, 0);

  return (
    <>
      <AdminMetricGrid>
        <AdminStatTile label="AI in range" value={formatCompactNumber(totalAi)} />
        <AdminStatTile label="Searches in range" value={formatCompactNumber(totalSearches)} />
        <AdminStatTile label="Estimated cost" value={formatUsdMicros(totalCost)} />
      </AdminMetricGrid>

      <XStack
        gap={12}
        alignItems="flex-start"
        flexDirection={responsive.isExpanded ? "row" : "column"}
      >
        <YStack
          flex={responsive.isExpanded ? 1.55 : undefined}
          width={responsive.isExpanded ? undefined : "100%"}
        >
          <AdminPanel>
            <InteractiveTimelineChart
              title="Segment Timeline"
              subtitle={`${segmentFamily} activity on a shared count scale`}
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
          </AdminPanel>
        </YStack>
        <YStack flex={1} width={responsive.isExpanded ? undefined : "100%"}>
          <AdminPanel>
            <YStack gap={12}>
              <AdminSectionHeader
                title="Segment distribution"
                detail={`${segmentFamily} users in this period`}
              />
              {data.segments.length === 0 ? (
                <AdminEmptyState
                  title="No segment data"
                  detail="This period has no users in the selected segment."
                />
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
          </AdminPanel>
        </YStack>
      </XStack>
    </>
  );
}
