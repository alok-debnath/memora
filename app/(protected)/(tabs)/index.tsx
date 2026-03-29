import React, { useState, useMemo, useCallback } from "react";
import {
  ScrollView,
  Platform,
  Alert,
  ActivityIndicator,
  Share,
  Pressable,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInUp, FadeIn, FadeInRight } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useAction } from "convex/react";
import * as Clipboard from "expo-clipboard";
import { api } from "@/convex/_generated/api";
import { useThemeStore } from "@/store/theme";
import { useAuth } from "@/hooks/useAuth";
import { useAppTheme } from "@/hooks/useAppTheme";
import { MemoryCard } from "@/components/MemoryCard";
import { SearchBar } from "@/components/ui/SearchBar";
import { CategoryPills } from "@/components/ui/CategoryPills";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { EditMemorySheet } from "@/components/EditMemorySheet";
import { PressableScale } from "@/components/ui/PressableScale";
import { StatCard } from "@/components/ui/StatCard";
import { XStack, YStack, Text } from "tamagui";
import type { MemoryNote } from "@/types/memory";
import type { Id } from "@/convex/_generated/dataModel";

function toMemoryNote(m: Record<string, unknown>): MemoryNote {
  return {
    id: m._id as string,
    userId: (m.userId as string) || "",
    title: (m.title as string) || "",
    content: (m.content as string) || "",
    category: (m.category || "personal") as MemoryNote["category"],
    mood: m.mood as MemoryNote["mood"],
    tags: (m.tags as string[]) || [],
    people: (m.people as string[]) || [],
    locations: (m.locations as string[]) || [],
    importance: (m.importance || "normal") as MemoryNote["importance"],
    lifeArea: m.lifeArea as MemoryNote["lifeArea"],
    contextTags: m.contextTags as Record<string, string> | undefined,
    sentimentScore: m.sentimentScore as number | undefined,
    linkedUrls: Array.isArray(m.linkedUrls) ? m.linkedUrls : [],
    extractedActions: m.extractedActions as MemoryNote["extractedActions"],
    reminderDate: m.reminderDate as string | undefined,
    isRecurring: (m.isRecurring as boolean) ?? false,
    recurrenceType: m.recurrenceType as MemoryNote["recurrenceType"],
    capsuleUnlockDate: m.capsuleUnlockDate as string | undefined,
    attachments: [],
    isPublic: m.isPublic as boolean | undefined,
    createdAt: new Date(m._creationTime as number).toISOString(),
    updatedAt: new Date(m._creationTime as number).toISOString(),
  };
}

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

type MemoryItem = {
  _id: Id<"memories">;
  _creationTime: number;
  userId: Id<"users">;
  title: string;
  content: string;
  category: string;
  mood?: string;
  tags: string[];
  people: string[];
  locations: string[];
  importance: string;
  reminderDate?: string;
  isRecurring: boolean;
  shareToken?: string;
  isPublic?: boolean;
  [key: string]: unknown;
};

export default function HomeScreen() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const { resolvedMode, setMode } = useThemeStore();

  const [pageSize, setPageSize] = useState(20);
  const memoryResult = useQuery(api.memories.list, token ? { token, limit: pageSize } : "skip");
  const allMemories = (memoryResult?.memories ?? []) as MemoryItem[];
  const canLoadMore = memoryResult ? !memoryResult.isDone : false;

  const flashbacks = useQuery(api.memories.flashbacks, token ? { token } : "skip") ?? [];
  const reminderMemories = useQuery(api.memories.reminders, token ? { token } : "skip") ?? [];
  const stats = useQuery(api.memories.stats, token ? { token } : "skip");
  const semanticSearch = useAction(api.actions.semanticSearch.search);

  const deleteMemory = useMutation(api.memories.remove);
  const updateMemory = useMutation(api.memories.update);
  const addToReview = useMutation(api.review.addToReview);
  const createShareLink = useMutation(api.sharing.createShareLink);

  const [editMemory, setEditMemory] = useState<MemoryItem | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<MemoryItem[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const debouncedQuery = useDebounce(searchQuery, 400);

  React.useEffect(() => {
    if (debouncedQuery.trim().length < 2 || !token) {
      setSearchResults(null);
      return;
    }
    setIsSearching(true);
    semanticSearch({ token, query: debouncedQuery, limit: 15 })
      .then((results) => setSearchResults(results))
      .catch(() => setSearchResults(null))
      .finally(() => setIsSearching(false));
  }, [debouncedQuery, token, semanticSearch]);

  React.useEffect(() => {
    if (memoryResult) {
      setIsLoadingMore(false);
    }
  }, [memoryResult]);

  const handleLoadMore = useCallback(() => {
    if (!canLoadMore || isLoadingMore) return;
    setIsLoadingMore(true);
    setPageSize((prev) => prev + 20);
  }, [canLoadMore, isLoadingMore]);

  const memories = useMemo(() => {
    let filtered = searchResults ? [...searchResults] : [...allMemories];
    if (searchResults) {
      filtered.sort((a, b) => b._creationTime - a._creationTime);
    }
    if (selectedCategory) {
      filtered = filtered.filter((m) => m.category === selectedCategory);
    }
    return filtered;
  }, [allMemories, searchResults, selectedCategory]);

  const handleDelete = async (id: Id<"memories">) => {
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    if (Platform.OS === "web") {
      if (window.confirm("Delete this memory?")) {
        await deleteMemory({ token: token!, id });
      }
    } else {
      Alert.alert("Delete", "Delete this memory?", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => deleteMemory({ token: token!, id }) },
      ]);
    }
  };

  const handleSaveEdit = async (data: Record<string, unknown>) => {
    if (editMemory) {
      await updateMemory({ token: token!, id: editMemory._id, ...data });
      setEditMemory(null);
    }
  };

  const handleShare = async (id: Id<"memories">) => {
    if (!token) return;
    try {
      const shareToken = await createShareLink({ token, memoryId: id });
      const base =
        typeof window !== "undefined" && window.location?.origin
          ? window.location.origin
          : "";
      const shareUrl = base ? `${base}/shared/${shareToken}` : `/shared/${shareToken}`;

      if (Platform.OS === "web") {
        await Clipboard.setStringAsync(shareUrl);
        window.alert("Share link copied to clipboard.");
      } else {
        await Share.share({
          message: `View this memory in Memora: ${shareUrl}`,
          url: shareUrl,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create share link.";
      if (Platform.OS === "web") {
        window.alert(message);
      } else {
        Alert.alert("Share failed", message);
      }
    }
  };

  const firstName = user?.name?.split(" ")[0] || "there";
  const webTopPadding = Platform.OS === "web" ? 67 : 0;
  const isLoading = !memoryResult;
  const totalMemories = stats?.totalMemories ?? 0;
  const totalReminders = stats?.totalReminders ?? 0;
  const totalCategories = stats?.categories ?? 0;

  const toggleTheme = () => {
    setMode(resolvedMode === "dark" ? "light" : "dark");
  };

  return (
    <YStack flex={1} backgroundColor="$background">
      <ScrollView
        contentContainerStyle={{ paddingBottom: 20, paddingTop: insets.top + webTopPadding + 8 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Animated.View entering={FadeInUp.duration(500)}>
          <XStack
            alignItems="flex-start"
            justifyContent="space-between"
            paddingHorizontal={20}
            marginBottom={16}
          >
            <YStack flex={1}>
              <Text fontSize={28} fontFamily="$body" fontWeight="700" color="$color">
                Hey, {firstName} 👋
              </Text>
              <Text fontSize={13} fontFamily="$body" color="$colorMuted" marginTop={3}>
                {totalMemories} {totalMemories === 1 ? "memory" : "memories"} · {totalReminders} upcoming
              </Text>
            </YStack>
            <XStack gap={14} paddingTop={4}>
              <Pressable hitSlop={8}>
                <Feather name="info" size={20} color={theme.colorMuted.val} />
              </Pressable>
              <Pressable onPress={toggleTheme} hitSlop={8}>
                <Feather
                  name={resolvedMode === "dark" ? "sun" : "moon"}
                  size={20}
                  color={theme.colorMuted.val}
                />
              </Pressable>
            </XStack>
          </XStack>

          {/* Stat Cards */}
          <XStack gap={10} paddingHorizontal={20} marginBottom={20}>
            <StatCard emoji="🧠" count={totalMemories} label="Memories" />
            <StatCard emoji="⏰" count={totalReminders} label="Reminders" />
            <StatCard emoji="📁" count={totalCategories} label="Categories" />
          </XStack>
        </Animated.View>

        {/* Search */}
        <Animated.View entering={FadeInUp.delay(100).duration(400)} style={{ paddingHorizontal: 16, marginBottom: 16 }}>
          <SearchBar
            value={searchQuery}
            onChangeText={setSearchQuery}
            isSearching={isSearching}
          />
        </Animated.View>

        {/* Category Filter */}
        <Animated.View entering={FadeInUp.delay(150).duration(400)}>
          <CategoryPills
            selected={selectedCategory}
            onSelect={setSelectedCategory}
            categoryCounts={stats?.categoryCounts ?? {}}
          />
        </Animated.View>

        {/* On This Day */}
        {flashbacks.length > 0 && (
          <Animated.View entering={FadeIn.delay(200).duration(400)} style={{ marginTop: 24 }}>
            <XStack alignItems="center" gap={8} paddingHorizontal={20} marginBottom={14}>
              <YStack
                width={28}
                height={28}
                borderRadius={8}
                backgroundColor={theme.primary.val + "15"}
                alignItems="center"
                justifyContent="center"
              >
                <Feather name="clock" size={14} color={theme.primary.val} />
              </YStack>
              <Text fontSize={16} fontFamily="$body" fontWeight="600" color="$color" flex={1}>
                On This Day
              </Text>
            </XStack>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
            >
              {flashbacks.map((memory, i: number) => (
                <Animated.View key={memory._id} entering={FadeInRight.delay(i * 80).duration(300)}>
                  <PressableScale onPress={() => setEditMemory(memory)}>
                    <YStack
                      width={240}
                      padding={16}
                      borderRadius={16}
                      borderWidth={1}
                      gap={6}
                      backgroundColor="$card"
                      borderColor="$borderColor"
                    >
                      <Text fontSize={15} fontFamily="$body" fontWeight="600" color="$color" numberOfLines={1}>
                        {memory.title}
                      </Text>
                      <Text fontSize={13} fontFamily="$body" lineHeight={18} color="$colorMuted" numberOfLines={2}>
                        {memory.content}
                      </Text>
                      <Text fontSize={12} fontFamily="$body" fontWeight="500" color="$primary" marginTop={4}>
                        {new Date(memory._creationTime).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </Text>
                    </YStack>
                  </PressableScale>
                </Animated.View>
              ))}
            </ScrollView>
          </Animated.View>
        )}

        {/* Reminders Due */}
        {reminderMemories.length > 0 && (
          <Animated.View entering={FadeIn.delay(250).duration(400)} style={{ marginTop: 24 }}>
            <XStack alignItems="center" gap={8} paddingHorizontal={20} marginBottom={14}>
              <YStack
                width={28}
                height={28}
                borderRadius={8}
                backgroundColor="#F59E0B15"
                alignItems="center"
                justifyContent="center"
              >
                <Feather name="bell" size={14} color="#F59E0B" />
              </YStack>
              <Text fontSize={16} fontFamily="$body" fontWeight="600" color="$color" flex={1}>
                Reminders Due
              </Text>
              <YStack paddingHorizontal={8} paddingVertical={2} borderRadius={10} backgroundColor="#F59E0B20">
                <Text fontSize={12} fontFamily="$body" fontWeight="600" color="#F59E0B">
                  {reminderMemories.length}
                </Text>
              </YStack>
            </XStack>
            <YStack paddingHorizontal={20} gap={8}>
              {reminderMemories.slice(0, 3).map((memory, i: number) => (
                <Animated.View key={memory._id} entering={FadeIn.delay(i * 60).duration(300)}>
                  <PressableScale onPress={() => setEditMemory(memory)}>
                    <XStack
                      alignItems="center"
                      padding={14}
                      borderRadius={14}
                      borderWidth={1}
                      gap={12}
                      backgroundColor="$card"
                      borderColor="$borderColor"
                    >
                      <YStack width={8} height={8} borderRadius={4} backgroundColor="#F59E0B" />
                      <YStack flex={1}>
                        <Text fontSize={14} fontFamily="$body" fontWeight="500" color="$color" numberOfLines={1}>
                          {memory.title}
                        </Text>
                        {memory.reminderDate && (
                          <Text fontSize={12} fontFamily="$body" color="$colorMuted" marginTop={2}>
                            {new Date(memory.reminderDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                          </Text>
                        )}
                      </YStack>
                      <Feather name="chevron-right" size={16} color={theme.colorMuted.val} />
                    </XStack>
                  </PressableScale>
                </Animated.View>
              ))}
            </YStack>
          </Animated.View>
        )}

        {/* Memories List */}
        <YStack marginTop={24}>
          <XStack alignItems="center" gap={8} paddingHorizontal={20} marginBottom={14}>
            <YStack
              width={28}
              height={28}
              borderRadius={8}
              backgroundColor={theme.primary.val + "15"}
              alignItems="center"
              justifyContent="center"
            >
              <Feather name="layers" size={14} color={theme.primary.val} />
            </YStack>
            <Text fontSize={16} fontFamily="$body" fontWeight="600" color="$color" flex={1}>
              {searchResults ? "Search Results" : "All Memories"}
            </Text>
            {searchResults && (
              <Text fontSize={13} fontFamily="$body" color="$colorMuted">
                {memories.length} found
              </Text>
            )}
          </XStack>
          {isLoading ? (
            <YStack paddingHorizontal={20}>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </YStack>
          ) : memories.length === 0 ? (
            <EmptyState
              icon="layers"
              title={searchResults ? "No results" : "No memories yet"}
              description={
                searchResults
                  ? "Try a different search term"
                  : "Tap the + button to capture your first memory"
              }
            />
          ) : (
            <YStack paddingHorizontal={16} gap={12}>
              {memories.map((memory, i: number) => (
                <MemoryCard
                  key={memory._id}
                  memory={toMemoryNote(memory)}
                  index={i}
                  onPress={() => setEditMemory(memory)}
                  onDelete={() => handleDelete(memory._id)}
                  onShare={() => handleShare(memory._id)}
                  onAddToReview={() => token && addToReview({ token, memoryId: memory._id })}
                />
              ))}
            </YStack>
          )}
          {canLoadMore && !searchResults && (
            <PressableScale onPress={handleLoadMore} style={{ marginTop: 16, alignItems: "center" }}>
              {isLoadingMore ? (
                <ActivityIndicator size="small" color={theme.primary.val} />
              ) : (
                <XStack
                  alignItems="center"
                  gap={6}
                  paddingHorizontal={24}
                  paddingVertical={10}
                  borderRadius={12}
                  borderWidth={1}
                  borderColor="$borderColor"
                >
                  <Text fontSize={14} fontFamily="$body" fontWeight="600" color="$primary">
                    Load More
                  </Text>
                  <Feather name="chevron-down" size={14} color={theme.primary.val} />
                </XStack>
              )}
            </PressableScale>
          )}
        </YStack>
        <YStack height={120} />
      </ScrollView>

      {editMemory && (
        <EditMemorySheet
          key={editMemory._id}
          memory={toMemoryNote(editMemory)}
          visible={!!editMemory}
          onClose={() => setEditMemory(null)}
          onSave={handleSaveEdit}
        />
      )}
    </YStack>
  );
}
