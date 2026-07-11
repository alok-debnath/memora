import React, { useCallback, useMemo, useState } from "react";
import { Pressable } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useMutation } from "convex/react";
import { Text, XStack, YStack } from "tamagui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { FontFamily } from "@/constants/fonts";
import { useAppConfirm } from "@/components/ui/confirm/AppConfirmProvider";
import { appShadow, withAlpha } from "@/components/ui/themeHelpers";
import { useAppToast } from "@/components/ui/toast";
import { useAppTheme } from "@/hooks/useAppTheme";
import { Feather } from "@/lib/icons";
import { useUIStore } from "@/store/ui";
import type { CardSnapshot, SearchResultItem } from "./types";
import { MemoryResultRow } from "./cards/MemoryResultRow";
import { DiaryResultRow, type DiaryCardDoc } from "./cards/DiaryResultRow";

const getBubbleShadow = (shadowColor: string) => appShadow(shadowColor, "xs");

/**
 * Card shell for AI-surfaced document snapshots. The backend validates IDs and
 * stores compact display data in chatMessages.meta.cardSnapshots.
 */
export function SearchResultsCard({
  cardSnapshots = [],
  token,
  calendarSyncEnabled,
  onEdit,
}: {
  cardSnapshots?: CardSnapshot[];
  token?: string | null;
  calendarSyncEnabled?: boolean;
  onEdit?: (id: Id<"memories">) => void;
}) {
  const theme = useAppTheme();
  const [expanded, setExpanded] = useState(false);
  const [completedIds, setCompletedIds] = useState<Set<Id<"memories">>>(new Set());
  const [deletedMemoryIds, setDeletedMemoryIds] = useState<Set<Id<"memories">>>(new Set());
  const [deletedDiaryIds, setDeletedDiaryIds] = useState<Set<Id<"diaryEntries">>>(new Set());
  const [syncOverrides, setSyncOverrides] = useState<Record<string, Partial<SearchResultItem>>>({});
  const router = useRouter();
  const closeAllSheets = useUIStore((state) => state.closeAllSheets);
  const completeMemory = useMutation(api.memories.complete);
  const deleteMemory = useMutation(api.memories.remove);
  const deleteDiaryEntry = useMutation(api.diary.remove);
  const triggerReminderSync = useMutation(api.integrations.triggerReminderSync);
  const removeReminderSync = useMutation(api.integrations.removeReminderSync);
  const { showToast } = useAppToast();
  const { confirm } = useAppConfirm();

  const items = useMemo<SearchResultItem[]>(
    () =>
      cardSnapshots
        .filter((snapshot) => snapshot.table === "memories")
        .map((snapshot) => {
          const id = snapshot.id as Id<"memories">;
          return {
            id,
            title: snapshot.title,
            content: snapshot.content,
            entry_kind: snapshot.entry_kind,
            schedule_due_at: snapshot.schedule_due_at ?? null,
            google_event_id: snapshot.google_event_id,
            google_sync_status: snapshot.google_sync_status,
            google_sync_message: snapshot.google_sync_message,
            google_sync_updated_at: snapshot.google_sync_updated_at,
            ...syncOverrides[id],
          };
        })
        .filter((item) => !deletedMemoryIds.has(item.id)),
    [cardSnapshots, deletedMemoryIds, syncOverrides],
  );

  const diaryItems = useMemo<DiaryCardDoc[]>(
    () =>
      cardSnapshots
        .filter((snapshot) => snapshot.table === "diaryEntries")
        .map((snapshot) => ({
          _id: snapshot.id as Id<"diaryEntries">,
          _creationTime: snapshot.creation_time,
          mood: snapshot.mood,
          energyLevel: snapshot.energy_level,
          topics: snapshot.topics,
          summary: snapshot.summary,
          excerpt: snapshot.excerpt,
        }))
        .filter((entry) => !deletedDiaryIds.has(entry._id)),
    [cardSnapshots, deletedDiaryIds],
  );
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
        setDeletedMemoryIds((prev) => new Set([...prev, id]));
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
        setDeletedDiaryIds((prev) => new Set([...prev, id]));
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
        if (result.queued) {
          setSyncOverrides((prev) => ({
            ...prev,
            [item.id]: {
              google_sync_status: "pending",
              google_sync_message: result.message,
              google_sync_updated_at: Date.now(),
            },
          }));
        }
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
        if (result.removed) {
          setSyncOverrides((prev) => ({
            ...prev,
            [item.id]: {
              google_event_id: undefined,
              google_sync_status: undefined,
              google_sync_message: undefined,
              google_sync_updated_at: Date.now(),
            },
          }));
        }
        showToast({ title: result.message, tone: result.removed ? "success" : "info" });
      } catch {
        showToast({ title: "Couldn't remove Google sync", tone: "error" });
      }
    },
    [confirm, removeReminderSync, showToast, token],
  );

  return (
    <Animated.View entering={FadeInDown.duration(260)} style={{ marginTop: 6, maxWidth: "92%" }}>
      <YStack
        backgroundColor={theme.surface.val}
        borderWidth={1}
        borderColor={theme.borderSubtle.val}
        borderRadius={18}
        overflow="hidden"
        style={getBubbleShadow(theme.shadowColor.val)}
      >
        <XStack
          alignItems="center"
          justifyContent="space-between"
          gap={8}
          paddingHorizontal={12}
          paddingVertical={9}
          borderBottomWidth={1}
          borderBottomColor={theme.borderSubtle.val}
        >
          <XStack gap={6} alignItems="center" flex={1}>
            <Feather name="layers" size={13} color={theme.primary.val} />
            <Text fontSize={13} fontFamily={FontFamily.semiBold} color={theme.color.val}>
              {headerLabel || "Results"}
            </Text>
          </XStack>
        </XStack>

        <YStack>
          {displayItems.map((item, index) => (
            <MemoryResultRow
              key={item.id}
              item={item}
              index={index}
              isCompleted={completedIds.has(item.id)}
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
