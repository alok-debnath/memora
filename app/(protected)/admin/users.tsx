import React, { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, type ListRenderItemInfo } from "react-native";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { Feather } from "@/lib/icons";
import { Text, XStack, YStack } from "tamagui";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { SurfaceCard } from "@/components/ui/SurfaceCard";
import { AppTextField } from "@/components/ui/AppTextField";
import { AppButton } from "@/components/ui/AppButton";
import { Badge } from "@/components/ui/Badge";
import { useAppToast } from "@/components/ui/toast";
import { useAdminState } from "@/components/admin/AdminStateContext";
import { formatCompactNumber, formatUsdMicros } from "@/components/admin/charts/palette";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useSemanticColors } from "@/hooks/useSemanticColors";

const PAGE_SIZE = 20;

const SPEND_CAP_CHOICES: Array<{ label: string; usdMicros: number | null }> = [
  { label: "Default", usdMicros: null },
  { label: "$0.50", usdMicros: 500_000 },
  { label: "$5", usdMicros: 5_000_000 },
  { label: "No cap", usdMicros: 0 },
];

type UserRow = {
  _id: Id<"users">;
  name: string;
  email: string;
  userType: string;
  createdAt: number;
  stats: {
    memories: number;
    reminders: number;
    aiRequests: number;
    aiCostUsdMicros: number;
    searches: number;
  };
  watch: boolean;
};

export default function AdminUsersScreen() {
  const theme = useAppTheme();
  const semantic = useSemanticColors();
  const { showToast } = useAppToast();
  const [search, setSearch] = useState("");
  const { range, selectedEntity, setSelectedEntity } = useAdminState();
  const [selectedUserId, setSelectedUserId] = useState<Id<"users"> | null>(
    selectedEntity?.type === "user" ? (selectedEntity.id as Id<"users">) : null,
  );

  const {
    results: users,
    status: pageStatus,
    loadMore,
  } = usePaginatedQuery(
    api.admin.userOpsList,
    { search: search.trim() || undefined },
    { initialNumItems: PAGE_SIZE },
  );

  const selected = useQuery(
    api.admin.userOpsDetail,
    selectedUserId ? { userId: selectedUserId, range } : "skip",
  );

  const revokeSessions = useMutation(api.admin.revokeUserSessions);
  const setWatchStatus = useMutation(api.admin.setUserWatchStatus);
  const setSpendCap = useMutation(api.admin.setUserSpendCap);

  React.useEffect(() => {
    if (selectedEntity?.type !== "user") return;
    setSelectedUserId(selectedEntity.id as Id<"users">);
  }, [selectedEntity]);

  const renderUser = useMemo(
    () =>
      function UserRowItem({ item }: ListRenderItemInfo<UserRow>) {
        const isSelected = selectedUserId === item._id;
        return (
          <SurfaceCard
            style={{
              borderRadius: 14,
              borderWidth: 1,
              borderColor: isSelected ? semantic.status.info : undefined,
              marginBottom: 8,
            }}
          >
            <XStack alignItems="center" justifyContent="space-between" gap={8}>
              <YStack flex={1}>
                <Text fontSize={13} fontWeight="700" color={theme.color.val}>
                  {item.name}
                </Text>
                <Text fontSize={11} color={theme.colorMuted.val}>
                  {item.email}
                </Text>
                <XStack gap={6} marginTop={4} flexWrap="wrap">
                  <Badge label={`${formatCompactNumber(item.stats.aiRequests)} AI`} />
                  <Badge label={`${formatCompactNumber(item.stats.searches)} search`} />
                  <Badge
                    label={formatUsdMicros(item.stats.aiCostUsdMicros)}
                    color={semantic.status.info}
                  />
                  {item.watch ? <Badge label="Watch" color={semantic.status.warning} /> : null}
                </XStack>
              </YStack>
              <AppButton
                title="Open"
                size="sm"
                variant={isSelected ? "primary" : "secondary"}
                onPress={() => {
                  setSelectedUserId(item._id);
                  setSelectedEntity({ type: "user", id: String(item._id) });
                }}
              />
            </XStack>
          </SurfaceCard>
        );
      },
    [selectedUserId, semantic, setSelectedEntity, theme],
  );

  return (
    <>
      <SurfaceCard style={{ borderRadius: 16 }}>
        <AppTextField
          placeholder="Search by name or email"
          value={search}
          onChangeText={setSearch}
        />
      </SurfaceCard>

      <XStack gap={10} alignItems="flex-start" flexWrap="wrap">
        <SurfaceCard style={{ borderRadius: 16, flex: 1, minWidth: 280 }} noPadding>
          <YStack gap={10} padding={14}>
            <Text fontSize={16} fontFamily="$heading" fontWeight="700" color={theme.color.val}>
              Users
            </Text>
            {pageStatus === "LoadingFirstPage" ? (
              <YStack alignItems="center" paddingVertical={30}>
                <ActivityIndicator color={semantic.status.info} />
              </YStack>
            ) : (
              <FlatList<UserRow>
                data={users as UserRow[]}
                keyExtractor={(item) => String(item._id)}
                renderItem={renderUser}
                style={{ maxHeight: 520 }}
                nestedScrollEnabled
                onEndReached={() => {
                  if (pageStatus === "CanLoadMore") loadMore(PAGE_SIZE);
                }}
                onEndReachedThreshold={0.5}
                ListEmptyComponent={
                  <Text fontSize={12} color={theme.colorMuted.val}>
                    No users match this search.
                  </Text>
                }
                ListFooterComponent={
                  pageStatus === "LoadingMore" ? (
                    <YStack alignItems="center" paddingVertical={10}>
                      <ActivityIndicator size="small" color={semantic.status.info} />
                    </YStack>
                  ) : null
                }
              />
            )}
          </YStack>
        </SurfaceCard>

        <SurfaceCard style={{ borderRadius: 16, flex: 1, minWidth: 300 }}>
          {!selectedUserId || !selected ? (
            <YStack alignItems="center" justifyContent="center" minHeight={240} gap={8}>
              <Feather name="user" size={20} color={semantic.status.info} />
              <Text fontSize={13} color={theme.colorMuted.val}>
                Select a user to view detail and actions.
              </Text>
            </YStack>
          ) : (
            <YStack gap={12}>
              <Text fontSize={17} fontFamily="$heading" fontWeight="700" color={theme.color.val}>
                {selected.profile.name}
              </Text>
              <Text fontSize={12} color={theme.colorMuted.val}>
                {selected.profile.email}
              </Text>

              <XStack gap={8} flexWrap="wrap">
                <Badge label={`${formatCompactNumber(selected.summary.memories)} memories`} />
                <Badge label={`${formatCompactNumber(selected.summary.reminders)} reminders`} />
                <Badge label={`${formatCompactNumber(selected.summary.aiRequests)} AI req`} />
                <Badge
                  label={formatUsdMicros(selected.summary.aiCostUsdMicros)}
                  color={semantic.status.info}
                />
                <Badge
                  label={`${selected.sessions.activeCount} sessions`}
                  color={semantic.status.warning}
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

              <YStack gap={6}>
                <Text fontSize={13} fontFamily="$heading" fontWeight="700" color={theme.color.val}>
                  Daily AI spend cap
                </Text>
                <XStack gap={6} flexWrap="wrap">
                  {SPEND_CAP_CHOICES.map((choice) => (
                    <AppButton
                      key={choice.label}
                      title={choice.label}
                      size="sm"
                      variant="secondary"
                      onPress={async () => {
                        await setSpendCap({
                          userId: selected.profile._id,
                          dailySpendCapUsdMicros: choice.usdMicros,
                        });
                        showToast({
                          title: `Spend cap set to ${choice.label.toLowerCase()}`,
                          tone: "success",
                        });
                      }}
                    />
                  ))}
                </XStack>
                <Text fontSize={11} color={theme.colorMuted.val}>
                  Applies to platform-billed usage only. "No cap" disables the limit; "Default" uses
                  the platform-wide cap. BYOK usage is never capped.
                </Text>
              </YStack>

              <Text fontSize={13} fontFamily="$heading" fontWeight="700" color={theme.color.val}>
                Recent AI Events
              </Text>
              <YStack gap={8}>
                {selected.recentAiEvents.slice(0, 8).map((event) => (
                  <XStack key={event._id} justifyContent="space-between" gap={8}>
                    <YStack flex={1}>
                      <Text fontSize={12} fontWeight="700" color={theme.color.val}>
                        {event.feature} · {event.model}
                      </Text>
                      <Text fontSize={11} color={theme.colorMuted.val}>
                        {new Date(event.occurredAt).toLocaleString()} · {event.status}
                      </Text>
                    </YStack>
                    <Text fontSize={11} color={theme.colorMuted.val}>
                      {formatCompactNumber(event.totalTokens)} tok
                    </Text>
                  </XStack>
                ))}
              </YStack>
            </YStack>
          )}
        </SurfaceCard>
      </XStack>
    </>
  );
}
