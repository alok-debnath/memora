import React, { useMemo, useState } from "react";
import { ActivityIndicator, ScrollView } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { Feather } from "@/lib/icons";
import { Text, XStack, YStack } from "tamagui";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Card } from "@/components/ui/Card";
import { AppTextField } from "@/components/ui/AppTextField";
import { AppButton } from "@/components/ui/AppButton";
import { Badge } from "@/components/ui/Badge";
import { useAppToast } from "@/components/ui/toast";
import { useAdminState } from "@/components/admin/AdminStateContext";
import { statusAccentColors } from "@/constants/colors";

function formatCompact(value: number) {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(
    value,
  );
}

function formatUsdMicros(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value / 1_000_000);
}

export default function AdminUsersScreen() {
  const { showToast } = useAppToast();
  const [search, setSearch] = useState("");
  const { range, refreshKey, selectedEntity, setSelectedEntity } = useAdminState();
  const [selectedUserId, setSelectedUserId] = useState<Id<"users"> | null>(
    selectedEntity?.type === "user" ? (selectedEntity.id as Id<"users">) : null,
  );

  const list = useQuery(api.admin.userOpsList, {
    search: search.trim() || undefined,
    paginationOpts: { numItems: 20, cursor: null },
    refreshKey,
  });

  const selected = useQuery(
    api.admin.userOpsDetail,
    selectedUserId ? { userId: selectedUserId, range, refreshKey } : "skip",
  );

  const revokeSessions = useMutation(api.admin.revokeUserSessions);
  const setWatchStatus = useMutation(api.admin.setUserWatchStatus);

  const users = useMemo(() => list?.page ?? [], [list?.page]);

  React.useEffect(() => {
    if (selectedEntity?.type !== "user") return;
    setSelectedUserId(selectedEntity.id as Id<"users">);
  }, [selectedEntity]);

  return (
    <>
      <YStack>
        <Card style={{ borderRadius: 20 }}>
          <AppTextField
            placeholder="Search by name or email"
            value={search}
            onChangeText={setSearch}
          />
        </Card>
      </YStack>

      {!list ? (
        <YStack alignItems="center" paddingVertical={40}>
          <ActivityIndicator color={statusAccentColors.info} />
        </YStack>
      ) : (
        <XStack gap={10} alignItems="flex-start" flexWrap="wrap">
          <Card style={{ borderRadius: 24, flex: 1, minWidth: 280 }}>
            <YStack gap={10}>
              <Text fontSize={16} fontFamily="$heading" fontWeight="700" color="$color">
                Users ({users.length})
              </Text>
              <ScrollView style={{ maxHeight: 460 }}>
                <YStack gap={8}>
                  {users.map((user: any) => {
                    const selectedRow = selectedUserId === user._id;
                    return (
                      <Card
                        key={user._id}
                        style={{
                          borderRadius: 14,
                          borderWidth: 1,
                          borderColor: selectedRow ? statusAccentColors.info : undefined,
                        }}
                      >
                        <XStack alignItems="center" justifyContent="space-between" gap={8}>
                          <YStack flex={1}>
                            <Text fontSize={13} fontWeight="700" color="$color">
                              {user.name}
                            </Text>
                            <Text fontSize={11} color="$colorMuted">
                              {user.email}
                            </Text>
                            <XStack gap={6} marginTop={4} flexWrap="wrap">
                              <Badge label={`${formatCompact(user.stats.aiRequests)} AI`} />
                              <Badge label={`${formatCompact(user.stats.searches)} search`} />
                              {user.watch ? (
                                <Badge label="Watch" color={statusAccentColors.warning} />
                              ) : null}
                            </XStack>
                          </YStack>
                          <AppButton
                            title="Open"
                            size="sm"
                            variant={selectedRow ? "primary" : "secondary"}
                            onPress={() => {
                              setSelectedUserId(user._id);
                              setSelectedEntity({ type: "user", id: String(user._id) });
                            }}
                          />
                        </XStack>
                      </Card>
                    );
                  })}
                </YStack>
              </ScrollView>
            </YStack>
          </Card>

          <Card style={{ borderRadius: 24, flex: 1, minWidth: 300 }}>
            {!selectedUserId || !selected ? (
              <YStack alignItems="center" justifyContent="center" minHeight={240} gap={8}>
                <Feather name="user" size={20} color={statusAccentColors.info} />
                <Text fontSize={13} color="$colorMuted">
                  Select a user to view detail and actions.
                </Text>
              </YStack>
            ) : (
              <YStack gap={12}>
                <Text fontSize={17} fontFamily="$heading" fontWeight="700" color="$color">
                  {selected.profile.name}
                </Text>
                <Text fontSize={12} color="$colorMuted">
                  {selected.profile.email}
                </Text>

                <XStack gap={8} flexWrap="wrap">
                  <Badge label={`${formatCompact(selected.summary.memories)} memories`} />
                  <Badge label={`${formatCompact(selected.summary.reminders)} reminders`} />
                  <Badge label={`${formatCompact(selected.summary.aiRequests)} AI req`} />
                  <Badge
                    label={formatUsdMicros(selected.summary.aiCostUsdMicros)}
                    color={statusAccentColors.info}
                  />
                  <Badge
                    label={`${selected.sessions.activeCount} sessions`}
                    color={statusAccentColors.warning}
                  />
                </XStack>

                <XStack gap={8} flexWrap="wrap">
                  <AppButton
                    title={selected.watch?.status === "watch" ? "Clear watch" : "Mark watch"}
                    size="sm"
                    variant="secondary"
                    onPress={async () => {
                      await setWatchStatus({
                        userId: selected.profile._id,
                        status: selected.watch?.status === "watch" ? "clear" : "watch",
                        reason: "Manual review",
                      });
                      showToast({ title: "Watchlist updated", tone: "success" });
                    }}
                  />
                  <AppButton
                    title="Revoke sessions"
                    size="sm"
                    variant="ghost"
                    onPress={async () => {
                      const result = await revokeSessions({
                        userId: selected.profile._id,
                        reason: "Admin security action",
                      });
                      showToast({
                        title: "Sessions revoked",
                        message: `${result.deleted} sessions removed`,
                        tone: "success",
                      });
                    }}
                  />
                </XStack>

                <Text fontSize={13} fontFamily="$heading" fontWeight="700" color="$color">
                  Recent AI Events
                </Text>
                <YStack gap={8}>
                  {selected.recentAiEvents.slice(0, 8).map((event: any) => (
                    <XStack key={event._id} justifyContent="space-between" gap={8}>
                      <YStack flex={1}>
                        <Text fontSize={12} fontWeight="700" color="$color">
                          {event.feature} · {event.model}
                        </Text>
                        <Text fontSize={11} color="$colorMuted">
                          {new Date(event.occurredAt).toLocaleString()} · {event.status}
                        </Text>
                      </YStack>
                      <Text fontSize={11} color="$colorMuted">
                        {formatCompact(event.totalTokens)} tok
                      </Text>
                    </XStack>
                  ))}
                </YStack>
              </YStack>
            )}
          </Card>
        </XStack>
      )}
    </>
  );
}
