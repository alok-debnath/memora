import React, { useMemo } from "react";
import { Pressable } from "react-native";
import { XStack, YStack, Text } from "tamagui";

import { Feather } from "@/lib/icons";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useSemanticColors } from "@/hooks/useSemanticColors";
import { SurfaceCard } from "@/components/ui/SurfaceCard";
import { moodLabels, type Mood } from "@/constants/categories";

export type CalendarDaySummary = {
  dayKey: string;
  count: number;
  dominantMood: string | null;
};

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function toDayKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function DiaryCalendar({
  year,
  month,
  summary,
  selectedDayKey,
  onSelectDay,
  onChangeMonth,
}: {
  year: number;
  /** 0-based month, JS Date convention. */
  month: number;
  summary: CalendarDaySummary[] | undefined;
  selectedDayKey: string | null;
  onSelectDay: (dayKey: string | null) => void;
  onChangeMonth: (year: number, month: number) => void;
}) {
  const theme = useAppTheme();
  const semantic = useSemanticColors();

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarDaySummary>();
    for (const day of summary ?? []) map.set(day.dayKey, day);
    return map;
  }, [summary]);

  const weeks = useMemo(() => {
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: Array<number | null> = [
      ...Array.from({ length: firstWeekday }, () => null),
      ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];
    while (cells.length % 7 !== 0) cells.push(null);
    const rows: Array<Array<number | null>> = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [year, month]);

  const monthLabel = new Date(year, month, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  const todayKey = toDayKey(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const isCurrentMonth = new Date().getFullYear() === year && new Date().getMonth() === month;

  const goPrev = () => onChangeMonth(month === 0 ? year - 1 : year, month === 0 ? 11 : month - 1);
  const goNext = () => onChangeMonth(month === 11 ? year + 1 : year, month === 11 ? 0 : month + 1);

  return (
    <SurfaceCard variant="frosted" radius={16} padding={14}>
      <YStack gap={12}>
        <XStack alignItems="center" justifyContent="space-between">
          <Pressable onPress={goPrev} hitSlop={10}>
            <Feather name="chevron-left" size={20} color={theme.colorMuted.val} />
          </Pressable>
          <Text fontSize={15} fontFamily="$heading" fontWeight="700" color={theme.color.val}>
            {monthLabel}
          </Text>
          <Pressable onPress={goNext} hitSlop={10} disabled={isCurrentMonth}>
            <Feather
              name="chevron-right"
              size={20}
              color={isCurrentMonth ? theme.borderColor.val : theme.colorMuted.val}
            />
          </Pressable>
        </XStack>

        <XStack>
          {WEEKDAY_LABELS.map((label, i) => (
            <Text
              key={`${label}-${i}`}
              flex={1}
              textAlign="center"
              fontSize={11}
              fontFamily="$body"
              fontWeight="700"
              color={theme.colorMuted.val}
            >
              {label}
            </Text>
          ))}
        </XStack>

        <YStack gap={6}>
          {weeks.map((week, wi) => (
            <XStack key={wi} gap={0}>
              {week.map((day, di) => {
                if (day === null) return <YStack key={di} flex={1} height={44} />;
                const dayKey = toDayKey(year, month, day);
                const info = byDay.get(dayKey);
                const mood = (info?.dominantMood ?? null) as Mood | null;
                const moodColor = mood ? semantic.mood[mood] : null;
                const isSelected = selectedDayKey === dayKey;
                const isToday = dayKey === todayKey;

                return (
                  <YStack key={di} flex={1} alignItems="center">
                    <Pressable
                      onPress={() => onSelectDay(isSelected ? null : dayKey)}
                      disabled={!info}
                      style={{
                        width: 38,
                        height: 44,
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 12,
                        backgroundColor: isSelected
                          ? theme.primary.val + "1E"
                          : moodColor
                            ? moodColor + "14"
                            : "transparent",
                        borderWidth: isSelected ? 1.5 : isToday ? 1 : 0,
                        borderColor: isSelected
                          ? theme.primary.val
                          : isToday
                            ? theme.colorMuted.val + "60"
                            : "transparent",
                      }}
                    >
                      <Text
                        fontSize={13}
                        fontFamily="$body"
                        fontWeight={info ? "700" : "400"}
                        color={info ? theme.color.val : theme.colorMuted.val + "80"}
                      >
                        {day}
                      </Text>
                      {info ? (
                        <XStack gap={2} marginTop={2} alignItems="center">
                          <YStack
                            width={5}
                            height={5}
                            borderRadius={3}
                            backgroundColor={moodColor ?? theme.primary.val}
                          />
                          {info.count > 1 ? (
                            <Text fontSize={8} fontFamily="$body" color={theme.colorMuted.val}>
                              {info.count}
                            </Text>
                          ) : null}
                        </XStack>
                      ) : null}
                    </Pressable>
                  </YStack>
                );
              })}
            </XStack>
          ))}
        </YStack>

        {selectedDayKey && byDay.get(selectedDayKey)?.dominantMood ? (
          <Text fontSize={12} fontFamily="$body" color={theme.colorMuted.val} textAlign="center">
            Mostly {moodLabels[byDay.get(selectedDayKey)!.dominantMood as Mood]} on this day
          </Text>
        ) : null}
      </YStack>
    </SurfaceCard>
  );
}
