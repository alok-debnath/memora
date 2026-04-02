import React, { useMemo } from "react";
import { ScrollView, Platform } from "react-native";
import { XStack, YStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import Svg, { Rect, Text as SvgText } from "react-native-svg";
import Animated, { FadeInUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/Card";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { PressableScale } from "@/components/ui/PressableScale";
import { Badge } from "@/components/ui/Badge";
import { categoryColors } from "@/constants/colors";
import { categoryLabels, moodLabels } from "@/constants/categories";

export default function StatisticsScreen() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();

  const memoryResult = useQuery(api.memories.list, token ? { token, limit: 100 } : "skip");
  const memories = (memoryResult?.memories ?? []) as Array<{
    _id: Id<"memories">;
    _creationTime: number;
    category: string;
    content: string;
    mood?: string;
  }>;
  const diaryEntries = (useQuery(api.diary.list, token ? { token } : "skip") ?? []) as Array<{
    _id: Id<"diaryEntries">;
  }>;
  const stats = useQuery(api.memories.stats, token ? { token } : "skip");

  const webTopPadding = Platform.OS === "web" ? 67 : 0;

  const last7Days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const ds = d.toDateString();
      const count = memories.filter((m) => new Date(m._creationTime).toDateString() === ds).length;
      return { label: d.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2), count };
    });
  }, [memories]);

  const maxCount = Math.max(...last7Days.map((d) => d.count), 1);
  const barWidth = 28;
  const barGap = 12;
  const chartHeight = 120;
  const chartWidth = (barWidth + barGap) * 7;

  const categoryCounts = useMemo<[string, number][]>(() => {
    return Object.entries(
      memories.reduce<Record<string, number>>((acc, m) => {
        acc[m.category] = (acc[m.category] || 0) + 1;
        return acc;
      }, {})
    ).sort((a, b) => (b[1] as number) - (a[1] as number)) as [string, number][];
  }, [memories]);

  const totalWords = useMemo(
    () => memories.reduce((acc, m) => acc + (m.content || "").split(/\s+/).length, 0),
    [memories]
  );

  const moodCounts = useMemo<[string, number][]>(() => {
    return Object.entries(
      memories.reduce<Record<string, number>>((acc, memory) => {
        if (memory.mood) {
          acc[memory.mood] = (acc[memory.mood] || 0) + 1;
        }
        return acc;
      }, {})
    ).sort((a, b) => b[1] - a[1]);
  }, [memories]);

  const activeDays = useMemo(
    () =>
      Array.from(
        new Set(memories.map((memory) => new Date(memory._creationTime).toISOString().slice(0, 10)))
      ).sort((a, b) => b.localeCompare(a)),
    [memories]
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
    { label: "Total memories", value: stats?.totalMemories ?? memories.length, icon: "layers" as const, color: "#3B82F6" },
    { label: "Categories", value: stats?.categories ?? 0, icon: "zap" as const, color: "#F59E0B" },
    { label: "Words written", value: totalWords, icon: "edit-3" as const, color: "#10B981" },
    { label: "Diary entries", value: diaryEntries.length, icon: "book" as const, color: "#8B5CF6" },
  ];

  return (
    <YStack flex={1} backgroundColor="$background">
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: insets.top + webTopPadding + 12,
          paddingBottom: 28,
          gap: 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInUp.duration(400)}>
          <Card style={{ padding: 18, borderRadius: 24, backgroundColor: theme.card.val }}>
            <XStack alignItems="flex-start" justifyContent="space-between" gap={12}>
              <YStack flex={1} gap={6}>
                <Badge label="Analytics" color={theme.primary.val} />
                <Text fontSize={28} lineHeight={32} fontFamily="$heading" fontWeight="700" color="$color">
                  Statistics
                </Text>
                <Text fontSize={14} lineHeight={20} fontFamily="$body" color="$colorMuted">
                  A compact view of rhythm, themes, and the amount of writing you are generating.
                </Text>
              </YStack>
              <PressableScale onPress={() => router.back()} hitSlop={8}>
                <YStack
                  width={42}
                  height={42}
                  borderRadius={14}
                  alignItems="center"
                  justifyContent="center"
                  backgroundColor={theme.secondary.val}
                  borderWidth={1}
                  borderColor={theme.borderColor.val}
                >
                  <Feather name="arrow-left" size={20} color={theme.color.val} />
                </YStack>
              </PressableScale>
            </XStack>
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
          <SectionLabel>Category breakdown</SectionLabel>
          <Card>
            {categoryCounts.length === 0 ? (
              <Text fontSize={14} fontFamily="$body" textAlign="center" paddingVertical={16} color="$colorMuted">
                No data yet
              </Text>
            ) : (
              categoryCounts.map(([cat, count]) => {
                const pct = (count / memories.length) * 100;
                return (
                  <XStack key={cat} alignItems="center" gap={10} paddingVertical={6}>
                    <YStack width={10} height={10} borderRadius={5} backgroundColor={categoryColors[cat] || theme.primary.val} />
                    <Text fontSize={13} fontFamily="$body" fontWeight="500" width={70} color="$color">
                      {categoryLabels[cat as keyof typeof categoryLabels] || cat}
                    </Text>
                    <YStack flex={1} height={8} borderRadius={4} backgroundColor="$borderColor" overflow="hidden">
                      <YStack height="100%" borderRadius={4} width={`${pct}%`} backgroundColor={categoryColors[cat] || theme.primary.val} />
                    </YStack>
                    <Text fontSize={12} fontFamily="$body" fontWeight="500" width={24} textAlign="right" color="$colorMuted">
                      {count}
                    </Text>
                  </XStack>
                );
              })
            )}
          </Card>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(340).duration(400)}>
          <SectionLabel>Mood tracker</SectionLabel>
          <Card>
            {moodCounts.length === 0 ? (
              <Text fontSize={14} fontFamily="$body" textAlign="center" paddingVertical={16} color="$colorMuted">
                No mood data yet
              </Text>
            ) : (
              moodCounts.map(([mood, count]) => {
                const pct = (count / memories.length) * 100;
                return (
                  <XStack key={mood} alignItems="center" gap={10} paddingVertical={6}>
                    <Text fontSize={13} fontFamily="$body" fontWeight="500" width={70} color="$color">
                      {moodLabels[mood as keyof typeof moodLabels] || mood}
                    </Text>
                    <YStack flex={1} height={8} borderRadius={4} backgroundColor="$borderColor" overflow="hidden">
                      <YStack height="100%" borderRadius={4} width={`${pct}%`} backgroundColor="$primary" />
                    </YStack>
                    <Text fontSize={12} fontFamily="$body" fontWeight="500" width={24} textAlign="right" color="$colorMuted">
                      {count}
                    </Text>
                  </XStack>
                );
              })
            )}
          </Card>
        </Animated.View>
      </ScrollView>
    </YStack>
  );
}
