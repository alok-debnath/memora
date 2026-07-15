import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, type LayoutChangeEvent, Pressable } from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
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
import { PressableScale } from "@/components/ui/PressableScale";
import { withAlpha } from "@/components/ui/themeHelpers";
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

const RANGE_PADDING = spacing.xs;
const RANGE_GAP = 2;
const DESKTOP_RANGE_HEIGHT = 38;
const DESKTOP_RANGE_GAP = 6;
const RANGE_TIMING = { duration: 190, easing: Easing.out(Easing.cubic) } as const;

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
  const theme = useAppTheme();
  const copy = getEmptyStateCopy(activeFilter);

  return (
    <Animated.View
      key={activeFilter}
      entering={FadeInDown.duration(280).reduceMotion(ReduceMotion.System)}
    >
      <YStack
        padding={spacing.xl}
        borderRadius={radius.lg}
        borderWidth={1}
        borderColor={theme.borderSubtle.val}
        backgroundColor={theme.surface.val}
        gap={spacing.xl}
      >
        <XStack alignItems="flex-start" gap={spacing.md}>
          <YStack
            width={44}
            height={44}
            borderRadius={radius.sm}
            alignItems="center"
            justifyContent="center"
            backgroundColor={theme.surfaceAccent.val}
          >
            <Feather name="bell" size={19} color={theme.primary.val} />
          </YStack>
          <YStack flex={1} minWidth={0} gap={spacing.xs}>
            <Text
              fontFamily="$utility"
              fontSize={10}
              fontWeight="700"
              letterSpacing={0.9}
              textTransform="uppercase"
              color={theme.primary.val}
            >
              {copy.eyebrow}
            </Text>
            <Text fontFamily="$heading" fontSize={21} fontWeight="700" color={theme.color.val}>
              {copy.title}
            </Text>
            <Text fontFamily="$body" fontSize={14} lineHeight={21} color={theme.colorMuted.val}>
              {copy.description}
            </Text>
          </YStack>
        </XStack>
        <AppButton
          title="Add a reminder"
          icon="plus"
          size="sm"
          variant="secondary"
          onPress={onAddReminder}
        />
      </YStack>
    </Animated.View>
  );
}

function CompactRangeSelector({
  activeFilter,
  reminders,
  onChange,
}: {
  activeFilter: FilterKey;
  reminders: ReminderItem[];
  onChange: (filter: FilterKey) => void;
}) {
  const theme = useAppTheme();
  const reduceMotion = useReducedMotion();
  const [containerWidth, setContainerWidth] = useState(0);
  const activeIndex = FILTERS.findIndex((filter) => filter.key === activeFilter);
  const segmentWidth =
    containerWidth > 0
      ? (containerWidth - RANGE_PADDING * 2 - RANGE_GAP * (FILTERS.length - 1)) / FILTERS.length
      : 0;
  const indicatorX = useSharedValue(0);

  useEffect(() => {
    if (segmentWidth <= 0 || activeIndex < 0) return;
    const targetX = activeIndex * (segmentWidth + RANGE_GAP);
    if (reduceMotion) {
      indicatorX.value = targetX;
      return;
    }
    indicatorX.value = withTiming(targetX, RANGE_TIMING);
  }, [activeIndex, indicatorX, reduceMotion, segmentWidth]);

  const indicatorStyle = useAnimatedStyle(() => ({
    opacity: segmentWidth > 0 ? 1 : 0,
    transform: [{ translateX: indicatorX.value }],
  }));

  const handleLayout = (event: LayoutChangeEvent) => {
    setContainerWidth(event.nativeEvent.layout.width);
  };

  return (
    <XStack
      onLayout={handleLayout}
      position="relative"
      padding={RANGE_PADDING}
      gap={RANGE_GAP}
      borderRadius={radius.md}
      borderWidth={1}
      borderColor={theme.borderSubtle.val}
      backgroundColor={theme.backgroundStrong.val}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            top: RANGE_PADDING,
            bottom: RANGE_PADDING,
            left: RANGE_PADDING,
            width: segmentWidth,
            borderRadius: radius.sm,
            backgroundColor: theme.primary.val,
          },
          indicatorStyle,
        ]}
      />
      {FILTERS.map((filter) => {
        const active = activeFilter === filter.key;
        const count = getFilteredReminders(reminders, filter.key).length;
        return (
          <Pressable
            key={filter.key}
            onPress={() => onChange(filter.key)}
            accessibilityRole="tab"
            accessibilityLabel={filter.label}
            accessibilityState={{ selected: active }}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 42,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: radius.sm,
              opacity: pressed ? 0.72 : 1,
              backgroundColor: segmentWidth === 0 && active ? theme.primary.val : "transparent",
            })}
          >
            <XStack alignItems="center" justifyContent="center" gap={5}>
              <Text
                fontFamily="$utility"
                fontSize={12}
                fontWeight="700"
                color={active ? theme.textInverse.val : theme.colorMuted.val}
              >
                {filter.compactLabel}
              </Text>
              {count > 0 ? (
                <YStack
                  minWidth={16}
                  height={16}
                  paddingHorizontal={3}
                  borderRadius={radius.pill}
                  alignItems="center"
                  justifyContent="center"
                  backgroundColor={
                    active ? withAlpha(theme.textInverse.val, "2E") : theme.surfaceAccent.val
                  }
                >
                  <Text
                    fontFamily="$utility"
                    fontSize={9}
                    fontWeight="700"
                    color={active ? theme.textInverse.val : theme.primary.val}
                  >
                    {count > 99 ? "99+" : count}
                  </Text>
                </YStack>
              ) : null}
            </XStack>
          </Pressable>
        );
      })}
    </XStack>
  );
}

function DesktopRangeSelector({
  activeFilter,
  reminders,
  onChange,
}: {
  activeFilter: FilterKey;
  reminders: ReminderItem[];
  onChange: (filter: FilterKey) => void;
}) {
  const theme = useAppTheme();
  const reduceMotion = useReducedMotion();
  const activeIndex = FILTERS.findIndex((filter) => filter.key === activeFilter);
  const indicatorY = useSharedValue(
    Math.max(0, activeIndex) * (DESKTOP_RANGE_HEIGHT + DESKTOP_RANGE_GAP),
  );

  useEffect(() => {
    if (activeIndex < 0) return;
    const targetY = activeIndex * (DESKTOP_RANGE_HEIGHT + DESKTOP_RANGE_GAP);
    indicatorY.value = reduceMotion ? targetY : withTiming(targetY, RANGE_TIMING);
  }, [activeIndex, indicatorY, reduceMotion]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: indicatorY.value }],
  }));

  return (
    <YStack position="relative" gap={DESKTOP_RANGE_GAP}>
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: DESKTOP_RANGE_HEIGHT,
            borderRadius: radius.sm,
            backgroundColor: theme.surfaceAccent.val,
          },
          indicatorStyle,
        ]}
      />
      {FILTERS.map((filter) => {
        const active = activeFilter === filter.key;
        const count = getFilteredReminders(reminders, filter.key).length;
        return (
          <PressableScale
            key={filter.key}
            onPress={() => onChange(filter.key)}
            accessibilityRole="tab"
            accessibilityLabel={filter.label}
            accessibilityState={{ selected: active }}
            style={{ zIndex: 1 }}
          >
            <XStack
              height={DESKTOP_RANGE_HEIGHT}
              alignItems="center"
              justifyContent="space-between"
              gap={spacing.sm}
              paddingHorizontal={10}
              borderRadius={radius.sm}
            >
              <Text
                fontSize={12}
                fontWeight={active ? "700" : "500"}
                color={active ? theme.primary.val : theme.color.val}
              >
                {filter.label}
              </Text>
              <Text
                fontSize={11}
                fontFamily="$utility"
                fontWeight={active ? "700" : "500"}
                color={active ? theme.primary.val : theme.colorMuted.val}
              >
                {count}
              </Text>
            </XStack>
          </PressableScale>
        );
      })}
    </YStack>
  );
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
              <DesktopRangeSelector
                activeFilter={activeFilter}
                reminders={withReminders}
                onChange={setActiveFilter}
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
                <CompactRangeSelector
                  activeFilter={activeFilter}
                  reminders={withReminders}
                  onChange={setActiveFilter}
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
