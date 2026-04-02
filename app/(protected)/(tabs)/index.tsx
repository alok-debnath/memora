import React, {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  Share,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAction, useMutation, useQuery } from "convex/react";
import Animated, { FadeIn, FadeInRight, FadeInUp } from "react-native-reanimated";
import { XStack, YStack, Text } from "tamagui";

import { EditMemorySheet } from "@/components/EditMemorySheet";
import { FlashbackCard } from "@/components/FlashbackCard";
import { MemoryCard } from "@/components/MemoryCard";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { categoryLabels } from "@/constants/categories";
import { useAuth } from "@/hooks/useAuth";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useThemeStore } from "@/store/theme";
import { useUIStore } from "@/store/ui";
import type { MemoryNote } from "@/types/memory";
import { Badge } from "@/components/ui/Badge";
import { CategoryPills } from "@/components/ui/CategoryPills";
import { EmptyState } from "@/components/ui/EmptyState";
import { AppScreen, SectionCard } from "@/components/ui/AppScreen";
import { BaseSheet } from "@/components/ui/BaseSheet";
import { PressableScale } from "@/components/ui/PressableScale";
import { SearchBar } from "@/components/ui/SearchBar";
import { SkeletonCard } from "@/components/ui/Skeleton";

const PAGE_SIZE = 20;
const INITIAL_FEED_SIZE = 6;

const toMemoryNote = (m: Record<string, unknown>): MemoryNote => ({
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
});

type MemoryItem = {
  _id: Id<"memories">;
  _creationTime: number;
  userId: Id<"users">;
  title?: string;
  content?: string;
  category: string;
  mood?: string;
  tags?: string[];
  people?: string[];
  locations?: string[];
  importance: string;
  reminderDate?: string;
  isRecurring: boolean;
  shareToken?: string;
  isPublic?: boolean;
  encryptedTitle?: { v: number; n: string; c: string };
  encryptedContent?: { v: number; n: string; c: string };
  encryptedTags?: { v: number; n: string; c: string };
  encryptedPeople?: { v: number; n: string; c: string };
  encryptedLocations?: { v: number; n: string; c: string };
  [key: string]: unknown;
};

function includesQuery(value: string | undefined, query: string) {
  return (value ?? "").toLowerCase().includes(query);
}

function getExactSearchMatches(memories: MemoryItem[], query: string) {
  if (!query) return [];

  return memories.filter((memory) => {
    const categoryLabel =
      categoryLabels[memory.category as keyof typeof categoryLabels]?.toLowerCase() ?? "";

    return (
      includesQuery(memory.title, query) ||
      includesQuery(memory.content, query) ||
      includesQuery(memory.category, query) ||
      categoryLabel.includes(query) ||
      (memory.tags ?? []).some((tag) => tag.toLowerCase().includes(query)) ||
      (memory.people ?? []).some((person) => person.toLowerCase().includes(query)) ||
      (memory.locations ?? []).some((location) => location.toLowerCase().includes(query))
    );
  });
}

function MetricTile({ value, label }: { value: number; label: string }) {
  return (
    <YStack
      flex={1}
      padding={14}
      borderRadius={20}
      backgroundColor="$background"
      borderWidth={1}
      borderColor="$borderColor"
      gap={4}
    >
      <Text fontSize={22} fontFamily="$heading" fontWeight="700" color="$color">
        {value}
      </Text>
      <Text fontSize={12} color="$colorMuted">
        {label}
      </Text>
    </YStack>
  );
}

export default function HomeScreen() {
  const theme = useAppTheme();
  const { user, token } = useAuth();
  const { resolvedMode, setMode } = useThemeStore();

  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [semanticResults, setSemanticResults] = useState<MemoryItem[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [editMemory, setEditMemory] = useState<MemoryItem | null>(null);
  const [isOverviewOpen, setIsOverviewOpen] = useState(false);
  const [showFullFeed, setShowFullFeed] = useState(false);
  const requestIdRef = useRef(0);

  const querySnapshot = useMemo(
    () => ({
      nowIso: new Date().toISOString(),
      nowMs: Date.now(),
    }),
    []
  );

  const memoryResult = useQuery(api.memories.list, token ? { token, limit: pageSize } : "skip");
  const allMemories = (memoryResult?.memories ?? []) as MemoryItem[];
  const canLoadMore = memoryResult ? !memoryResult.isDone : false;

  const flashbacks = useQuery(api.memories.flashbacks, token ? { token } : "skip") ?? [];
  const reminderMemories =
    useQuery(api.memories.reminders, token ? { token, asOf: querySnapshot.nowIso } : "skip") ?? [];
  const upcomingReminders =
    useQuery(api.memories.upcomingReminders, token ? { token, asOf: querySnapshot.nowIso } : "skip") ?? [];
  const stats =
    useQuery(api.memories.stats, token ? { token, asOf: querySnapshot.nowMs } : "skip") ?? null;

  const semanticSearch = useAction(api.actions.semanticSearch.search);
  const deleteMemory = useMutation(api.memories.remove);
  const updateMemory = useMutation(api.memories.update);
  const addToReview = useMutation(api.review.addToReview);
  const createShareLink = useMutation(api.sharing.createShareLink);

  const isEditMemoryOpen = useUIStore((state) => state.isEditMemoryOpen);
  const openEditMemory = useUIStore((state) => state.openEditMemory);
  const closeEditMemory = useUIStore((state) => state.closeEditMemory);

  const trimmedSearchQuery = deferredSearchQuery.trim().toLowerCase();
  const searchMode = searchQuery.trim().length > 0;

  useEffect(() => {
    if (!trimmedSearchQuery || trimmedSearchQuery.length < 3 || !token) {
      setSemanticResults(null);
      setIsSearching(false);
      return;
    }

    const currentRequestId = requestIdRef.current + 1;
    requestIdRef.current = currentRequestId;
    setIsSearching(true);

    semanticSearch({ token, query: trimmedSearchQuery, limit: 12 })
      .then((results) => {
        if (requestIdRef.current === currentRequestId) {
          setSemanticResults(results as MemoryItem[]);
        }
      })
      .catch(() => {
        if (requestIdRef.current === currentRequestId) {
          setSemanticResults(null);
        }
      })
      .finally(() => {
        if (requestIdRef.current === currentRequestId) {
          setIsSearching(false);
        }
      });
  }, [semanticSearch, token, trimmedSearchQuery]);

  useEffect(() => {
    if (memoryResult) {
      setIsLoadingMore(false);
    }
  }, [memoryResult]);

  useEffect(() => {
    if (!searchMode) {
      setShowFullFeed(false);
    }
  }, [searchMode]);

  const handleLoadMore = useCallback(() => {
    if (!canLoadMore || isLoadingMore) return;
    setIsLoadingMore(true);
    setPageSize((previous) => previous + PAGE_SIZE);
  }, [canLoadMore, isLoadingMore]);

  const handleDelete = async (id: Id<"memories">) => {
    if (!token) return;
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    if (Platform.OS === "web") {
      if (window.confirm("Delete this memory?")) {
        await deleteMemory({ token, id });
      }
      return;
    }

    Alert.alert("Delete", "Delete this memory?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMemory({ token, id }) },
    ]);
  };

  const handleSaveEdit = async (data: Record<string, unknown>) => {
    if (!editMemory || !token) return;
    await updateMemory({ token, id: editMemory._id, ...data });
    setEditMemory(null);
    closeEditMemory();
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
        return;
      }

      await Share.share({
        message: `View this memory in Memora: ${shareUrl}`,
        url: shareUrl,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to create share link.";
      if (Platform.OS === "web") {
        window.alert(message);
      } else {
        Alert.alert("Share failed", message);
      }
    }
  };

  const exactMatches = useMemo(
    () => getExactSearchMatches(allMemories, trimmedSearchQuery),
    [allMemories, trimmedSearchQuery]
  );

  const filteredMemories = useMemo(() => {
    if (!searchMode) {
      return selectedCategory
        ? allMemories.filter((memory) => memory.category === selectedCategory)
        : allMemories;
    }

    const merged = new Map<Id<"memories">, MemoryItem>();
    for (const memory of exactMatches) {
      merged.set(memory._id, memory);
    }
    for (const memory of semanticResults ?? []) {
      if (!merged.has(memory._id)) {
        merged.set(memory._id, memory);
      }
    }

    const searchPool = Array.from(merged.values());
    const byCategory = selectedCategory
      ? searchPool.filter((memory) => memory.category === selectedCategory)
      : searchPool;

    return [...byCategory].sort((a, b) => b._creationTime - a._creationTime);
  }, [allMemories, exactMatches, searchMode, selectedCategory, semanticResults]);

  const transformedMemories = useMemo(
    () => filteredMemories.map((memory) => ({ raw: memory, note: toMemoryNote(memory) })),
    [filteredMemories]
  );

  const topReminders = useMemo(
    () => reminderMemories.filter((memory) => !!memory.reminderDate).slice(0, 2),
    [reminderMemories]
  );
  const weekReminders = useMemo(
    () => upcomingReminders.filter((memory) => !!memory.reminderDate).slice(0, 4),
    [upcomingReminders]
  );
  const visibleFeed = useMemo(
    () =>
      searchMode || showFullFeed
        ? transformedMemories
        : transformedMemories.slice(0, INITIAL_FEED_SIZE),
    [searchMode, showFullFeed, transformedMemories]
  );

  const firstName = user?.name?.split(" ")[0] || "there";
  const isLoading = !memoryResult;
  const totalMemories = stats?.totalMemories ?? 0;
  const totalReminders = stats?.totalReminders ?? 0;
  const totalCategories = stats?.categories ?? 0;
  const recentActivity = stats?.recentCount ?? 0;
  const streakDays = stats?.streakDays ?? 0;
  const hiddenFeedCount = Math.max(transformedMemories.length - INITIAL_FEED_SIZE, 0);
  const exactCount = exactMatches.length;
  const relatedCount = Math.max(filteredMemories.length - exactCount, 0);

  return (
    <>
      <AppScreen
        title={`Hey, ${firstName}`}
        headerRight={
          <XStack gap={10} alignItems="center">
            {!searchMode && topReminders.length > 0 ? (
              <Badge label={`${topReminders.length} due`} color={theme.warning.val} small />
            ) : null}
            <PressableScale onPress={() => setMode(resolvedMode === "dark" ? "light" : "dark")}>
              <YStack
                width={46}
                height={46}
                borderRadius={16}
                alignItems="center"
                justifyContent="center"
                backgroundColor="$card"
                borderWidth={1}
                borderColor="$borderColor"
              >
                <Feather
                  name={resolvedMode === "dark" ? "sun" : "moon"}
                  size={19}
                  color={theme.color.val}
                />
              </YStack>
            </PressableScale>
          </XStack>
        }
      >
        <Animated.View entering={FadeInUp.duration(280)}>
          <SectionCard
            title={searchMode ? "Search" : "Memory stream"}
            action={
              searchMode ? (
                <XStack gap={8}>
                  <Badge label={`${filteredMemories.length} results`} color={theme.primary.val} small />
                  {exactCount > 0 ? (
                    <Badge label={`${exactCount} exact`} color={theme.success.val} small />
                  ) : null}
                </XStack>
              ) : (
                <Badge label={`${totalMemories} memories`} color={theme.primary.val} small />
              )
            }
          >
            <SearchBar
              value={searchQuery}
              onChangeText={setSearchQuery}
              isSearching={isSearching}
              placeholder="Search memories, tags, people, places..."
            />
            <CategoryPills
              selected={selectedCategory}
              onSelect={setSelectedCategory}
              categoryCounts={stats?.categoryCounts ?? {}}
            />
            {searchMode && relatedCount > 0 ? (
              <Text fontSize={12} color="$colorMuted">
                Exact matches are shown first, then related semantic results.
              </Text>
            ) : null}
          </SectionCard>
        </Animated.View>

        {!searchMode && topReminders.length > 0 ? (
          <Animated.View entering={FadeIn.delay(80).duration(280)}>
            <SectionCard
              title="Due now"
              action={<Badge label={`${topReminders.length}`} color={theme.warning.val} small />}
            >
              <YStack gap={10}>
                {topReminders.map((memory) => (
                  <PressableScale
                    key={memory._id}
                    onPress={() => {
                      setEditMemory(memory as MemoryItem);
                      openEditMemory();
                    }}
                  >
                    <XStack
                      alignItems="center"
                      gap={12}
                      padding={14}
                      borderRadius={20}
                      backgroundColor="$background"
                      borderWidth={1}
                      borderColor="$borderColor"
                    >
                      <YStack
                        width={42}
                        height={42}
                        borderRadius={14}
                        alignItems="center"
                        justifyContent="center"
                        backgroundColor={theme.warning.val + "18"}
                      >
                        <Feather name="bell" size={16} color={theme.warning.val} />
                      </YStack>
                      <YStack flex={1} gap={3}>
                        <Text fontSize={15} fontWeight="700" color="$color" numberOfLines={1}>
                          {memory.title || "Untitled memory"}
                        </Text>
                        <Text fontSize={13} color="$colorMuted" numberOfLines={1}>
                          {new Date(memory.reminderDate!).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </Text>
                      </YStack>
                      <Feather name="chevron-right" size={18} color={theme.colorMuted.val} />
                    </XStack>
                  </PressableScale>
                ))}
              </YStack>
            </SectionCard>
          </Animated.View>
        ) : null}

        <Animated.View entering={FadeIn.delay(140).duration(300)}>
          <SectionCard
            title={searchMode ? "Results" : "Recent"}
            action={
              !searchMode && hiddenFeedCount > 0 ? (
                <PressableScale onPress={() => setShowFullFeed((value) => !value)}>
                  <XStack alignItems="center" gap={6}>
                    <Text fontSize={13} fontWeight="700" color="$primary">
                      {showFullFeed ? "Show less" : `Show ${hiddenFeedCount} more`}
                    </Text>
                    <Feather
                      name={showFullFeed ? "chevron-up" : "chevron-down"}
                      size={14}
                      color={theme.primary.val}
                    />
                  </XStack>
                </PressableScale>
              ) : null
            }
          >
            {isLoading ? (
              <YStack gap={12}>
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </YStack>
            ) : transformedMemories.length === 0 ? (
              <EmptyState
                icon="layers"
                title={searchMode ? "No matches" : "No memories yet"}
                description={
                  searchMode
                    ? "Try another phrase or clear the category filter."
                    : "Capture your first memory to start the stream."
                }
              />
            ) : (
              <YStack gap={12}>
                {visibleFeed.map(({ raw, note }, index) => (
                  <MemoryCard
                    key={raw._id}
                    memory={note}
                    index={index}
                    onPress={() => {
                      setEditMemory(raw);
                      openEditMemory();
                    }}
                    onDelete={() => handleDelete(raw._id)}
                    onShare={() => handleShare(raw._id)}
                    onAddToReview={() => token && addToReview({ token, memoryId: raw._id })}
                  />
                ))}
              </YStack>
            )}

            {canLoadMore && !searchMode ? (
              <PressableScale onPress={handleLoadMore} style={{ alignSelf: "center" }}>
                <XStack
                  alignItems="center"
                  gap={8}
                  paddingHorizontal={18}
                  paddingVertical={12}
                  borderRadius={999}
                  backgroundColor={theme.primary.val + "12"}
                  borderWidth={1}
                  borderColor={theme.primary.val + "18"}
                >
                  {isLoadingMore ? (
                    <ActivityIndicator size="small" color={theme.primary.val} />
                  ) : (
                    <>
                      <Text fontSize={14} fontWeight="700" color="$primary">
                        Load more
                      </Text>
                      <Feather name="arrow-down" size={15} color={theme.primary.val} />
                    </>
                  )}
                </XStack>
              </PressableScale>
            ) : null}

            {!searchMode ? (
              <PressableScale onPress={() => setIsOverviewOpen(true)}>
                <XStack
                  alignItems="center"
                  justifyContent="space-between"
                  gap={12}
                  paddingTop={14}
                  borderTopWidth={1}
                  borderTopColor={theme.borderColor.val}
                >
                  <YStack flex={1} gap={4}>
                    <Text fontSize={13} fontWeight="700" color="$color">
                      {weekReminders.length > 0
                        ? `${weekReminders.length} coming up`
                        : "Nothing scheduled soon"}
                    </Text>
                    <Text fontSize={12} lineHeight={18} color="$colorMuted" numberOfLines={2}>
                      {topReminders.length > 0
                        ? `${topReminders.length} due now`
                        : "No immediate follow-ups"}
                      {" · "}
                      {weekReminders.length > 0
                        ? `Next: ${weekReminders[0].title || "Untitled memory"}`
                        : `Recent activity: ${recentActivity} this week`}
                    </Text>
                  </YStack>
                  <XStack alignItems="center" gap={6}>
                    <Text fontSize={12} fontWeight="700" color="$primary">
                      Overview
                    </Text>
                    <Feather name="chevron-right" size={14} color={theme.primary.val} />
                  </XStack>
                </XStack>
              </PressableScale>
            ) : null}
          </SectionCard>
        </Animated.View>
      </AppScreen>

      {!searchMode ? (
        <YStack position="absolute" left={0} top="32%" zIndex={20}>
          <PressableScale onPress={() => setIsOverviewOpen(true)}>
            <YStack
              paddingVertical={14}
              paddingHorizontal={10}
              borderTopRightRadius={18}
              borderBottomRightRadius={18}
              backgroundColor="$card"
              borderWidth={1}
              borderLeftWidth={0}
              borderColor="$borderColor"
              gap={8}
              alignItems="center"
              justifyContent="center"
              shadowColor="$shadowColor"
              shadowOffset={{ width: 0, height: 8 }}
              shadowOpacity={0.08}
              shadowRadius={20}
            >
              <Feather name="sidebar" size={16} color={theme.colorMuted.val} />
              <Text
                fontSize={10}
                color="$colorMuted"
                letterSpacing={1}
                textTransform="uppercase"
                style={{ transform: [{ rotate: "-90deg" }] }}
              >
                View
              </Text>
            </YStack>
          </PressableScale>
        </YStack>
      ) : null}

      <BaseSheet
        open={isOverviewOpen}
        onOpenChange={setIsOverviewOpen}
        sheetId="homeOverview"
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40, gap: 18 }}
        >
          <YStack gap={18}>
            <XStack alignItems="center" justifyContent="space-between" gap={12}>
              <Text fontSize={26} fontFamily="$heading" fontWeight="700" color="$color">
                Overview
              </Text>
              <PressableScale onPress={() => setIsOverviewOpen(false)}>
                <YStack
                  width={38}
                  height={38}
                  borderRadius={14}
                  alignItems="center"
                  justifyContent="center"
                  backgroundColor="$background"
                  borderWidth={1}
                  borderColor="$borderColor"
                >
                  <Feather name="x" size={18} color={theme.color.val} />
                </YStack>
              </PressableScale>
            </XStack>

            <XStack gap={10}>
              <MetricTile value={totalMemories} label="Memories" />
              <MetricTile value={totalReminders} label="Reminders" />
              <MetricTile value={totalCategories} label="Categories" />
            </XStack>

            <XStack gap={10}>
              <MetricTile value={recentActivity} label="This week" />
              <MetricTile value={streakDays} label="Streak" />
              <MetricTile value={weekReminders.length} label="Coming up" />
            </XStack>

            {topReminders.length > 0 ? (
              <SectionCard title="Due now">
                <YStack gap={10}>
                  {topReminders.map((memory) => (
                    <XStack key={memory._id} alignItems="center" justifyContent="space-between" gap={12}>
                      <YStack flex={1} gap={2}>
                        <Text fontSize={14} fontWeight="700" color="$color" numberOfLines={1}>
                          {memory.title || "Untitled memory"}
                        </Text>
                        <Text fontSize={12} color="$colorMuted">
                          {new Date(memory.reminderDate!).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </Text>
                      </YStack>
                      <Badge
                        label={categoryLabels[memory.category as keyof typeof categoryLabels] ?? "Other"}
                        color={theme.warning.val}
                        small
                      />
                    </XStack>
                  ))}
                </YStack>
              </SectionCard>
            ) : null}

            {topReminders.length === 0 ? (
              <SectionCard title="Due now">
                <Text fontSize={13} lineHeight={20} color="$colorMuted">
                  Nothing needs attention immediately.
                </Text>
              </SectionCard>
            ) : null}

            {weekReminders.length > 0 ? (
              <SectionCard title="Upcoming">
                <YStack gap={10}>
                  {weekReminders.map((memory) => (
                    <XStack key={memory._id} alignItems="center" justifyContent="space-between" gap={12}>
                      <YStack flex={1} gap={2}>
                        <Text fontSize={14} fontWeight="700" color="$color" numberOfLines={1}>
                          {memory.title || "Untitled memory"}
                        </Text>
                        <Text fontSize={12} color="$colorMuted">
                          {new Date(memory.reminderDate!).toLocaleString(undefined, {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </Text>
                      </YStack>
                      <Badge
                        label={categoryLabels[memory.category as keyof typeof categoryLabels] ?? "Other"}
                        color={theme.primary.val}
                        small
                      />
                    </XStack>
                  ))}
                </YStack>
              </SectionCard>
            ) : null}

            {weekReminders.length === 0 ? (
              <SectionCard title="Upcoming">
                <Text fontSize={13} lineHeight={20} color="$colorMuted">
                  No scheduled reminders in the next 7 days.
                </Text>
              </SectionCard>
            ) : null}

            {flashbacks.length > 0 ? (
              <SectionCard title="On this day">
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 12, paddingRight: 8 }}
                >
                  {flashbacks.map((memory, index) => (
                    <Animated.View
                      key={memory._id}
                      entering={FadeInRight.delay(index * 60).duration(240)}
                    >
                      <FlashbackCard
                        memory={toMemoryNote(memory)}
                        onPress={() => {
                          setIsOverviewOpen(false);
                          setEditMemory(memory as MemoryItem);
                          openEditMemory();
                        }}
                      />
                    </Animated.View>
                  ))}
                </ScrollView>
              </SectionCard>
            ) : null}
          </YStack>
        </ScrollView>
      </BaseSheet>

      {editMemory ? (
        <EditMemorySheet
          key={editMemory._id}
          memory={toMemoryNote(editMemory)}
          visible={isEditMemoryOpen}
          onClose={() => {
            setEditMemory(null);
            closeEditMemory();
          }}
          onSave={handleSaveEdit}
        />
      ) : null}
    </>
  );
}
