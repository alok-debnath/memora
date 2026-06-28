import React, { useCallback, useMemo, useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useMutation, useQuery } from "convex/react";
import { Text, XStack, YStack } from "tamagui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { FontFamily } from "@/constants/fonts";
import { brandGradients, integrationAccentColors, statusAccentColors } from "@/constants/colors";
import { useAppConfirm } from "@/components/ui/confirm/AppConfirmProvider";
import { ContextMenu, type ContextMenuItemDef } from "@/components/ui/ContextMenu";
import { withAlpha } from "@/components/ui/themeHelpers";
import { useAppToast } from "@/components/ui/toast";
import { useAppTheme } from "@/hooks/useAppTheme";
import { Feather, FontAwesome5 } from "@/lib/icons";
import { useUIStore } from "@/store/ui";
import type { CardFlow, SearchResultItem } from "./types";
import { formatReminderDueAt } from "./rendererUtils";

const getBubbleShadow = (shadowColor: string) => ({
  shadowColor,
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.03,
  shadowRadius: 3,
  elevation: 0,
});

function PerformancePill({
  isCached,
  turns = 1,
  flow,
  isDeepSearching = false,
  onDeepSearch,
  onOpenTelemetry,
}: {
  isCached: boolean;
  turns?: number;
  flow?: CardFlow;
  isDeepSearching?: boolean;
  onDeepSearch?: () => void;
  onOpenTelemetry?: () => void;
}) {
  const theme = useAppTheme();
  const isReasoned = turns > 1;
  const baseColor = isReasoned
    ? integrationAccentColors.reasoning
    : isCached
      ? statusAccentColors.warning
      : theme.primary.val;
  const menuItems = useMemo(
    () =>
      [
        flow?.chatTurnId && onOpenTelemetry
          ? {
              label: "Open Full Breakdown",
              icon: "file-text",
              onPress: onOpenTelemetry,
            }
          : null,
        isCached && onDeepSearch && !isDeepSearching
          ? {
              label: "Run Deep Scan",
              icon: "refresh-cw",
              onPress: onDeepSearch,
            }
          : null,
      ].filter(Boolean) as ContextMenuItemDef[],
    [flow?.chatTurnId, isCached, isDeepSearching, onDeepSearch, onOpenTelemetry],
  );

  const pill = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 20,
        backgroundColor: `${baseColor}15`,
        borderWidth: 1,
        borderColor: `${baseColor}40`,
      }}
    >
      <Feather name={isCached ? "zap" : "search"} size={11} color={baseColor} />
      <Text fontSize={11} fontFamily={FontFamily.bold} color={baseColor} style={{ opacity: 0.9 }}>
        {isCached ? "Fast" : "Full scan"}
      </Text>
      {isReasoned ? (
        <>
          <View
            style={{
              width: 1,
              height: 10,
              backgroundColor: baseColor,
              opacity: 0.2,
              marginLeft: 2,
            }}
          />
          <Feather name="layers" size={11} color={baseColor} />
          <Text
            fontSize={11}
            fontFamily={FontFamily.bold}
            color={baseColor}
            style={{ opacity: 0.9 }}
          >
            {`× ${turns}`}
          </Text>
        </>
      ) : null}
    </View>
  );

  if (menuItems.length === 0 && !onOpenTelemetry) return pill;
  return (
    <ContextMenu items={menuItems} onPress={onOpenTelemetry}>
      {pill}
    </ContextMenu>
  );
}

const SearchResultRow = React.memo(function SearchResultRow({
  item,
  index,
  isCompleted,
  calendarSyncEnabled,
  onComplete,
  onDelete,
  onEdit,
  onTriggerSync,
  onRemoveSync,
  hasFiles = false,
}: {
  item: SearchResultItem;
  index: number;
  isCompleted: boolean;
  calendarSyncEnabled: boolean;
  onComplete: (item: SearchResultItem) => void;
  onDelete: (id: Id<"memories">) => void;
  onEdit: (id: Id<"memories">) => void;
  onTriggerSync: (item: SearchResultItem) => void;
  onRemoveSync: (item: SearchResultItem) => void;
  hasFiles?: boolean;
}) {
  const theme = useAppTheme();
  const isReminder = item.entry_kind === "reminder" || !!item.schedule_due_at;
  const hasGoogleSyncInfo = !!(
    item.google_event_id ||
    item.google_sync_status ||
    item.google_sync_message
  );
  const dueAtLabel = formatReminderDueAt(item.schedule_due_at);
  const success = theme.success.val;
  const syncTone =
    item.google_sync_status === "synced"
      ? {
          border: withAlpha(theme.success.val, "47"),
          bg: theme.surfaceSuccessSoft.val,
          label: "synced",
          labelColor: theme.textSuccess.val,
        }
      : item.google_sync_status === "failed"
        ? {
            border: withAlpha(theme.destructive.val, "3D"),
            bg: theme.surfaceDangerSoft.val,
            label: "sync failed",
            labelColor: theme.textError.val,
          }
        : {
            border: withAlpha(theme.warning.val, "3D"),
            bg: withAlpha(theme.warning.val, "14"),
            label: "syncing…",
            labelColor: theme.textWarning.val,
          };
  const showTriggerSyncAction =
    calendarSyncEnabled &&
    isReminder &&
    (!hasGoogleSyncInfo || item.google_sync_status === "failed");
  const showRemoveSyncAction = calendarSyncEnabled && isReminder && hasGoogleSyncInfo;

  const menuItems: ContextMenuItemDef[] = [
    ...(isReminder && !isCompleted
      ? [
          {
            label: "Mark as Completed",
            icon: "check-circle",
            iconColor: success,
            onPress: () => onComplete(item),
          } satisfies ContextMenuItemDef,
        ]
      : []),
    ...(showTriggerSyncAction
      ? [
          {
            label:
              item.google_sync_status === "failed" ? "Retry Calendar Sync" : "Sync to Calendar",
            icon: "refresh-cw",
            iconColor: theme.primary.val,
            onPress: () => onTriggerSync(item),
          } satisfies ContextMenuItemDef,
        ]
      : []),
    ...(showRemoveSyncAction
      ? [
          {
            label: "Remove Calendar Sync",
            icon: "link-2",
            destructive: true,
            onPress: () => onRemoveSync(item),
          } satisfies ContextMenuItemDef,
        ]
      : []),
    {
      label: "Edit Memory",
      icon: "edit-2",
      onPress: () => onEdit(item.id),
    } satisfies ContextMenuItemDef,
    {
      label: "Delete",
      icon: "trash-2",
      destructive: true,
      onPress: () => onDelete(item.id),
    } satisfies ContextMenuItemDef,
  ];

  const previewCard = (
    <YStack padding={14} gap={8}>
      <XStack gap={10} alignItems="center">
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: isReminder ? `${theme.warning.val}18` : `${theme.primary.val}15`,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Feather
            name={isReminder ? "bell" : "file-text"}
            size={16}
            color={isReminder ? theme.warning.val : theme.primary.val}
          />
        </View>
        <YStack flex={1} gap={2}>
          <Text fontSize={14} fontFamily={FontFamily.semiBold} color="$color" numberOfLines={2}>
            {item.title || "Untitled memory"}
          </Text>
          {item.entry_kind ? (
            <Text fontSize={11} color="$colorMuted">
              {isReminder ? "Reminder" : "Memory"}
            </Text>
          ) : null}
        </YStack>
      </XStack>
      {item.content ? (
        <Text fontSize={12} fontFamily="$body" color="$colorMuted" numberOfLines={3}>
          {item.content}
        </Text>
      ) : null}
      {isReminder && dueAtLabel ? (
        <XStack alignItems="center" gap={5}>
          <Feather name="bell" size={11} color={theme.primary.val} />
          <Text fontSize={11} fontFamily={FontFamily.semiBold} color="$primary">
            {dueAtLabel}
          </Text>
        </XStack>
      ) : null}
      {isReminder && (hasGoogleSyncInfo || hasFiles) ? (
        <XStack marginTop={6} gap={6} alignItems="center" flexWrap="wrap">
          {isReminder && hasGoogleSyncInfo ? (
            <XStack
              alignItems="center"
              gap={4}
              paddingHorizontal={8}
              paddingVertical={5}
              borderRadius={20}
              borderWidth={1}
              borderColor={syncTone.border}
              backgroundColor={syncTone.bg}
            >
              <FontAwesome5 name="calendar-alt" size={12} color={syncTone.labelColor} />
              <Text fontSize={11} fontFamily={FontFamily.semiBold} color={syncTone.labelColor}>
                {syncTone.label}
              </Text>
            </XStack>
          ) : null}
          {hasFiles ? (
            <XStack
              alignItems="center"
              gap={4}
              paddingHorizontal={8}
              paddingVertical={5}
              borderRadius={20}
              borderWidth={1}
              borderColor={withAlpha(integrationAccentColors.googleDrive, "40")}
              backgroundColor={withAlpha(integrationAccentColors.googleDrive, "12")}
            >
              <FontAwesome5
                name="google-drive"
                iconStyle="brand"
                size={12}
                color={integrationAccentColors.googleDrive}
              />
              <Text
                fontSize={11}
                fontFamily={FontFamily.semiBold}
                color={integrationAccentColors.googleDrive}
              >
                in Drive
              </Text>
            </XStack>
          ) : null}
        </XStack>
      ) : null}
    </YStack>
  );

  const row = (
    <XStack
      paddingHorizontal={14}
      paddingVertical={11}
      gap={12}
      alignItems="center"
      borderTopWidth={index > 0 ? 1 : 0}
      borderTopColor="$borderColor"
      opacity={isCompleted ? 0.45 : 1}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: isCompleted ? `${success}20` : theme.accent.val,
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Feather
          name={isCompleted ? "check" : isReminder ? "bell" : "file-text"}
          size={14}
          color={isCompleted ? success : theme.colorMuted.val}
        />
      </View>

      <YStack flex={1} gap={6}>
        <Text
          fontSize={13}
          fontFamily={FontFamily.semiBold}
          color="$color"
          numberOfLines={1}
          textDecorationLine={isCompleted ? "line-through" : "none"}
        >
          {item.title || "Untitled memory"}
        </Text>
        {item.content ? (
          <Text fontSize={11} fontFamily="$body" color="$colorMuted" numberOfLines={1}>
            {item.content}
          </Text>
        ) : null}
        {isReminder && dueAtLabel ? (
          <XStack alignItems="center" gap={5}>
            <Feather name="bell" size={10} color={theme.primary.val} />
            <Text fontSize={10} fontFamily={FontFamily.semiBold} color="$primary">
              {dueAtLabel}
            </Text>
          </XStack>
        ) : null}
        {(isReminder && hasGoogleSyncInfo) || hasFiles ? (
          <XStack marginTop={2} gap={5} alignItems="center" flexWrap="wrap">
            {isReminder && hasGoogleSyncInfo ? (
              <XStack
                alignItems="center"
                gap={4}
                paddingHorizontal={7}
                paddingVertical={4}
                borderRadius={20}
                borderWidth={1}
                borderColor={syncTone.border}
                backgroundColor={syncTone.bg}
              >
                <FontAwesome5 name="calendar-alt" size={10} color={syncTone.labelColor} />
                <Text fontSize={10} fontFamily={FontFamily.semiBold} color={syncTone.labelColor}>
                  {syncTone.label}
                </Text>
              </XStack>
            ) : null}
            {hasFiles ? (
              <XStack
                alignItems="center"
                gap={4}
                paddingHorizontal={7}
                paddingVertical={4}
                borderRadius={20}
                borderWidth={1}
                borderColor={withAlpha(integrationAccentColors.googleDrive, "40")}
                backgroundColor={withAlpha(integrationAccentColors.googleDrive, "12")}
              >
                <FontAwesome5
                  name="google-drive"
                  iconStyle="brand"
                  size={10}
                  color={integrationAccentColors.googleDrive}
                />
                <Text
                  fontSize={10}
                  fontFamily={FontFamily.semiBold}
                  color={integrationAccentColors.googleDrive}
                >
                  in Drive
                </Text>
              </XStack>
            ) : null}
          </XStack>
        ) : null}
      </YStack>

      <XStack gap={4} alignItems="center">
        {item._score !== undefined ? (
          <Text fontSize={10} color="$colorMuted" opacity={0.5}>
            {Math.round(item._score * 100)}%
          </Text>
        ) : null}
        <ContextMenu
          items={menuItems}
          openOn="press"
          preview={
            Platform.OS === "ios" ? (
              <YStack backgroundColor="$card" borderRadius={18}>
                {previewCard}
              </YStack>
            ) : undefined
          }
        >
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Feather name="more-horizontal" size={16} color={theme.colorMuted.val} />
          </View>
        </ContextMenu>
      </XStack>
    </XStack>
  );

  return (
    <Animated.View entering={FadeInDown.duration(260).delay(index * 55)}>
      <ContextMenu items={menuItems} preview={previewCard} previewFrame>
        {row}
      </ContextMenu>
    </Animated.View>
  );
});

export function SearchResultsCard({
  ids,
  isCached,
  turns = 1,
  flow,
  token,
  calendarSyncEnabled,
  onDeepSearch,
  onEdit,
}: {
  ids: Id<"memories">[];
  isCached: boolean;
  turns?: number;
  flow?: CardFlow;
  token?: string | null;
  calendarSyncEnabled?: boolean;
  onDeepSearch?: (query: string) => void;
  onEdit?: (id: Id<"memories">) => void;
}) {
  const theme = useAppTheme();
  const [expanded, setExpanded] = useState(false);
  const [completedIds, setCompletedIds] = useState<Set<Id<"memories">>>(new Set());
  const [isDeepSearching, setIsDeepSearching] = useState(false);
  const completeMemory = useMutation(api.memories.complete);
  const deleteMemory = useMutation(api.memories.remove);
  const triggerReminderSync = useMutation(api.integrations.triggerReminderSync);
  const removeReminderSync = useMutation(api.integrations.removeReminderSync);
  const { showToast } = useAppToast();
  const { confirm } = useAppConfirm();
  const openTurnBreakdown = useUIStore((state) => state.openTurnBreakdown);

  const fetchedDocs = useQuery(
    api.memories.listByIds,
    token && ids.length > 0 ? { token, ids } : "skip",
  );
  const memoryIds = useMemo(() => (fetchedDocs ?? []).map((doc) => doc._id), [fetchedDocs]);
  const attachmentCounts =
    useQuery(
      api.attachments.getAttachmentCountsForMemories,
      token && memoryIds.length > 0 ? { token, memoryIds } : "skip",
    ) ?? {};

  const items = useMemo<SearchResultItem[]>(
    () =>
      (fetchedDocs ?? []).map((doc) => ({
        id: doc._id,
        title: doc.title,
        content: doc.content,
        entry_kind: doc.entryKind ?? (doc.schedule?.dueAt ? "reminder" : "memory"),
        schedule_due_at: doc.schedule?.dueAt ?? null,
        google_event_id: doc.googleEventId,
        google_sync_status: doc.googleSyncStatus,
        google_sync_message: doc.googleSyncMessage,
        google_sync_updated_at: doc.googleSyncUpdatedAt,
      })),
    [fetchedDocs],
  );

  const displayItems = expanded ? items : items.slice(0, 3);
  const hasMore = items.length > 3;

  const handleComplete = useCallback(
    async (item: SearchResultItem) => {
      if (!token) return;
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      try {
        await completeMemory({ token, id: item.id });
        setCompletedIds((prev) => new Set([...prev, item.id]));
        showToast({ title: "Marked complete", tone: "success" });
      } catch {
        showToast({ title: "Couldn't complete — try again", tone: "error" });
      }
    },
    [completeMemory, showToast, token],
  );

  const handleDelete = useCallback(
    async (id: Id<"memories">) => {
      if (!token) return;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      const confirmed = await confirm({
        title: "Delete Memory",
        message: "This will move the memory to trash.",
        confirmLabel: "Delete",
        tone: "destructive",
        icon: "trash-2",
      });
      if (!confirmed) return;
      try {
        await deleteMemory({ token, id });
        showToast({ title: "Memory deleted", tone: "success" });
      } catch {
        showToast({ title: "Couldn't delete — try again", tone: "error" });
      }
    },
    [confirm, deleteMemory, showToast, token],
  );

  const handleTriggerSync = useCallback(
    async (item: SearchResultItem) => {
      if (!token) return;
      try {
        const result = await triggerReminderSync({ token, memoryId: item.id });
        showToast({ title: result.message, tone: result.queued ? "success" : "info" });
      } catch {
        showToast({ title: "Couldn't trigger Google sync", tone: "error" });
      }
    },
    [showToast, token, triggerReminderSync],
  );

  const handleRemoveSync = useCallback(
    async (item: SearchResultItem) => {
      if (!token) return;
      const confirmed = await confirm({
        title: "Remove Google sync",
        message:
          "This removes linked Google Calendar event data for this reminder and clears local sync state.",
        confirmLabel: "Remove sync",
        tone: "destructive",
        icon: "link-2",
      });
      if (!confirmed) return;
      try {
        const result = await removeReminderSync({ token, memoryId: item.id });
        showToast({ title: result.message, tone: result.removed ? "success" : "info" });
      } catch {
        showToast({ title: "Couldn't remove Google sync", tone: "error" });
      }
    },
    [confirm, removeReminderSync, showToast, token],
  );

  const handleDeepSearch = useCallback(async () => {
    if (!onDeepSearch || isDeepSearching) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsDeepSearching(true);
    try {
      onDeepSearch(
        items
          .slice(0, 3)
          .map((item) => item.title ?? "")
          .filter(Boolean)
          .join(" "),
      );
    } finally {
      setIsDeepSearching(false);
    }
  }, [isDeepSearching, items, onDeepSearch]);

  return (
    <Animated.View entering={FadeInDown.duration(320)} style={{ marginTop: 8 }}>
      <YStack
        backgroundColor={theme.surfaceElevated.val}
        borderWidth={1}
        borderColor={theme.borderSubtle.val}
        borderRadius={20}
        overflow="hidden"
        style={getBubbleShadow(theme.shadowColor.val)}
      >
        <LinearGradient
          colors={[
            withAlpha(brandGradients.ember[1], "21"),
            withAlpha(theme.primary.val, "10"),
            withAlpha(theme.surfaceElevated.val, "00"),
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12 }}
        >
          <XStack alignItems="center" justifyContent="space-between" gap={10}>
            <YStack gap={6} flex={1}>
              <XStack gap={8} alignItems="center">
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: withAlpha(theme.primary.val, "15"),
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor: withAlpha(theme.primary.val, "22"),
                  }}
                >
                  <Feather name="search" size={13} color={theme.primary.val} />
                </View>
                <Text fontSize={14} fontFamily={FontFamily.semiBold} color="$color">
                  {items.length} {items.length === 1 ? "memory" : "memories"}
                </Text>
              </XStack>
              <Text fontSize={11} fontFamily="$body" color="$colorMuted">
                Retrieved from your saved memories and reminders
              </Text>
            </YStack>
            <PerformancePill
              isCached={isCached}
              turns={turns}
              flow={flow}
              isDeepSearching={isDeepSearching}
              onDeepSearch={isCached && onDeepSearch ? handleDeepSearch : undefined}
              onOpenTelemetry={
                flow?.chatTurnId ? () => openTurnBreakdown(flow.chatTurnId!) : undefined
              }
            />
          </XStack>
        </LinearGradient>

        <YStack>
          {displayItems.map((item, index) => (
            <SearchResultRow
              key={item.id}
              item={item}
              index={index}
              isCompleted={completedIds.has(item.id)}
              hasFiles={!!(attachmentCounts as Record<string, number>)[item.id]}
              calendarSyncEnabled={calendarSyncEnabled ?? true}
              onComplete={handleComplete}
              onDelete={handleDelete}
              onEdit={(id) => onEdit?.(id)}
              onTriggerSync={handleTriggerSync}
              onRemoveSync={handleRemoveSync}
            />
          ))}
        </YStack>

        {hasMore ? (
          <Pressable
            onPress={() => setExpanded((current) => !current)}
            style={({ pressed }) => ({
              paddingVertical: 12,
              alignItems: "center",
              borderTopWidth: 1,
              borderTopColor: theme.borderSubtle.val,
              backgroundColor: pressed ? withAlpha(theme.primary.val, "08") : "transparent",
            })}
          >
            <Text fontSize={12} color={theme.primary.val} fontFamily={FontFamily.semiBold}>
              {expanded ? "Show less" : `Show all ${items.length} results`}
            </Text>
          </Pressable>
        ) : null}
      </YStack>
    </Animated.View>
  );
}
