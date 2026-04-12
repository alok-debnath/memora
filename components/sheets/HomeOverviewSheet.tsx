import React, { useMemo, useState } from "react";
import { ScrollView } from "react-native";
import Animated, { FadeInRight } from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
import { Text, XStack, YStack } from "tamagui";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { BaseSheet } from "@/components/ui/BaseSheet";
import { PressableScale } from "@/components/ui/PressableScale";
import { Badge } from "@/components/ui/Badge";
import { SectionCard } from "@/components/ui/AppScreen";
import { FlashbackCard } from "@/components/FlashbackCard";
import { useAuth } from "@/hooks/useAuth";
import { useAppTheme } from "@/hooks/useAppTheme";
import { selectSheetOpen, useUIStore } from "@/store/ui";
import type { MemoryNote } from "@/types/memory";
import { getReminderDate, inferMemoryEntryKind } from "@/types/memoryKind";

type MemoryItem = {
  _id: Id<"memories">;
  _creationTime: number;
  userId: Id<"users">;
  title?: string;
  content?: string;
  primaryTopicId?: string;
  topicIds?: string[];
  mood?: string;
  entryKind?: "memory" | "reminder";
  schedule?: MemoryNote["schedule"];
  people?: string[];
  locations?: string[];
  importance: string;
  shareToken?: string;
  isPublic?: boolean;
  googleEventId?: string;
  googleSyncStatus?: "pending" | "synced" | "failed";
  googleSyncMessage?: string;
  googleSyncUpdatedAt?: number;
  [key: string]: unknown;
};

const toMemoryNote = (m: Record<string, unknown>): MemoryNote => ({
  id: m._id as string,
  userId: (m.userId as string) || "",
  title: (m.title as string) || "",
  content: (m.content as string) || "",
  primaryTopicId: m.primaryTopicId as string | undefined,
  topicIds: m.topicIds as string[] | undefined,
  mood: m.mood as MemoryNote["mood"],
  people: (m.people as string[]) || [],
  locations: (m.locations as string[]) || [],
  importance: (m.importance || "normal") as MemoryNote["importance"],
  lifeArea: m.lifeArea as MemoryNote["lifeArea"],
  contextTags: m.contextTags as Record<string, string> | undefined,
  sentimentScore: m.sentimentScore as number | undefined,
  linkedUrls: Array.isArray(m.linkedUrls) ? m.linkedUrls : [],
  extractedActions: m.extractedActions as MemoryNote["extractedActions"],
  entryKind: inferMemoryEntryKind(m as Parameters<typeof inferMemoryEntryKind>[0]),
  schedule: m.schedule as MemoryNote["schedule"] | undefined,
  reminderDate: getReminderDate(m as Parameters<typeof getReminderDate>[0]),
  isRecurring: (m.schedule as { isRecurring?: boolean } | undefined)?.isRecurring ?? false,
  recurrenceType: (m.schedule as { recurrenceType?: MemoryNote["recurrenceType"] } | undefined)
    ?.recurrenceType,
  capsuleUnlockDate: m.capsuleUnlockDate as string | undefined,
  isPublic: m.isPublic as boolean | undefined,
  googleEventId: m.googleEventId as string | undefined,
  googleSyncStatus: m.googleSyncStatus as MemoryNote["googleSyncStatus"] | undefined,
  googleSyncMessage: m.googleSyncMessage as string | undefined,
  googleSyncUpdatedAt: m.googleSyncUpdatedAt as number | undefined,
  createdAt: new Date(m._creationTime as number).toISOString(),
  updatedAt: new Date(m._creationTime as number).toISOString(),
});

function MetricTile({ value, label }: { value: number; label: string }) {
  return (
    <YStack
      flex={1}
      padding={14}
      borderRadius={20}
      backgroundColor="$background"
      borderWidth={1}
      borderColor="$borderColor"
      gap={4}
    >
      <Text fontSize={22} fontFamily="$heading" fontWeight="700" color="$color">
        {value}
      </Text>
      <Text fontSize={12} color="$colorMuted">
        {label}
      </Text>
    </YStack>
  );
}

export function HomeOverviewSheet() {
  const theme = useAppTheme();
  const { token } = useAuth();
  const open = useUIStore(selectSheetOpen("homeOverview"));
  const closeHomeOverview = useUIStore((state) => state.closeHomeOverview);
  const openEditMemory = useUIStore((state) => state.openEditMemory);
  const [upcomingRange, setUpcomingRange] = useState<"week" | "month" | "year" | "all">("week");

  const querySnapshot = useMemo(
    () => ({
      nowIso: new Date().toISOString(),
      nowMs: Date.now(),
    }),
    [],
  );

  const flashbacks = useQuery(api.memories.flashbacks, token ? { token } : "skip") ?? [];
  const reminderMemories =
    useQuery(api.memories.reminders, token ? { token, asOf: querySnapshot.nowIso } : "skip") ?? [];
  const upcomingReminders =
    useQuery(
      api.memories.upcomingReminders,
      token ? { token, asOf: querySnapshot.nowIso, range: upcomingRange } : "skip",
    ) ?? [];
  const stats =
    useQuery(api.memories.stats, token ? { token, asOf: querySnapshot.nowMs } : "skip") ?? null;
  const activeTopicSummaries =
    useQuery(api.userTopics.activeSummaries, token ? { token } : "skip") ?? [];

  const topReminders = useMemo(
    () =>
      (reminderMemories as MemoryItem[])
        .slice()
        .sort((a, b) => {
          const aTime = new Date(getReminderDate(a) ?? 0).getTime();
          const bTime = new Date(getReminderDate(b) ?? 0).getTime();
          return aTime - bTime;
        })
        .slice(0, 4),
    [reminderMemories],
  );

  const totalMemories = stats?.totalMemories ?? 0;
  const totalReminders = stats?.totalReminders ?? 0;
  const totalCategories = activeTopicSummaries.length;

  return (
    <BaseSheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) closeHomeOverview();
      }}
      sheetId="homeOverview"
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 8,
          paddingBottom: 40,
          gap: 18,
        }}
      >
        <YStack gap={18}>
          <XStack alignItems="center" justifyContent="space-between" gap={12}>
            <Text fontSize={26} fontFamily="$heading" fontWeight="700" color="$color">
              Overview
            </Text>
            <PressableScale onPress={closeHomeOverview}>
              <YStack
                width={38}
                height={38}
                borderRadius={14}
                alignItems="center"
                justifyContent="center"
                backgroundColor="$background"
                borderWidth={1}
                borderColor="$borderColor"
              >
                <Feather name="x" size={18} color={theme.color.val} />
              </YStack>
            </PressableScale>
          </XStack>

          <XStack gap={10}>
            <MetricTile value={totalMemories} label="Memories" />
            <MetricTile value={totalReminders} label="Reminders" />
            <MetricTile value={totalCategories} label="Categories" />
          </XStack>

          <SectionCard
            title="Due now"
            action={
              topReminders.length > 0 ? (
                <YStack
                  minWidth={24}
                  height={24}
                  borderRadius={999}
                  paddingHorizontal={8}
                  alignItems="center"
                  justifyContent="center"
                  backgroundColor={theme.warning.val + "22"}
                >
                  <Text fontSize={12} fontWeight="700" color={theme.warning.val}>
                    {topReminders.length}
                  </Text>
                </YStack>
              ) : null
            }
          >
            {topReminders.length > 0 ? (
              <YStack gap={10}>
                {topReminders.map((memory) => (
                  <XStack
                    key={memory._id}
                    alignItems="center"
                    justifyContent="space-between"
                    gap={12}
                  >
                    <YStack flex={1} gap={2}>
                      <Text fontSize={14} fontWeight="700" color="$color" numberOfLines={1}>
                        {memory.title || "Untitled memory"}
                      </Text>
                      <Text fontSize={12} color="$colorMuted">
                        {new Date(getReminderDate(memory)!).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </Text>
                    </YStack>
                    <Badge label="reminder" color={theme.warning.val} small />
                  </XStack>
                ))}
              </YStack>
            ) : (
              <Text fontSize={13} lineHeight={20} color="$colorMuted">
                Nothing needs attention immediately.
              </Text>
            )}
          </SectionCard>

          <SectionCard
            title="Upcoming"
            action={
              upcomingReminders.length > 0 ? (
                <YStack
                  minWidth={24}
                  height={24}
                  borderRadius={999}
                  paddingHorizontal={8}
                  alignItems="center"
                  justifyContent="center"
                  backgroundColor={theme.primary.val + "22"}
                >
                  <Text fontSize={12} fontWeight="700" color="$primary">
                    {upcomingReminders.length}
                  </Text>
                </YStack>
              ) : null
            }
          >
            <XStack gap={6} flexWrap="wrap">
              {(["week", "month", "year", "all"] as const).map((range) => (
                <PressableScale key={range} onPress={() => setUpcomingRange(range)}>
                  <YStack
                    paddingHorizontal={12}
                    paddingVertical={6}
                    borderRadius={999}
                    backgroundColor={
                      upcomingRange === range ? theme.primary.val + "22" : "$secondary"
                    }
                    borderWidth={1}
                    borderColor={upcomingRange === range ? theme.primary.val : "$borderColor"}
                  >
                    <Text
                      fontSize={12}
                      fontWeight="700"
                      color={upcomingRange === range ? "$primary" : "$colorMuted"}
                      textTransform="capitalize"
                    >
                      {range}
                    </Text>
                  </YStack>
                </PressableScale>
              ))}
            </XStack>
            {upcomingReminders.length > 0 ? (
              <YStack gap={10}>
                {(upcomingReminders as MemoryItem[]).map((memory) => (
                  <XStack
                    key={memory._id}
                    alignItems="center"
                    justifyContent="space-between"
                    gap={12}
                  >
                    <YStack flex={1} gap={2}>
                      <Text fontSize={14} fontWeight="700" color="$color" numberOfLines={1}>
                        {memory.title || "Untitled memory"}
                      </Text>
                      <Text fontSize={12} color="$colorMuted">
                        {new Date(getReminderDate(memory)!).toLocaleString(undefined, {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </Text>
                    </YStack>
                    <Badge label="upcoming" color={theme.primary.val} small />
                  </XStack>
                ))}
              </YStack>
            ) : (
              <Text fontSize={13} lineHeight={20} color="$colorMuted">
                No reminders in this range.
              </Text>
            )}
          </SectionCard>

          {flashbacks.length > 0 ? (
            <SectionCard title="On this day">
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 12, paddingRight: 8 }}
              >
                {(flashbacks as MemoryItem[]).map((memory, index) => (
                  <Animated.View
                    key={memory._id}
                    entering={FadeInRight.delay(index * 60).duration(240)}
                  >
                    <FlashbackCard
                      memory={toMemoryNote(memory)}
                      onPress={() => {
                        closeHomeOverview();
                        openEditMemory(toMemoryNote(memory));
                      }}
                    />
                  </Animated.View>
                ))}
              </ScrollView>
            </SectionCard>
          ) : null}
        </YStack>
      </ScrollView>
    </BaseSheet>
  );
}
