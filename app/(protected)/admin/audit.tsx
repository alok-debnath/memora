import React from "react";
import { ActivityIndicator } from "react-native";
import { useQuery } from "convex/react";
import { Text, XStack, YStack } from "tamagui";

import { api } from "@/convex/_generated/api";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { AppTextField } from "@/components/ui/AppTextField";
import { AppButton } from "@/components/ui/AppButton";
import { useAdminState } from "@/components/admin/AdminStateContext";
import { useAppTheme } from "@/hooks/useAppTheme";

export default function AdminAuditScreen() {
  const theme = useAppTheme();
  const { range, refreshKey, setSelectedEntity } = useAdminState();
  const [actionQuery, setActionQuery] = React.useState("");
  const [targetQuery, setTargetQuery] = React.useState("");
  const logs = useQuery(api.admin.listAdminActions, {
    paginationOpts: { numItems: 40, cursor: null },
    actionContains: actionQuery.trim() || undefined,
    targetType: targetQuery.trim() || undefined,
    range,
    refreshKey,
  });

  if (!logs) {
    return (
      <YStack alignItems="center" paddingVertical={40}>
        <ActivityIndicator />
      </YStack>
    );
  }

  return (
    <YStack>
      <YStack gap={12}>
        <Card style={{ borderRadius: 20 }}>
          <XStack gap={8} flexWrap="wrap">
            <YStack minWidth={180} flex={1}>
              <AppTextField
                placeholder="Filter by action"
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
        </Card>

        <Card style={{ borderRadius: 24 }}>
          <YStack gap={10}>
            <XStack alignItems="center" justifyContent="space-between">
              <Text fontSize={16} fontFamily="$heading" fontWeight="700" color={theme.color.val}>
                Recent Admin Actions
              </Text>
              <Badge label={`${logs.page.length} entries`} />
            </XStack>
            {logs.page.length === 0 ? (
              <Text fontSize={13} color={theme.colorMuted.val}>
                No admin actions logged yet.
              </Text>
            ) : (
              logs.page.map((entry: any) => (
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
                    <Badge label={entry.actorUserId} tone="neutral" />
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
          </YStack>
        </Card>
      </YStack>
    </YStack>
  );
}
