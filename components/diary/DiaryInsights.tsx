import React from "react";
import { XStack, YStack, Text } from "tamagui";

import { Feather } from "@/lib/icons";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useSemanticColors } from "@/hooks/useSemanticColors";
import { SurfaceCard } from "@/components/ui/SurfaceCard";
import { StatStrip } from "@/components/ui/StatStrip";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { moodIcons, moodLabels, type Mood } from "@/constants/categories";

export type DiaryInsightsData = {
  totalInRange: number;
  truncated: boolean;
  moodDistribution: Array<{ mood: string; count: number }>;
  energyDistribution: Array<{ level: string; count: number }>;
  moodTimeline: Array<{ dayKey: string; mood: string | null }>;
  topTopics: Array<{ topic: string; count: number }>;
  habitSentiment: Array<{ habit: string; positive: number; negative: number; neutral: number }>;
  recentActionItems: string[];
  activeDays: number;
  currentStreakDays: number;
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useAppTheme();
  return (
    <SurfaceCard variant="frosted" radius={16} padding={14}>
      <YStack gap={12}>
        <Text fontSize={14} fontFamily="$heading" fontWeight="700" color={theme.color.val}>
          {title}
        </Text>
        {children}
      </YStack>
    </SurfaceCard>
  );
}

function DistributionBar({
  rows,
}: {
  rows: Array<{ key: string; label: string; count: number; color: string; icon?: string }>;
}) {
  const theme = useAppTheme();
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  if (total === 0) return null;

  return (
    <YStack gap={10}>
      <XStack height={10} borderRadius={5} overflow="hidden" backgroundColor={theme.secondary.val}>
        {rows.map((row) => (
          <YStack
            key={row.key}
            backgroundColor={row.color}
            style={{ flexGrow: row.count, flexBasis: 0 }}
          />
        ))}
      </XStack>
      <XStack flexWrap="wrap" gap={8}>
        {rows.map((row) => (
          <XStack key={row.key} alignItems="center" gap={5}>
            <YStack width={8} height={8} borderRadius={4} backgroundColor={row.color} />
            <Text fontSize={11} fontFamily="$body" color={theme.colorMuted.val}>
              {row.label} · {Math.round((row.count / total) * 100)}%
            </Text>
          </XStack>
        ))}
      </XStack>
    </YStack>
  );
}

export function DiaryInsights({ data }: { data: DiaryInsightsData | undefined }) {
  const theme = useAppTheme();
  const semantic = useSemanticColors();

  if (!data) return null;

  if (data.totalInRange === 0) {
    return (
      <EmptyState
        icon="bar-chart-2"
        title="No entries in this range"
        description="Write a few entries and Memora will chart your moods, topics, and habits here."
      />
    );
  }

  const moodRows = data.moodDistribution.map((row) => ({
    key: row.mood,
    label: moodLabels[row.mood as Mood] ?? row.mood,
    count: row.count,
    color: semantic.mood[row.mood as Mood] ?? theme.primary.val,
  }));

  const energyColor: Record<string, string> = {
    high: semantic.status.success,
    medium: semantic.status.warning,
    low: semantic.status.error,
  };
  const energyRows = data.energyDistribution.map((row) => ({
    key: row.level,
    label: `${row.level[0].toUpperCase()}${row.level.slice(1)} energy`,
    count: row.count,
    color: energyColor[row.level] ?? theme.primary.val,
  }));

  return (
    <YStack gap={14}>
      <StatStrip
        items={[
          { label: "Entries", value: data.totalInRange },
          { label: "Active days", value: data.activeDays },
          {
            label: "Streak",
            value: `${data.currentStreakDays}d`,
            color: data.currentStreakDays > 0 ? semantic.status.success : undefined,
          },
        ]}
      />

      {moodRows.length > 0 ? (
        <Section title="Mood mix">
          <DistributionBar rows={moodRows} />
        </Section>
      ) : null}

      {data.moodTimeline.length > 1 ? (
        <Section title="Mood by day">
          <XStack flexWrap="wrap" gap={6}>
            {data.moodTimeline.slice(-28).map((point) => {
              const mood = point.mood as Mood | null;
              const color = mood ? semantic.mood[mood] : theme.borderColor.val;
              return (
                <YStack key={point.dayKey} alignItems="center" gap={3} width={34}>
                  <YStack
                    width={26}
                    height={26}
                    borderRadius={13}
                    alignItems="center"
                    justifyContent="center"
                    backgroundColor={color + "1E"}
                    borderWidth={1}
                    borderColor={color + "50"}
                  >
                    <Feather
                      name={mood ? moodIcons[mood] : "minus"}
                      size={12}
                      color={mood ? color : theme.colorMuted.val}
                    />
                  </YStack>
                  <Text fontSize={8} fontFamily="$body" color={theme.colorMuted.val}>
                    {point.dayKey.slice(5).replace("-", "/")}
                  </Text>
                </YStack>
              );
            })}
          </XStack>
        </Section>
      ) : null}

      {energyRows.length > 0 ? (
        <Section title="Energy">
          <DistributionBar rows={energyRows} />
        </Section>
      ) : null}

      {data.topTopics.length > 0 ? (
        <Section title="Top topics">
          <XStack flexWrap="wrap" gap={8}>
            {data.topTopics.map((topic) => (
              <Badge key={topic.topic} label={`${topic.topic} · ${topic.count}`} small />
            ))}
          </XStack>
        </Section>
      ) : null}

      {data.habitSentiment.length > 0 ? (
        <Section title="Habits">
          <YStack gap={10}>
            {data.habitSentiment.map((habit) => {
              const total = habit.positive + habit.negative + habit.neutral;
              const leaning =
                habit.positive >= habit.negative && habit.positive >= habit.neutral
                  ? { color: semantic.status.success, icon: "trending-up" as const }
                  : habit.negative >= habit.positive && habit.negative >= habit.neutral
                    ? { color: semantic.status.error, icon: "trending-down" as const }
                    : { color: semantic.status.info, icon: "minus" as const };
              return (
                <XStack
                  key={habit.habit}
                  alignItems="center"
                  justifyContent="space-between"
                  gap={8}
                >
                  <XStack alignItems="center" gap={8} flexShrink={1}>
                    <Feather name={leaning.icon} size={14} color={leaning.color} />
                    <Text
                      fontSize={13}
                      fontFamily="$body"
                      color={theme.color.val}
                      numberOfLines={1}
                      flexShrink={1}
                    >
                      {habit.habit}
                    </Text>
                  </XStack>
                  <Text fontSize={11} fontFamily="$body" color={theme.colorMuted.val}>
                    ×{total}
                  </Text>
                </XStack>
              );
            })}
          </YStack>
        </Section>
      ) : null}

      {data.recentActionItems.length > 0 ? (
        <Section title="Action items">
          <YStack gap={8}>
            {data.recentActionItems.map((item) => (
              <XStack key={item} alignItems="flex-start" gap={8}>
                <Feather name="check-circle" size={13} color={theme.primary.val} />
                <Text
                  flex={1}
                  fontSize={13}
                  fontFamily="$body"
                  lineHeight={18}
                  color={theme.color.val}
                >
                  {item}
                </Text>
              </XStack>
            ))}
          </YStack>
        </Section>
      ) : null}

      {data.truncated ? (
        <Text fontSize={11} fontFamily="$body" color={theme.colorMuted.val} textAlign="center">
          Based on the most recent {data.totalInRange} entries in this range.
        </Text>
      ) : null}
    </YStack>
  );
}
