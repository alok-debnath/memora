import React, { useMemo, useState } from "react";
import { ScrollView, Pressable } from "react-native";
import { XStack, YStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { MorePageScaffold } from "@/components/ui/MorePageScaffold";
import { getReminderDate, isReminder } from "@/types/memoryKind";

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
  const [activeFilter, setActiveFilter] = useState<FilterKey>("week");

  const dueNow = useQuery(api.memories.reminders, token ? { token } : "skip") ?? [];
  const upcoming =
    useQuery(api.memories.upcomingReminders, token ? { token, range: "all" } : "skip") ?? [];
  const stats = useQuery(api.memories.stats, token ? { token } : "skip");
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
  const overdueCount = useMemo(
    () => withReminders.filter((m) => getReminderDate(m) && isOverdue(getReminderDate(m)!)).length,
    [withReminders],
  );
  const todayCount = useMemo(
    () => getFilteredReminders(withReminders, "today").length,
    [withReminders],
  );

  const metrics = [
    { label: "Total", value: stats?.totalReminders ?? 0 },
    { label: "Overdue", value: overdueCount },
    { label: "Today", value: todayCount },
  ];

  return (
    <MorePageScaffold title="Reminders" staticHeader>
      <Card
        style={{
          padding: 18,
          borderRadius: 24,
          backgroundColor: theme.card.val,
          marginBottom: 14,
        }}
      >
        <YStack flex={1} gap={6}>
          <Badge label="Time aware" color={theme.primary.val} />
          <Text fontSize={28} lineHeight={32} fontFamily="$heading" fontWeight="700" color="$color">
            Reminders
          </Text>
          <Text fontSize={14} lineHeight={20} fontFamily="$body" color="$colorMuted">
            Keep the pending moments in view. Overdue items are surfaced first so nothing slips.
          </Text>
        </YStack>
        <XStack gap={10} marginTop={16}>
          {metrics.map((metric) => (
            <Card
              key={metric.label}
              style={{
                flex: 1,
                alignItems: "center",
                paddingVertical: 12,
                borderRadius: 18,
              }}
            >
              <Text fontSize={20} fontFamily="$heading" fontWeight="700" color="$color">
                {metric.value}
              </Text>
              <Text fontSize={11} fontFamily="$body" marginTop={2} color="$colorMuted">
                {metric.label.toLowerCase()}
              </Text>
            </Card>
          ))}
        </XStack>
      </Card>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingBottom: 12 }}
      >
        {FILTERS.map((f) => {
          const active = activeFilter === f.key;
          const count = getFilteredReminders(withReminders, f.key).length;
          return (
            <Pressable
              key={f.key}
              onPress={() => setActiveFilter(f.key)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: active ? theme.primary.val : theme.borderColor.val,
                backgroundColor: active ? theme.primary.val + "18" : theme.backgroundStrong.val,
              }}
            >
              <Text
                fontSize={13}
                fontFamily="$body"
                fontWeight={active ? "600" : "400"}
                color={active ? "$primary" : "$colorMuted"}
              >
                {f.label}
              </Text>
              {count > 0 && (
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
                    fontFamily="$body"
                    fontWeight="600"
                    color={active ? "$textInverse" : "$color"}
                  >
                    {count}
                  </Text>
                </YStack>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      <YStack gap={10}>
        {filtered.length === 0 ? (
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
        ) : (
          filtered.map((m) => (
            <YStack key={m._id}>
              <Card style={{ borderRadius: 22 }}>
                <XStack alignItems="center" gap={12}>
                  <YStack
                    width={10}
                    height={10}
                    borderRadius={5}
                    backgroundColor={
                      isOverdue(getReminderDate(m)!) ? theme.destructive.val : theme.primary.val
                    }
                  />
                  <YStack flex={1}>
                    <Text
                      fontSize={15}
                      fontFamily="$heading"
                      fontWeight="600"
                      color="$color"
                      numberOfLines={1}
                    >
                      {m.title}
                    </Text>
                    <Text fontSize={12} fontFamily="$body" marginTop={2} color="$colorMuted">
                      {new Date(getReminderDate(m)!).toLocaleString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </Text>
                  </YStack>
                  <YStack gap={6} alignItems="flex-end">
                    {isOverdue(getReminderDate(m)!) && (
                      <Badge label="overdue" color={theme.destructive.val} small />
                    )}
                  </YStack>
                </XStack>
              </Card>
            </YStack>
          ))
        )}
      </YStack>
    </MorePageScaffold>
  );
}
