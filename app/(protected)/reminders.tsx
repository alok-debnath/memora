import React, { useMemo, useState } from "react";
import { FlatList, ScrollView, Pressable } from "react-native";
import { XStack, YStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import { Feather } from "@/lib/icons";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { AppScreen, SectionCard } from "@/components/ui/AppScreen";
import { ResponsiveStatGrid, WorkspaceSplit } from "@/components/ui/Responsive";
import { PressableScale } from "@/components/ui/PressableScale";
import { radius, spacing } from "@/constants/uiTokens";
import { getReminderDate, isReminder } from "@/types/memoryKind";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";

function ReminderWorkspace({
  children,
  aside,
}: {
  children: React.ReactNode;
  aside: React.ReactNode;
}) {
  const { isExpanded } = useResponsiveLayout();
  if (!isExpanded) return children;
  return (
    <YStack flex={1} width="100%" paddingHorizontal={spacing.lg}>
      <WorkspaceSplit aside={aside} asideWidth={310} splitAt={760} gap={spacing.lg} fill>
        {children}
      </WorkspaceSplit>
    </YStack>
  );
}

type ReminderItem = {
  _id: Id<"memories">;
  title: string;
  content: string;
  entryKind?: "memory" | "reminder";
  schedule?: {
    dueAt: string;
    isRecurring: boolean;
    recurrenceType?: "daily" | "weekly" | "monthly" | "yearly";
  };
  _creationTime: number;
};

type FilterKey = "today" | "week" | "month" | "year" | "all";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "1 Week" },
  { key: "month", label: "1 Month" },
  { key: "year", label: "1 Year" },
  { key: "all", label: "All" },
];

function getFilteredReminders(memories: ReminderItem[], filter: FilterKey) {
  const now = new Date();
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const weekEnd = new Date(now.getTime() + 7 * 86400000);
  const monthEnd = new Date(now.getTime() + 30 * 86400000);
  const yearEnd = new Date(now.getTime() + 365 * 86400000);

  return memories.filter((m) => {
    const dueAt = getReminderDate(m);
    if (!dueAt) return false;
    const d = new Date(dueAt);
    switch (filter) {
      case "today":
        return d < todayEnd;
      case "week":
        return d < weekEnd;
      case "month":
        return d < monthEnd;
      case "year":
        return d < yearEnd;
      case "all":
        return true;
    }
  });
}

function isOverdue(dateStr: string) {
  return new Date(dateStr) < new Date();
}

export default function RemindersScreen() {
  const theme = useAppTheme();
  const { token } = useAuth();
  const { isExpanded } = useResponsiveLayout();
  const [activeFilter, setActiveFilter] = useState<FilterKey>("week");

  const dueNow = useQuery(api.memories.reminders, token ? { token } : "skip") ?? [];
  const upcoming =
    useQuery(api.memories.upcomingReminders, token ? { token, range: "all" } : "skip") ?? [];
  const memories = useMemo(() => {
    const merged = new Map<string, ReminderItem>();
    for (const memory of [...(dueNow as ReminderItem[]), ...(upcoming as ReminderItem[])]) {
      merged.set(String(memory._id), memory);
    }
    return Array.from(merged.values()).sort((a, b) => {
      const aDue = getReminderDate(a) ?? "";
      const bDue = getReminderDate(b) ?? "";
      return aDue.localeCompare(bDue);
    });
  }, [dueNow, upcoming]);

  const withReminders = useMemo(() => memories.filter((m) => isReminder(m)), [memories]);
  const filtered = useMemo(
    () => getFilteredReminders(withReminders, activeFilter),
    [withReminders, activeFilter],
  );
  const overdueCount = withReminders.filter((item) => isOverdue(getReminderDate(item)!)).length;
  const todayCount = getFilteredReminders(withReminders, "today").length;
  const upcomingCount = Math.max(0, withReminders.length - overdueCount);
  return (
    <AppScreen
      showBack
      title="Reminders"
      subtitle="An agenda for overdue commitments, today’s priorities, and what comes next."
      contentWidth="workspace"
      noScroll
    >
      <ReminderWorkspace
        aside={
          <YStack gap={12}>
            <SectionCard
              title="Agenda summary"
              eyebrow="Schedule"
              density="compact"
              emphasis="quiet"
            >
              <ResponsiveStatGrid
                maximumColumns={2}
                minimumColumnWidth={110}
                items={[
                  { label: "Overdue", value: overdueCount, color: theme.destructive.val },
                  { label: "Due today", value: todayCount },
                  { label: "Upcoming", value: upcomingCount },
                  { label: "All", value: withReminders.length },
                ]}
              />
            </SectionCard>
            <SectionCard title="Range" density="compact" emphasis="quiet">
              <YStack gap={6}>
                {FILTERS.map((filter) => {
                  const active = activeFilter === filter.key;
                  const count = getFilteredReminders(withReminders, filter.key).length;
                  return (
                    <PressableScale key={filter.key} onPress={() => setActiveFilter(filter.key)}>
                      <XStack
                        alignItems="center"
                        justifyContent="space-between"
                        gap={8}
                        paddingHorizontal={10}
                        paddingVertical={9}
                        borderRadius={radius.sm}
                        backgroundColor={active ? theme.surfaceAccent.val : "transparent"}
                      >
                        <Text
                          fontSize={12}
                          fontWeight={active ? "700" : "500"}
                          color={active ? theme.primary.val : theme.color.val}
                        >
                          {filter.label}
                        </Text>
                        <Text fontSize={11} fontFamily="$utility" color={theme.colorMuted.val}>
                          {count}
                        </Text>
                      </XStack>
                    </PressableScale>
                  );
                })}
              </YStack>
            </SectionCard>
          </YStack>
        }
      >
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item._id)}
          ListHeaderComponent={
            isExpanded ? null : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingBottom: 12 }}
              >
                {FILTERS.map((filter) => {
                  const active = activeFilter === filter.key;
                  const count = getFilteredReminders(withReminders, filter.key).length;
                  return (
                    <Pressable
                      key={filter.key}
                      onPress={() => setActiveFilter(filter.key)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                        borderRadius: radius.pill,
                        borderWidth: 1,
                        borderColor: active ? theme.primary.val : theme.borderColor.val,
                        backgroundColor: active
                          ? theme.surfaceAccent.val
                          : theme.backgroundStrong.val,
                      }}
                    >
                      <Text
                        fontSize={13}
                        fontWeight={active ? "700" : "500"}
                        color={active ? theme.primary.val : theme.colorMuted.val}
                      >
                        {filter.label}
                      </Text>
                      {count > 0 ? (
                        <YStack
                          backgroundColor={active ? theme.primary.val : theme.borderColor.val}
                          borderRadius={10}
                          minWidth={18}
                          height={18}
                          alignItems="center"
                          justifyContent="center"
                          paddingHorizontal={4}
                        >
                          <Text
                            fontSize={10}
                            fontFamily="$utility"
                            fontWeight="700"
                            color={active ? theme.textInverse.val : theme.color.val}
                          >
                            {count}
                          </Text>
                        </YStack>
                      ) : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            )
          }
          renderItem={({ item }) => {
            const overdue = isOverdue(getReminderDate(item)!);
            return (
              <XStack
                alignItems="center"
                gap={12}
                paddingHorizontal={14}
                paddingVertical={13}
                borderWidth={1}
                borderColor={theme.borderSubtle.val}
                backgroundColor={theme.surface.val}
                borderRadius={radius.md}
              >
                <YStack
                  width={36}
                  height={36}
                  borderRadius={10}
                  alignItems="center"
                  justifyContent="center"
                  backgroundColor={overdue ? theme.surfaceDangerSoft.val : theme.surfaceAccent.val}
                >
                  <Feather
                    name="bell"
                    size={16}
                    color={overdue ? theme.destructive.val : theme.primary.val}
                  />
                </YStack>
                <YStack flex={1} minWidth={0}>
                  <Text fontSize={15} fontWeight="600" color={theme.color.val} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text fontSize={12} marginTop={2} color={theme.colorMuted.val}>
                    {new Date(getReminderDate(item)!).toLocaleString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </Text>
                </YStack>
                {overdue ? <Badge label="overdue" color={theme.destructive.val} small /> : null}
              </XStack>
            );
          }}
          ItemSeparatorComponent={() => <YStack height={10} />}
          ListEmptyComponent={
            <EmptyState
              icon="bell"
              title="No reminders"
              description={
                activeFilter === "today"
                  ? "Nothing due today."
                  : activeFilter === "all"
                    ? "Set reminder dates on your memories to see them here."
                    : `No reminders in the next ${FILTERS.find((f) => f.key === activeFilter)?.label.toLowerCase()}.`
              }
            />
          }
          showsVerticalScrollIndicator={false}
          style={{ width: "100%", alignSelf: "center" }}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xl }}
        />
      </ReminderWorkspace>
    </AppScreen>
  );
}
