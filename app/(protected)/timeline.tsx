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
import { SectionLabel } from "@/components/ui/SectionLabel";
import { PressableScale } from "@/components/ui/PressableScale";
import { SearchBar } from "@/components/ui/SearchBar";
import { Card } from "@/components/ui/Card";

function groupByDate(memories: Array<{ _id: string; title: string; content: string; category: string; mood?: string; _creationTime: number }>) {
  const now = new Date();
  const today = now.toDateString();
  const yesterday = new Date(now.getTime() - 86400000).toDateString();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);

  const groups: Record<string, any[]> = {};

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
            memory.title.toLowerCase().includes(query) ||
            memory.content.toLowerCase().includes(query) ||
            memory.category.toLowerCase().includes(query)
        )
      : allMemories;

    return [...filtered].sort((a, b) => b._creationTime - a._creationTime);
  }, [allMemories, searchQuery]);
  const groups = groupByDate(sorted);
  const webTopPadding = Platform.OS === "web" ? 67 : 0;

  return (
    <YStack flex={1} backgroundColor="$background">
      <XStack
        alignItems="center"
        justifyContent="space-between"
        paddingHorizontal={16}
        paddingBottom={12}
        paddingTop={insets.top + webTopPadding + 12}
      >
        <PressableScale onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={theme.color.val} />
        </PressableScale>
        <Text fontSize={18} fontFamily="$heading" fontWeight="600" color="$color">Timeline</Text>
        <YStack width={22} />
      </XStack>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }} showsVerticalScrollIndicator={false}>
        <Card style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <YStack flex={1} alignItems="center">
            <Text fontSize={24} fontFamily="$heading" fontWeight="700" color="$color">
              {sorted.length}
            </Text>
            <Text fontSize={11} fontFamily="$body" marginTop={4} color="$colorMuted">
              visible
            </Text>
          </YStack>
          <YStack width={1} height={32} backgroundColor="$borderColor" />
          <YStack flex={1} alignItems="center">
            <Text fontSize={24} fontFamily="$heading" fontWeight="700" color="$color">
              {Object.keys(groups).length}
            </Text>
            <Text fontSize={11} fontFamily="$body" marginTop={4} color="$colorMuted">
              sections
            </Text>
          </YStack>
        </Card>

        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search your timeline..."
        />

        {Object.keys(groups).length === 0 ? (
          <EmptyState icon="clock" title="No timeline" description="Create memories to see them on your timeline" />
        ) : (
          Object.entries(groups).map(([label, items], gi) => (
            <Animated.View key={label} entering={FadeInUp.delay(gi * 80).duration(400)}>
              <SectionLabel>{label.toUpperCase()}</SectionLabel>
              <YStack gap={10}>
                {items.map((m, i: number) => (
                  <MemoryCard
                    key={m._id}
                    memory={{
                      ...m,
                      id: m._id,
                      attachments: [],
                      createdAt: new Date(m._creationTime).toISOString(),
                      updatedAt: new Date(m._creationTime).toISOString(),
                    }}
                    index={i}
                  />
                ))}
              </YStack>
            </Animated.View>
          ))
        )}
        <YStack height={40} />
      </ScrollView>
    </YStack>
  );
}
