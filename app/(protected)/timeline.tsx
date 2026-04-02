import React, { useMemo, useState } from "react";
import { ScrollView, Platform } from "react-native";
import { XStack, YStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import Animated, { FadeInUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { MemoryCard } from "@/components/MemoryCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { PressableScale } from "@/components/ui/PressableScale";
import { SearchBar } from "@/components/ui/SearchBar";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { MemoryNote } from "@/types/memory";

function groupByDate(
  memories: Array<{
    _id: string;
    title: string;
    content: string;
    category: string;
    mood?: string;
    _creationTime: number;
  }>
) {
  const now = new Date();
  const today = now.toDateString();
  const yesterday = new Date(now.getTime() - 86400000).toDateString();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);

  const groups: Record<string, typeof memories> = {};

  memories.forEach((m) => {
    const d = new Date(m._creationTime);
    const ds = d.toDateString();
    let label: string;
    if (ds === today) label = "Today";
    else if (ds === yesterday) label = "Yesterday";
    else if (d >= weekAgo) label = "This Week";
    else label = d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    if (!groups[label]) groups[label] = [];
    groups[label].push(m);
  });

  return groups;
}

export default function TimelineScreen() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");

  const memoryResult = useQuery(api.memories.list, token ? { token, limit: 100 } : "skip");
  const allMemories = memoryResult?.memories ?? [];

  const sorted = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = query
      ? allMemories.filter(
          (memory) =>
            (memory.title ?? "").toLowerCase().includes(query) ||
            (memory.content ?? "").toLowerCase().includes(query) ||
            memory.category.toLowerCase().includes(query)
        )
      : allMemories;

    return [...filtered].sort((a, b) => b._creationTime - a._creationTime);
  }, [allMemories, searchQuery]);

  const groups = useMemo(() => groupByDate(sorted as any), [sorted]);
  const sectionCount = Object.keys(groups).length;
  const webTopPadding = Platform.OS === "web" ? 67 : 0;

  return (
    <YStack flex={1} backgroundColor="$background">
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: insets.top + webTopPadding + 12,
          paddingBottom: 28,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInUp.duration(400)}>
          <Card style={{ padding: 18, borderRadius: 24, backgroundColor: theme.card.val, marginBottom: 14 }}>
            <XStack alignItems="flex-start" justifyContent="space-between" gap={12}>
              <YStack flex={1} gap={6}>
                <Badge label="Chronological" color={theme.primary.val} />
                <Text fontSize={28} lineHeight={32} fontFamily="$heading" fontWeight="700" color="$color">
                  Timeline
                </Text>
                <Text fontSize={14} lineHeight={20} fontFamily="$body" color="$colorMuted">
                  Review memories in time order, or narrow the story with a search.
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
            <XStack gap={10} marginTop={16}>
              <Card style={{ flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 18 }}>
                <Text fontSize={22} fontFamily="$heading" fontWeight="700" color="$color">
                  {sorted.length}
                </Text>
                <Text fontSize={11} fontFamily="$body" marginTop={4} color="$colorMuted">
                  visible
                </Text>
              </Card>
              <Card style={{ flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 18 }}>
                <Text fontSize={22} fontFamily="$heading" fontWeight="700" color="$color">
                  {sectionCount}
                </Text>
                <Text fontSize={11} fontFamily="$body" marginTop={4} color="$colorMuted">
                  sections
                </Text>
              </Card>
            </XStack>
          </Card>
        </Animated.View>

        <SearchBar value={searchQuery} onChangeText={setSearchQuery} placeholder="Search your timeline..." />

        {sectionCount === 0 ? (
          <EmptyState icon="clock" title="No timeline" description="Create memories to see them on your timeline." />
        ) : (
          Object.entries(groups).map(([label, items], gi) => (
            <Animated.View key={label} entering={FadeInUp.delay(gi * 80).duration(400)}>
              <Text
                color="$colorMuted"
                fontSize={11}
                fontFamily="$body"
                fontWeight="600"
                textTransform="uppercase"
                letterSpacing={1.2}
                marginTop={16}
                marginBottom={10}
                marginLeft={4}
              >
                {label}
              </Text>
              <YStack gap={10}>
                {items.map((m, i: number) => (
                  <MemoryCard
                    key={m._id}
                    memory={{
                      ...m,
                      id: m._id,
                      userId: "" as never,
                      tags: [],
                      people: [],
                      locations: [],
                      importance: "normal" as const,
                      isRecurring: false,
                      linkedUrls: [],
                      extractedActions: [],
                      attachments: [],
                      createdAt: new Date(m._creationTime).toISOString(),
                      updatedAt: new Date(m._creationTime).toISOString(),
                    } as MemoryNote}
                    index={i}
                  />
                ))}
              </YStack>
            </Animated.View>
          ))
        )}
      </ScrollView>
    </YStack>
  );
}
