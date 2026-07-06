import React, { useCallback, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { Text, XStack, YStack } from "tamagui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { FontFamily } from "@/constants/fonts";
import { useAppConfirm } from "@/components/ui/confirm/AppConfirmProvider";
import { appShadow, withAlpha } from "@/components/ui/themeHelpers";
import { useAppToast } from "@/components/ui/toast";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useSemanticColors } from "@/hooks/useSemanticColors";
import { Feather } from "@/lib/icons";
import { useUIStore } from "@/store/ui";
import type { CardFlow, CardRef, SearchResultItem } from "./types";
import { MemoryResultRow } from "./cards/MemoryResultRow";
import { DiaryResultRow, type DiaryCardDoc } from "./cards/DiaryResultRow";

const getBubbleShadow = (shadowColor: string) => appShadow(shadowColor, "xs");

function PerformancePill({
  isCached,
  turns = 1,
  onOpenTelemetry,
}: {
  isCached: boolean;
  turns?: number;
  flow?: CardFlow;
  onOpenTelemetry?: () => void;
}) {
  const theme = useAppTheme();
  const semantic = useSemanticColors();
  const isReasoned = turns > 1;
  const baseColor = isReasoned
    ? semantic.integration.reasoning
    : isCached
      ? semantic.status.warning
      : theme.primary.val;

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

  if (!onOpenTelemetry) return pill;
  return <Pressable onPress={onOpenTelemetry}>{pill}</Pressable>;
}

/**
 * Card shell for AI-surfaced document references. Refs are grouped by table
 * and rendered by the per-table row components in ./cards. Adding a new card
 * type = new row component + a listByIds-style query + a section below.
 */
export function SearchResultsCard({
  cards,
  isCached,
  turns = 1,
  flow,
  token,
  calendarSyncEnabled,
  onEdit,
}: {
  cards: CardRef[];
  isCached: boolean;
  turns?: number;
  flow?: CardFlow;
  token?: string | null;
  calendarSyncEnabled?: boolean;
  onEdit?: (id: Id<"memories">) => void;
}) {
  const theme = useAppTheme();
  const [expanded, setExpanded] = useState(false);
  const [completedIds, setCompletedIds] = useState<Set<Id<"memories">>>(new Set());
  const router = useRouter();
  const closeAllSheets = useUIStore((state) => state.closeAllSheets);
  const completeMemory = useMutation(api.memories.complete);
  const deleteMemory = useMutation(api.memories.remove);
  const deleteDiaryEntry = useMutation(api.diary.remove);
  const triggerReminderSync = useMutation(api.integrations.triggerReminderSync);
  const removeReminderSync = useMutation(api.integrations.removeReminderSync);
  const { showToast } = useAppToast();
  const { confirm } = useAppConfirm();
  const openTurnBreakdown = useUIStore((state) => state.openTurnBreakdown);

  const ids = useMemo(
    () =>
      cards.filter((card) => card.table === "memories").map((card) => card.id as Id<"memories">),
    [cards],
  );
  const diaryIds = useMemo(
    () =>
      cards
        .filter((card) => card.table === "diaryEntries")
        .map((card) => card.id as Id<"diaryEntries">),
    [cards],
  );

  const fetchedDocs = useQuery(
    api.memories.listByIds,
    token && ids.length > 0 ? { token, ids } : "skip",
  );
  const fetchedDiaryDocs = useQuery(
    api.diary.listByIds,
    token && diaryIds.length > 0 ? { token, ids: diaryIds } : "skip",
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

  const diaryItems = useMemo<DiaryCardDoc[]>(() => fetchedDiaryDocs ?? [], [fetchedDiaryDocs]);
  const displayItems = expanded ? items : items.slice(0, 3);
  const hasMore = items.length > 3;
  const headerLabel = [
    items.length > 0 ? `${items.length} ${items.length === 1 ? "memory" : "memories"}` : null,
    diaryItems.length > 0
      ? `${diaryItems.length} diary ${diaryItems.length === 1 ? "entry" : "entries"}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

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

  const handleOpenDiary = useCallback(() => {
    closeAllSheets();
    router.push("/(protected)/(tabs)/diary");
  }, [closeAllSheets, router]);

  const handleDeleteDiary = useCallback(
    async (id: Id<"diaryEntries">) => {
      if (!token) return;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      const confirmed = await confirm({
        title: "Delete Diary Entry",
        message: "This permanently deletes the diary entry.",
        confirmLabel: "Delete",
        tone: "destructive",
        icon: "trash-2",
      });
      if (!confirmed) return;
      try {
        await deleteDiaryEntry({ token, id });
        showToast({ title: "Diary entry deleted", tone: "success" });
      } catch {
        showToast({ title: "Couldn't delete — try again", tone: "error" });
      }
    },
    [confirm, deleteDiaryEntry, showToast, token],
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
        <XStack
          alignItems="center"
          justifyContent="space-between"
          gap={10}
          paddingHorizontal={14}
          paddingVertical={10}
          borderBottomWidth={1}
          borderBottomColor={theme.borderSubtle.val}
        >
          <XStack gap={6} alignItems="center" flex={1}>
            <Feather name="search" size={13} color={theme.colorMuted.val} />
            <Text fontSize={13} fontFamily={FontFamily.semiBold} color={theme.color.val}>
              {headerLabel || "Results"}
            </Text>
          </XStack>
          <PerformancePill
            isCached={isCached}
            turns={turns}
            flow={flow}
            onOpenTelemetry={
              flow?.chatTurnId ? () => openTurnBreakdown(flow.chatTurnId!) : undefined
            }
          />
        </XStack>

        <YStack>
          {displayItems.map((item, index) => (
            <MemoryResultRow
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
          {diaryItems.map((entry, index) => (
            <DiaryResultRow
              key={entry._id}
              entry={entry}
              index={displayItems.length + index}
              onOpenDiary={handleOpenDiary}
              onDelete={handleDeleteDiary}
            />
          ))}
        </YStack>

        {hasMore ? (
          <Pressable
            onPress={() => setExpanded((current) => !current)}
            style={({ pressed }) => ({
              flexDirection: "row",
              justifyContent: "center",
              alignItems: "center",
              gap: 4,
              paddingVertical: 11,
              borderTopWidth: 1,
              borderTopColor: theme.borderSubtle.val,
              backgroundColor: pressed ? withAlpha(theme.primary.val, "08") : "transparent",
            })}
          >
            <Text fontSize={12} color={theme.primary.val} fontFamily={FontFamily.semiBold}>
              {expanded ? "Show less" : `Show all ${items.length} results`}
            </Text>
            <Feather
              name={expanded ? "chevron-up" : "chevron-down"}
              size={13}
              color={theme.primary.val}
            />
          </Pressable>
        ) : null}
      </YStack>
    </Animated.View>
  );
}
