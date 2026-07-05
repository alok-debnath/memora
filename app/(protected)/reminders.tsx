import React, { useMemo, useState } from "react";
import { ScrollView, Pressable } from "react-native";
import { XStack, YStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import { Feather } from "@/lib/icons";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { AppScreen } from "@/components/ui/AppScreen";
import { radius } from "@/constants/uiTokens";
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
  return (
    <AppScreen showBack title="Reminders">
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
                color={active ? theme.primary.val : theme.colorMuted.val}
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
                    color={active ? theme.textInverse.val : theme.color.val}
                  >
                    {count}
                  </Text>
                </YStack>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      <YStack>
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
          <Card style={{ padding: 0, borderRadius: radius.md, overflow: "hidden" }}>
            {filtered.map((m, i) => {
              const overdue = isOverdue(getReminderDate(m)!);
              const isLast = i === filtered.length - 1;
              return (
                <XStack
                  key={m._id}
                  alignItems="center"
                  gap={12}
                  paddingHorizontal={14}
                  paddingVertical={12}
                  borderBottomWidth={isLast ? 0 : 1}
                  borderBottomColor={theme.borderSubtle.val}
                >
                  <YStack
                    width={32}
                    height={32}
                    borderRadius={9}
                    alignItems="center"
                    justifyContent="center"
                    backgroundColor={overdue ? theme.destructive.val : theme.primary.val}
                  >
                    <Feather name="bell" size={16} color={theme.textInverse.val} />
                  </YStack>
                  <YStack flex={1} minWidth={0}>
                    <Text
                      fontSize={15}
                      fontFamily="$body"
                      fontWeight="600"
                      color={theme.color.val}
                      numberOfLines={1}
                    >
                      {m.title}
                    </Text>
                    <Text
                      fontSize={12}
                      fontFamily="$body"
                      marginTop={2}
                      color={theme.colorMuted.val}
                    >
                      {new Date(getReminderDate(m)!).toLocaleString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </Text>
                  </YStack>
                  {overdue && <Badge label="overdue" color={theme.destructive.val} small />}
                </XStack>
              );
            })}
          </Card>
        )}
      </YStack>
    </AppScreen>
  );
}
