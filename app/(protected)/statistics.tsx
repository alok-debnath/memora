import React, { useMemo } from "react";
import { XStack, YStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import { Feather } from "@expo/vector-icons";
import Svg, { Rect, Text as SvgText } from "react-native-svg";
import Animated, { FadeInUp } from "react-native-reanimated";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/Card";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Badge } from "@/components/ui/Badge";
import { MorePageScaffold } from "@/components/ui/MorePageScaffold";
import { isReminder } from "@/types/memoryKind";

export default function StatisticsScreen() {
  const theme = useAppTheme();
  const { token } = useAuth();

  const memoryResult = useQuery(api.memories.list, token ? { token, limit: 100 } : "skip");
  const memories = (memoryResult?.memories ?? []) as Array<{
    _id: Id<"memories">;
    _creationTime: number;
    content: string;
    entryKind?: "memory" | "reminder";
    schedule?: {
      dueAt: string;
      isRecurring: boolean;
      recurrenceType?: "daily" | "weekly" | "monthly" | "yearly";
    };
  }>;
  const diaryEntries = (useQuery(api.diary.list, token ? { token } : "skip") ?? []) as Array<{
    _id: Id<"diaryEntries">;
  }>;
  const stats = useQuery(api.memories.stats, token ? { token } : "skip");
  const topics = useQuery(api.userTopics.list, token ? { token } : "skip") ?? [];

  const memoryOnly = useMemo(() => memories.filter((memory) => !isReminder(memory)), [memories]);

  const last7Days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const ds = d.toDateString();
      const count = memoryOnly.filter((m) => new Date(m._creationTime).toDateString() === ds).length;
      return { label: d.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2), count };
    });
  }, [memoryOnly]);

  const maxCount = Math.max(...last7Days.map((d) => d.count), 1);
  const barWidth = 28;
  const barGap = 12;
  const chartHeight = 120;
  const chartWidth = (barWidth + barGap) * 7;

  const totalWords = useMemo(
    () => memoryOnly.reduce((acc, m) => acc + (m.content || "").split(/\s+/).length, 0),
    [memoryOnly]
  );

  const activeDays = useMemo(
    () =>
      Array.from(
        new Set(memoryOnly.map((memory) => new Date(memory._creationTime).toISOString().slice(0, 10)))
      ).sort((a, b) => b.localeCompare(a)),
    [memoryOnly]
  );

  const streakDays = useMemo(() => {
    let streak = 0;
    const cursorDate = new Date();
    cursorDate.setHours(0, 0, 0, 0);
    for (const activeDay of activeDays) {
      const expectedDay = cursorDate.toISOString().slice(0, 10);
      if (activeDay !== expectedDay) break;
      streak += 1;
      cursorDate.setDate(cursorDate.getDate() - 1);
    }
    return streak;
  }, [activeDays]);

  const statCards = [
    { label: "Total memories", value: stats?.totalMemories ?? memoryOnly.length, icon: "layers" as const, color: "#3B82F6" },
    { label: "Topics", value: topics.length, icon: "zap" as const, color: "#F59E0B" },
    { label: "Words written", value: totalWords, icon: "edit-3" as const, color: "#10B981" },
    { label: "Diary entries", value: diaryEntries.length, icon: "book" as const, color: "#8B5CF6" },
  ];

  return (
    <MorePageScaffold
      title="Statistics"
      scrollProps={{ contentContainerStyle: { gap: 20 } }}
    >
        <Animated.View entering={FadeInUp.duration(400)}>
          <Card style={{ padding: 18, borderRadius: 24, backgroundColor: theme.card.val }}>
            <YStack flex={1} gap={6}>
              <Badge label="Analytics" color={theme.primary.val} />
              <Text fontSize={28} lineHeight={32} fontFamily="$heading" fontWeight="700" color="$color">
                Statistics
              </Text>
              <Text fontSize={14} lineHeight={20} fontFamily="$body" color="$colorMuted">
                A compact view of rhythm, themes, and the amount of writing you are generating.
              </Text>
            </YStack>
            <XStack gap={10} marginTop={16} flexWrap="wrap">
              <Badge label={`${streakDays} day streak`} color={theme.primary.val} />
              <Badge label={`${activeDays.length} active days`} />
            </XStack>
          </Card>
        </Animated.View>

        <XStack flexWrap="wrap" gap={10}>
          {statCards.map((s, i) => (
            <Animated.View key={s.label} entering={FadeInUp.delay(i * 60).duration(400)} style={{ flex: 1, minWidth: "46%" }}>
              <Card style={{ alignItems: "center", paddingVertical: 14, borderRadius: 20 }}>
                <Feather name={s.icon} size={18} color={s.color} />
                <Text fontSize={22} fontFamily="$heading" fontWeight="700" marginTop={6} color="$color">
                  {s.value}
                </Text>
                <Text fontSize={10} fontFamily="$body" fontWeight="600" marginTop={2} textAlign="center" color="$colorMuted">
                  {s.label}
                </Text>
              </Card>
            </Animated.View>
          ))}
        </XStack>

        <Animated.View entering={FadeInUp.delay(160).duration(400)}>
          <SectionLabel>Consistency</SectionLabel>
          <Card style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <YStack flex={1} alignItems="center" paddingVertical={6}>
              <Text fontSize={26} fontFamily="$heading" fontWeight="700" color="$color">
                {streakDays}
              </Text>
              <Text fontSize={12} fontFamily="$body" marginTop={4} color="$colorMuted">
                day streak
              </Text>
            </YStack>
            <YStack width={1} height={42} backgroundColor="$borderColor" />
            <YStack flex={1} alignItems="center" paddingVertical={6}>
              <Text fontSize={26} fontFamily="$heading" fontWeight="700" color="$color">
                {activeDays.length}
              </Text>
              <Text fontSize={12} fontFamily="$body" marginTop={4} color="$colorMuted">
                active days
              </Text>
            </YStack>
          </Card>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(220).duration(400)}>
          <SectionLabel>Weekly activity</SectionLabel>
          <Card>
            <Svg width={chartWidth} height={chartHeight + 30} style={{ alignSelf: "center" }}>
              {last7Days.map((d, i) => {
                const barH = (d.count / maxCount) * chartHeight;
                const x = i * (barWidth + barGap) + barGap / 2;
                return (
                  <React.Fragment key={i}>
                    <Rect
                      x={x}
                      y={chartHeight - barH}
                      width={barWidth}
                      height={Math.max(barH, 2)}
                      rx={6}
                      fill={d.count > 0 ? theme.primary.val : theme.borderColor.val}
                      opacity={d.count > 0 ? 0.8 : 0.3}
                    />
                    <SvgText x={x + barWidth / 2} y={chartHeight + 18} fontSize={11} fill={theme.colorMuted.val} textAnchor="middle">
                      {d.label}
                    </SvgText>
                    {d.count > 0 && (
                      <SvgText x={x + barWidth / 2} y={chartHeight - barH - 6} fontSize={10} fill={theme.color.val} textAnchor="middle" fontWeight="600">
                        {d.count}
                      </SvgText>
                    )}
                  </React.Fragment>
                );
              })}
            </Svg>
          </Card>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(280).duration(400)}>
          <SectionLabel>Topic breakdown</SectionLabel>
          <Card>
            {topics.length === 0 ? (
              <Text fontSize={14} fontFamily="$body" textAlign="center" paddingVertical={16} color="$colorMuted">
                No topics yet — memories are being analyzed
              </Text>
            ) : (
              (topics as Array<{ _id: string; name: string; color?: string | null; memoryCount: number }>)
                .slice()
                .sort((a, b) => b.memoryCount - a.memoryCount)
                .map((topic) => {
                  const total = Math.max(memoryOnly.length, 1);
                  const pct = (topic.memoryCount / total) * 100;
                  const color = topic.color || theme.primary.val;
                  return (
                    <XStack key={topic._id} alignItems="center" gap={10} paddingVertical={6}>
                      <YStack width={10} height={10} borderRadius={5} backgroundColor={color} />
                      <Text fontSize={13} fontFamily="$body" fontWeight="500" flex={1} numberOfLines={1} color="$color">
                        {topic.name}
                      </Text>
                      <YStack width={80} height={8} borderRadius={4} backgroundColor="$borderColor" overflow="hidden">
                        <YStack height="100%" borderRadius={4} width={`${pct}%`} backgroundColor={color} />
                      </YStack>
                      <Text fontSize={12} fontFamily="$body" fontWeight="500" width={24} textAlign="right" color="$colorMuted">
                        {topic.memoryCount}
                      </Text>
                    </XStack>
                  );
                })
            )}
          </Card>
        </Animated.View>

    </MorePageScaffold>
  );
}
