import React, { useState } from "react";
import { ActivityIndicator } from "react-native";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { Feather } from "@/lib/icons";
import { Text, XStack, YStack } from "tamagui";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AppTextField } from "@/components/ui/AppTextField";
import { AppButton } from "@/components/ui/AppButton";
import { Badge } from "@/components/ui/Badge";
import { useAppToast } from "@/components/ui/toast";
import { useAppConfirm } from "@/components/ui/confirm/AppConfirmProvider";
import { useAdminState } from "@/components/admin/AdminStateContext";
import { formatCompactNumber, formatUsdMicros } from "@/components/admin/charts/palette";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useSemanticColors } from "@/hooks/useSemanticColors";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import { BarChart } from "@/components/admin/charts/BarChart";
import {
  AdminDataRow,
  AdminEmptyState,
  AdminPanel,
  AdminSectionHeader,
} from "@/components/admin/AdminWorkspace";

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
  const responsive = useResponsiveLayout();
  const { showToast } = useAppToast();
  const { confirm } = useAppConfirm();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const { range, refreshKey, selectedEntity, setSelectedEntity } = useAdminState();
  const [selectedUserId, setSelectedUserId] = useState<Id<"users"> | null>(
    selectedEntity?.type === "user" ? (selectedEntity.id as Id<"users">) : null,
  );

  const {
    results: users,
    status: pageStatus,
    loadMore,
  } = usePaginatedQuery(
    api.admin.userOpsList,
    { search: debouncedSearch || undefined, refreshKey },
    { initialNumItems: PAGE_SIZE },
  );

  const selected = useQuery(
    api.admin.userOpsDetail,
    selectedUserId ? { userId: selectedUserId, range, refreshKey } : "skip",
  );

  const revokeSessions = useMutation(api.admin.revokeUserSessions);
  const setWatchStatus = useMutation(api.admin.setUserWatchStatus);
  const setSpendCap = useMutation(api.admin.setUserSpendCap);

  React.useEffect(() => {
    if (selectedEntity?.type !== "user") return;
    setSelectedUserId(selectedEntity.id as Id<"users">);
  }, [selectedEntity]);

  React.useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timeout);
  }, [search]);

  const renderUser = React.useCallback(
    (item: UserRow) => {
      const isSelected = selectedUserId === item._id;
      return (
        <AdminDataRow
          key={item._id}
          title={item.name}
          subtitle={`${item.email}${item.watch ? " · Watchlist" : ""}`}
          selected={isSelected}
          metrics={[
            { label: "AI", value: formatCompactNumber(item.stats.aiRequests) },
            { label: "Search", value: formatCompactNumber(item.stats.searches) },
            { label: "Cost", value: formatUsdMicros(item.stats.aiCostUsdMicros) },
          ]}
          onPress={() => {
            setSelectedUserId(item._id);
            setSelectedEntity({ type: "user", id: String(item._id) });
          }}
          accessibilityLabel={`Open ${item.name}, ${item.email}${item.watch ? ", watchlisted" : ""}`}
        />
      );
    },
    [selectedUserId, setSelectedEntity],
  );

  return (
    <>
      <AdminPanel padding={12}>
        <AppTextField
          placeholder="Search by name or email"
          value={search}
          onChangeText={setSearch}
        />
      </AdminPanel>

      <XStack
        gap={12}
        alignItems="flex-start"
        flexDirection={responsive.isExpanded ? "row" : "column"}
      >
        <YStack flex={1} width={responsive.isExpanded ? undefined : "100%"}>
          <AdminPanel padding={0}>
            <YStack gap={10} padding={14}>
              <AdminSectionHeader title="Users" detail={`${users.length} loaded`} />
              {pageStatus === "LoadingFirstPage" ? (
                <YStack alignItems="center" paddingVertical={30}>
                  <ActivityIndicator color={semantic.status.info} />
                </YStack>
              ) : users.length === 0 ? (
                <AdminEmptyState
                  title="No matching users"
                  detail="Change the name or email filter."
                  icon="users"
                />
              ) : (
                <YStack>
                  {(users as UserRow[]).map(renderUser)}
                  {pageStatus === "CanLoadMore" ? (
                    <YStack alignItems="center" paddingTop={12}>
                      <AppButton
                        title="Load more"
                        size="sm"
                        variant="secondary"
                        onPress={() => loadMore(PAGE_SIZE)}
                      />
                    </YStack>
                  ) : pageStatus === "LoadingMore" ? (
                    <YStack alignItems="center" paddingVertical={10}>
                      <ActivityIndicator size="small" color={semantic.status.info} />
                    </YStack>
                  ) : null}
                </YStack>
              )}
            </YStack>
          </AdminPanel>
        </YStack>

        <YStack flex={1.15} width={responsive.isExpanded ? undefined : "100%"}>
          <AdminPanel>
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

                <YStack gap={8}>
                  <AdminSectionHeader
                    title="Usage trend"
                    detail="AI events by day from the current detail window"
                  />
                  <BarChart
                    rows={Object.entries(
                      selected.recentAiEvents.reduce<Record<string, number>>((days, event) => {
                        const day = new Date(event.occurredAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        });
                        days[day] = (days[day] ?? 0) + 1;
                        return days;
                      }, {}),
                    ).map(([label, value]) => ({ label, value }))}
                    maxRows={7}
                  />
                </YStack>

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
                    variant="danger"
                    onPress={async () => {
                      const confirmed = await confirm({
                        title: "Revoke all sessions?",
                        message: `${selected.profile.name} will be signed out on every device.`,
                        confirmLabel: "Revoke sessions",
                        tone: "destructive",
                        icon: "log-out",
                      });
                      if (!confirmed) return;
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
                  <Text
                    fontSize={13}
                    fontFamily="$heading"
                    fontWeight="700"
                    color={theme.color.val}
                  >
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
                    Applies to platform-billed usage only. "No cap" disables the limit; "Default"
                    uses the platform-wide cap. BYOK usage is never capped.
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
          </AdminPanel>
        </YStack>
      </XStack>
    </>
  );
}
