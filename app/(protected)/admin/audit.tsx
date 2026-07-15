import React from "react";
import { ActivityIndicator } from "react-native";
import { usePaginatedQuery } from "convex/react";
import { Text, XStack, YStack } from "tamagui";

import { api } from "@/convex/_generated/api";
import { SurfaceCard } from "@/components/ui/SurfaceCard";
import { Badge } from "@/components/ui/Badge";
import { AppTextField } from "@/components/ui/AppTextField";
import { AppButton } from "@/components/ui/AppButton";
import { useAdminState } from "@/components/admin/AdminStateContext";
import { useAppTheme } from "@/hooks/useAppTheme";

const PAGE_SIZE = 40;

export default function AdminAuditScreen() {
  const theme = useAppTheme();
  const { range, setSelectedEntity } = useAdminState();
  const [actionQuery, setActionQuery] = React.useState("");
  const [targetQuery, setTargetQuery] = React.useState("");

  const {
    results: entries,
    status: pageStatus,
    loadMore,
  } = usePaginatedQuery(
    api.admin.listAdminActions,
    {
      actionContains: actionQuery.trim() || undefined,
      targetType: targetQuery.trim() || undefined,
      range,
    },
    { initialNumItems: PAGE_SIZE },
  );

  return (
    <YStack gap={12}>
      <SurfaceCard style={{ borderRadius: 16 }}>
        <XStack gap={8} flexWrap="wrap">
          <YStack minWidth={180} flex={1}>
            <AppTextField
              placeholder="Filter by action (e.g. user.spend_cap)"
              value={actionQuery}
              onChangeText={setActionQuery}
            />
          </YStack>
          <YStack minWidth={180} flex={1}>
            <AppTextField
              placeholder="Filter by target type"
              value={targetQuery}
              onChangeText={setTargetQuery}
            />
          </YStack>
        </XStack>
      </SurfaceCard>

      <SurfaceCard style={{ borderRadius: 16 }}>
        <YStack gap={10}>
          <XStack alignItems="center" justifyContent="space-between">
            <Text fontSize={16} fontFamily="$heading" fontWeight="700" color={theme.color.val}>
              Recent Admin Actions
            </Text>
            <Badge label={`${entries.length} loaded`} />
          </XStack>

          {pageStatus === "LoadingFirstPage" ? (
            <YStack alignItems="center" paddingVertical={30}>
              <ActivityIndicator />
            </YStack>
          ) : entries.length === 0 ? (
            <Text fontSize={13} color={theme.colorMuted.val}>
              No admin actions match these filters.
            </Text>
          ) : (
            entries.map((entry) => (
              <XStack key={entry._id} alignItems="center" justifyContent="space-between" gap={10}>
                <YStack flex={1}>
                  <Text fontSize={13} fontWeight="700" color={theme.color.val}>
                    {entry.action}
                  </Text>
                  <Text fontSize={11} color={theme.colorMuted.val}>
                    {entry.targetType}
                    {entry.targetId ? ` · ${entry.targetId}` : ""}
                  </Text>
                  <Text fontSize={11} color={theme.colorMuted.val}>
                    {new Date(entry.createdAt).toLocaleString()}
                  </Text>
                </YStack>
                <XStack alignItems="center" gap={6}>
                  <Badge label={entry.actor?.name ?? "Unknown admin"} tone="neutral" />
                  <AppButton
                    title="Trace"
                    size="sm"
                    variant="ghost"
                    onPress={() => setSelectedEntity({ type: "action", id: String(entry._id) })}
                  />
                </XStack>
              </XStack>
            ))
          )}

          {pageStatus === "CanLoadMore" ? (
            <AppButton
              title="Load more"
              size="sm"
              variant="secondary"
              onPress={() => loadMore(PAGE_SIZE)}
            />
          ) : pageStatus === "LoadingMore" ? (
            <YStack alignItems="center" paddingVertical={8}>
              <ActivityIndicator size="small" />
            </YStack>
          ) : null}
        </YStack>
      </SurfaceCard>
    </YStack>
  );
}
