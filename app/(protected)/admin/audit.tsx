import React from "react";
import { ActivityIndicator } from "react-native";
import { usePaginatedQuery } from "convex/react";
import { XStack, YStack } from "tamagui";

import { api } from "@/convex/_generated/api";
import { AppButton } from "@/components/ui/AppButton";
import { AppTextField } from "@/components/ui/AppTextField";
import { useAdminState } from "@/components/admin/AdminStateContext";
import {
  AdminDataRow,
  AdminEmptyState,
  AdminPanel,
  AdminSectionHeader,
} from "@/components/admin/AdminWorkspace";

const PAGE_SIZE = 40;

export default function AdminAuditScreen() {
  const { range, refreshKey, setSelectedEntity } = useAdminState();
  const [actionQuery, setActionQuery] = React.useState("");
  const [targetQuery, setTargetQuery] = React.useState("");
  const [actorQuery, setActorQuery] = React.useState("");
  const {
    results: entries,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.admin.listAdminActions,
    {
      actionContains: actionQuery.trim() || undefined,
      targetType: targetQuery.trim() || undefined,
      actorContains: actorQuery.trim() || undefined,
      range,
      refreshKey,
    },
    { initialNumItems: PAGE_SIZE },
  );

  return (
    <YStack gap={12}>
      <AdminPanel padding={12}>
        <XStack gap={8} flexWrap="wrap">
          <YStack minWidth={170} flex={1}>
            <AppTextField placeholder="Action" value={actionQuery} onChangeText={setActionQuery} />
          </YStack>
          <YStack minWidth={150} flex={1}>
            <AppTextField
              placeholder="Target type"
              value={targetQuery}
              onChangeText={setTargetQuery}
            />
          </YStack>
          <YStack minWidth={170} flex={1}>
            <AppTextField
              placeholder="Actor name or email"
              value={actorQuery}
              onChangeText={setActorQuery}
            />
          </YStack>
        </XStack>
      </AdminPanel>

      <AdminPanel padding={0}>
        <YStack padding={14}>
          <AdminSectionHeader
            title="Admin actions"
            detail={`${entries.length} trace records loaded`}
          />
        </YStack>
        {status === "LoadingFirstPage" ? (
          <YStack minHeight={180} alignItems="center" justifyContent="center">
            <ActivityIndicator />
          </YStack>
        ) : entries.length === 0 ? (
          <AdminEmptyState
            title="No matching actions"
            detail="Change the action, target, or actor filter."
            icon="file-text"
          />
        ) : (
          entries.map((entry) => (
            <AdminDataRow
              key={entry._id}
              title={entry.action}
              subtitle={`${entry.targetType}${entry.targetId ? ` · ${entry.targetId}` : ""}`}
              metrics={[
                { label: "Actor", value: entry.actor?.name ?? "Unknown admin" },
                { label: "Time", value: new Date(entry.createdAt).toLocaleString() },
              ]}
              action={
                <AppButton
                  title="Trace"
                  size="sm"
                  variant="ghost"
                  onPress={() => setSelectedEntity({ type: "action", id: String(entry._id) })}
                />
              }
            />
          ))
        )}
        {status === "CanLoadMore" ? (
          <YStack padding={12} alignItems="center">
            <AppButton
              title="Load more"
              size="sm"
              variant="secondary"
              onPress={() => loadMore(PAGE_SIZE)}
            />
          </YStack>
        ) : status === "LoadingMore" ? (
          <YStack padding={12} alignItems="center">
            <ActivityIndicator size="small" />
          </YStack>
        ) : null}
      </AdminPanel>
    </YStack>
  );
}
