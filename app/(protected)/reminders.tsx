import React, { useMemo, useState } from "react";
import { ActivityIndicator, FlatList } from "react-native";
import Animated, { FadeInDown, ReduceMotion } from "react-native-reanimated";
import { XStack, YStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import { Feather } from "@/lib/icons";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/Badge";
import { AppScreen, SectionCard } from "@/components/ui/AppScreen";
import { AppButton } from "@/components/ui/AppButton";
import { ResponsiveStatGrid, WorkspaceSplit } from "@/components/ui/Responsive";
import { SelectionTabs, type SelectionTabOption } from "@/components/ui/SelectionTabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { radius, spacing } from "@/constants/uiTokens";
import { getReminderDate, isReminder } from "@/types/memoryKind";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import { useUIStore } from "@/store/ui";

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

const FILTERS: { key: FilterKey; label: string; compactLabel: string }[] = [
  { key: "today", label: "Today", compactLabel: "Today" },
  { key: "week", label: "7 days", compactLabel: "7D" },
  { key: "month", label: "30 days", compactLabel: "30D" },
  { key: "year", label: "1 Year", compactLabel: "Year" },
  { key: "all", label: "All", compactLabel: "All" },
];

type EmptyStateCopy = {
  eyebrow: string;
  title: string;
  description: string;
};

function getEmptyStateCopy(filter: FilterKey): EmptyStateCopy {
  switch (filter) {
    case "today":
      return {
        eyebrow: "Today",
        title: "Nothing due today",
        description: "You’re caught up. Add a reminder if something still needs your attention.",
      };
    case "week":
      return {
        eyebrow: "Next 7 days",
        title: "Your week is clear",
        description: "There are no reminders scheduled in the next seven days.",
      };
    case "month":
      return {
        eyebrow: "Next 30 days",
        title: "Nothing scheduled this month",
        description: "There are no reminders scheduled in the next thirty days.",
      };
    case "year":
      return {
        eyebrow: "Next 12 months",
        title: "Nothing scheduled this year",
        description: "There are no reminders scheduled in the next twelve months.",
      };
    case "all":
      return {
        eyebrow: "All reminders",
        title: "No reminders yet",
        description: "Add a date to something worth remembering and it will appear here.",
      };
  }
}

function RemindersEmptyState({
  activeFilter,
  onAddReminder,
}: {
  activeFilter: FilterKey;
  onAddReminder: () => void;
}) {
  const copy = getEmptyStateCopy(activeFilter);

  return (
    <Animated.View
      key={activeFilter}
      entering={FadeInDown.duration(180).reduceMotion(ReduceMotion.System)}
    >
      <EmptyState
        icon="bell"
        eyebrow={copy.eyebrow}
        title={copy.title}
        description={copy.description}
        size="compact"
        action={
          <AppButton
            title="Add a reminder"
            icon="plus"
            size="sm"
            variant="secondary"
            onPress={onAddReminder}
          />
        }
      />
    </Animated.View>
  );
}

function getRangeOptions(reminders: ReminderItem[]): SelectionTabOption<FilterKey>[] {
  return FILTERS.map((filter) => ({
    value: filter.key,
    label: filter.label,
    compactLabel: filter.compactLabel,
    count: getFilteredReminders(reminders, filter.key).length,
  }));
}

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
  const openCommand = useUIStore((state) => state.openCommand);
  const [activeFilter, setActiveFilter] = useState<FilterKey>("week");

  const dueNowResult = useQuery(api.memories.reminders, token ? { token } : "skip");
  const upcomingResult = useQuery(
    api.memories.upcomingReminders,
    token ? { token, range: "all" } : "skip",
  );
  const dueNow = dueNowResult ?? [];
  const upcoming = upcomingResult ?? [];
  const isLoading = Boolean(token && (dueNowResult === undefined || upcomingResult === undefined));
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
  const rangeOptions = useMemo(() => getRangeOptions(withReminders), [withReminders]);
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
              <SelectionTabs
                options={rangeOptions}
                value={activeFilter}
                onChange={setActiveFilter}
                orientation="vertical"
                size="compact"
                accessibilityLabel="Reminder range"
              />
            </SectionCard>
          </YStack>
        }
      >
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item._id)}
          ListHeaderComponent={
            isExpanded ? null : (
              <YStack paddingBottom={spacing.md}>
                <SelectionTabs
                  options={rangeOptions}
                  value={activeFilter}
                  onChange={setActiveFilter}
                  showCompactLabels
                  size="compact"
                  accessibilityLabel="Reminder range"
                />
              </YStack>
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
            isLoading ? (
              <YStack minHeight={260} alignItems="center" justifyContent="center" gap={spacing.md}>
                <ActivityIndicator color={theme.primary.val} />
                <Text fontSize={13} color={theme.colorMuted.val}>
                  Checking your schedule…
                </Text>
              </YStack>
            ) : (
              <RemindersEmptyState activeFilter={activeFilter} onAddReminder={openCommand} />
            )
          }
          showsVerticalScrollIndicator={false}
          style={{ width: "100%", alignSelf: "center" }}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xl }}
        />
      </ReminderWorkspace>
    </AppScreen>
  );
}
