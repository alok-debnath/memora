import React, {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
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
import { useAuth } from "@/hooks/useAuth";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useThemeStore } from "@/store/theme";
import { useUIStore } from "@/store/ui";
import type { MemoryNote } from "@/types/memory";
import { getReminderDate, inferMemoryEntryKind, isReminder } from "@/types/memoryKind";
import { Badge } from "@/components/ui/Badge";
import { TopicPills } from "@/components/ui/TopicPills";
import { EmptyState } from "@/components/ui/EmptyState";
import { AppScreen, SectionCard } from "@/components/ui/AppScreen";
import { BaseSheet } from "@/components/ui/BaseSheet";
import { PressableScale } from "@/components/ui/PressableScale";
import { SearchBar } from "@/components/ui/SearchBar";
import { SkeletonCard } from "@/components/ui/Skeleton";

const INITIAL_FEED_SIZE = 6;

const toMemoryNote = (m: Record<string, unknown>): MemoryNote => ({
  id: m._id as string,
  userId: (m.userId as string) || "",
  title: (m.title as string) || "",
  content: (m.content as string) || "",
  primaryTopicId: m.primaryTopicId as string | undefined,
  topicIds: m.topicIds as string[] | undefined,
  mood: m.mood as MemoryNote["mood"],
  people: (m.people as string[]) || [],
  locations: (m.locations as string[]) || [],
  importance: (m.importance || "normal") as MemoryNote["importance"],
  lifeArea: m.lifeArea as MemoryNote["lifeArea"],
  contextTags: m.contextTags as Record<string, string> | undefined,
  sentimentScore: m.sentimentScore as number | undefined,
  linkedUrls: Array.isArray(m.linkedUrls) ? m.linkedUrls : [],
  extractedActions: m.extractedActions as MemoryNote["extractedActions"],
  entryKind: inferMemoryEntryKind(m as Parameters<typeof inferMemoryEntryKind>[0]),
  schedule: m.schedule as MemoryNote["schedule"] | undefined,
  reminderDate: getReminderDate(m as Parameters<typeof getReminderDate>[0]),
  isRecurring: (m.schedule as { isRecurring?: boolean } | undefined)?.isRecurring ?? false,
  recurrenceType: (m.schedule as { recurrenceType?: MemoryNote["recurrenceType"] } | undefined)
    ?.recurrenceType,
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
  primaryTopicId?: string;
  topicIds?: string[];
  mood?: string;
  entryKind?: "memory" | "reminder";
  schedule?: MemoryNote["schedule"];
  people?: string[];
  locations?: string[];
  importance: string;
  shareToken?: string;
  isPublic?: boolean;
  encryptedTitle?: { v: number; n: string; c: string };
  encryptedContent?: { v: number; n: string; c: string };
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
    return (
      includesQuery(memory.title, query) ||
      includesQuery(memory.content, query) ||
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

  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [semanticResults, setSemanticResults] = useState<MemoryItem[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [editMemory, setEditMemory] = useState<MemoryItem | null>(null);
  const [isOverviewOpen, setIsOverviewOpen] = useState(false);
  const [showFullFeed, setShowFullFeed] = useState(false);
  const [upcomingRange, setUpcomingRange] = useState<"week" | "month" | "year" | "all">("week");
  const requestIdRef = useRef(0);

  const querySnapshot = useMemo(
    () => ({
      nowIso: new Date().toISOString(),
      nowMs: Date.now(),
    }),
    []
  );
  const trimmedSearchQuery = deferredSearchQuery.trim().toLowerCase();
  const searchMode = searchQuery.trim().length > 0;

  const allMemoryResult = useQuery(api.memories.listAll, token ? { token, limit: 500 } : "skip");
  const topicList = useQuery(api.userTopics.list, token ? { token } : "skip") ?? [];
  const activeTopicSummaries =
    useQuery(api.userTopics.activeSummaries, token ? { token } : "skip") ?? [];
  const selectedTopicMemories = useQuery(
    api.memories.listByTopic,
    token && selectedTopic && !searchMode
      ? { token, topicId: selectedTopic as Id<"userTopics">, limit: 500 }
      : "skip"
  );
  const topicById = useMemo(() => {
    const map: Record<string, { name: string; color?: string | null; icon?: string | null }> = {};
    for (const t of topicList) {
      map[t._id] = { name: t.name, color: t.color, icon: t.icon };
    }
    return map;
  }, [topicList]);
  const allMemories = (allMemoryResult ?? []) as MemoryItem[];
  const feedMemories = allMemories;

  const flashbacks = useQuery(api.memories.flashbacks, token ? { token } : "skip") ?? [];
  const reminderMemoriesRaw =
    useQuery(api.memories.reminders, token ? { token, asOf: querySnapshot.nowIso } : "skip");
  const reminderMemories = reminderMemoriesRaw ?? [];
  const upcomingRemindersRaw =
    useQuery(api.memories.upcomingReminders, token ? { token, asOf: querySnapshot.nowIso, range: upcomingRange } : "skip");
  const upcomingReminders = upcomingRemindersRaw ?? [];
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
    if (!searchMode) {
      setShowFullFeed(false);
    }
  }, [searchMode]);

  useEffect(() => {
    if (
      selectedTopic &&
      !activeTopicSummaries.some((topic) => topic._id === selectedTopic)
    ) {
      setSelectedTopic(null);
    }
  }, [activeTopicSummaries, selectedTopic]);

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
    if (data._delete) {
      await deleteMemory({ token, id: editMemory._id });
    } else {
      await updateMemory({ token, id: editMemory._id, ...data });
    }
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
      if (selectedTopic) {
        return (selectedTopicMemories ?? []) as MemoryItem[];
      }
      return feedMemories;
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
    const byTopic = selectedTopic
      ? searchPool.filter(
          (memory) =>
            memory.primaryTopicId === selectedTopic ||
            (memory.topicIds ?? []).includes(selectedTopic)
        )
      : searchPool;

    return [...byTopic].sort((a, b) => b._creationTime - a._creationTime);
  }, [
    feedMemories,
    exactMatches,
    searchMode,
    selectedTopic,
    semanticResults,
    selectedTopicMemories,
  ]);

  const transformedMemories = useMemo(
    () => filteredMemories.map((memory) => ({ raw: memory, note: toMemoryNote(memory) })),
    [filteredMemories]
  );

  const topReminders = useMemo(
    () => reminderMemories.filter((memory) => !!getReminderDate(memory)).slice(0, 2),
    [reminderMemories]
  );
  const visibleFeed = useMemo(
    () =>
      searchMode || showFullFeed
        ? transformedMemories
        : transformedMemories.slice(0, INITIAL_FEED_SIZE),
    [searchMode, showFullFeed, transformedMemories]
  );

  const firstName = user?.name?.split(" ")[0] || "there";
  const isLoading =
    allMemoryResult === undefined ||
    reminderMemoriesRaw === undefined ||
    upcomingRemindersRaw === undefined ||
    (!!selectedTopic && !searchMode && selectedTopicMemories === undefined);
  const totalMemories = stats?.totalMemories ?? 0;
  const totalReminders = stats?.totalReminders ?? 0;
  const totalCategories = activeTopicSummaries.length;
  const recentActivity = stats?.recentCount ?? 0;
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
              placeholder="Search memories, people, places..."
            />
            <TopicPills
              selected={selectedTopic}
              onSelect={setSelectedTopic}
              topics={
                activeTopicSummaries as Array<{
                  _id: string;
                  name: string;
                  icon?: string | null;
                  color?: string | null;
                  memoryCount: number;
                }>
              }
            />
            {searchMode && relatedCount > 0 ? (
              <Text fontSize={12} color="$colorMuted">
                Exact matches are shown first, then related semantic results.
              </Text>
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
                      {upcomingReminders.length > 0
                        ? `${upcomingReminders.length} coming up`
                        : "Nothing scheduled soon"}
                    </Text>
                    <Text fontSize={12} lineHeight={18} color="$colorMuted" numberOfLines={2}>
                      {topReminders.length > 0
                        ? `${topReminders.length} due now`
                        : "No immediate follow-ups"}
                      {" · "}
                      {upcomingReminders.length > 0
                        ? `Next: ${upcomingReminders[0].title || "Untitled memory"}`
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
                          {new Date(getReminderDate(memory)!).toLocaleString(undefined, {
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
                title={
                  searchMode
                    ? "No matches"
                    : selectedTopic
                      ? "No memories for this topic"
                      : "No memories yet"
                }
                description={
                  searchMode
                    ? "Try another phrase or clear the topic filter."
                    : selectedTopic
                      ? "This topic no longer has any matching memories."
                      : "Capture your first memory to start the stream."
                }
              />
            ) : (
              <YStack gap={12}>
                {visibleFeed.map(({ raw, note }, index) => {
                  const primaryTopic = note.primaryTopicId ? topicById[note.primaryTopicId] : undefined;
                  const secondaryTopics = (note.topicIds ?? [])
                    .filter((id) => id !== note.primaryTopicId && topicById[id])
                    .map((id) => topicById[id]);
                  const resolvedTopics = [
                    ...(primaryTopic ? [primaryTopic] : []),
                    ...secondaryTopics,
                  ];
                  return (
                    <MemoryCard
                      key={raw._id}
                      memory={note}
                      index={index}
                      resolvedTopics={resolvedTopics.length > 0 ? resolvedTopics : undefined}
                      onPress={() => {
                        setEditMemory(raw);
                        openEditMemory();
                      }}
                      onDelete={() => handleDelete(raw._id)}
                      onShare={() => handleShare(raw._id)}
                      onAddToReview={() => token && addToReview({ token, memoryId: raw._id })}
                    />
                  );
                })}
              </YStack>
            )}

          </SectionCard>
        </Animated.View>
      </AppScreen>

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

            <SectionCard
              title="Due now"
              action={
                topReminders.length > 0 ? (
                  <YStack
                    minWidth={24}
                    height={24}
                    borderRadius={999}
                    paddingHorizontal={8}
                    alignItems="center"
                    justifyContent="center"
                    backgroundColor={theme.warning.val + "22"}
                  >
                    <Text fontSize={12} fontWeight="700" color={theme.warning.val}>
                      {topReminders.length}
                    </Text>
                  </YStack>
                ) : null
              }
            >
              {topReminders.length > 0 ? (
                <YStack gap={10}>
                  {topReminders.map((memory) => (
                    <XStack key={memory._id} alignItems="center" justifyContent="space-between" gap={12}>
                      <YStack flex={1} gap={2}>
                        <Text fontSize={14} fontWeight="700" color="$color" numberOfLines={1}>
                          {memory.title || "Untitled memory"}
                        </Text>
                        <Text fontSize={12} color="$colorMuted">
                          {new Date(getReminderDate(memory)!).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </Text>
                      </YStack>
                      <Badge
                        label="reminder"
                        color={theme.warning.val}
                        small
                      />
                    </XStack>
                  ))}
                </YStack>
              ) : (
                <Text fontSize={13} lineHeight={20} color="$colorMuted">
                  Nothing needs attention immediately.
                </Text>
              )}
            </SectionCard>

            <SectionCard
              title="Upcoming"
              action={
                upcomingReminders.length > 0 ? (
                  <YStack
                    minWidth={24}
                    height={24}
                    borderRadius={999}
                    paddingHorizontal={8}
                    alignItems="center"
                    justifyContent="center"
                    backgroundColor={theme.primary.val + "22"}
                  >
                    <Text fontSize={12} fontWeight="700" color="$primary">
                      {upcomingReminders.length}
                    </Text>
                  </YStack>
                ) : null
              }
            >
              <XStack gap={6} flexWrap="wrap">
                {(["week", "month", "year", "all"] as const).map((r) => (
                  <PressableScale key={r} onPress={() => setUpcomingRange(r)}>
                    <YStack
                      paddingHorizontal={12}
                      paddingVertical={6}
                      borderRadius={999}
                      backgroundColor={upcomingRange === r ? theme.primary.val + "22" : "$secondary"}
                      borderWidth={1}
                      borderColor={upcomingRange === r ? theme.primary.val : "$borderColor"}
                    >
                      <Text
                        fontSize={12}
                        fontWeight="700"
                        color={upcomingRange === r ? "$primary" : "$colorMuted"}
                        textTransform="capitalize"
                      >
                        {r}
                      </Text>
                    </YStack>
                  </PressableScale>
                ))}
              </XStack>
              {upcomingReminders.length > 0 ? (
                <YStack gap={10}>
                  {upcomingReminders.map((memory) => (
                    <XStack key={memory._id} alignItems="center" justifyContent="space-between" gap={12}>
                      <YStack flex={1} gap={2}>
                        <Text fontSize={14} fontWeight="700" color="$color" numberOfLines={1}>
                          {memory.title || "Untitled memory"}
                        </Text>
                        <Text fontSize={12} color="$colorMuted">
                          {new Date(getReminderDate(memory)!).toLocaleString(undefined, {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </Text>
                      </YStack>
                      <Badge
                        label="upcoming"
                        color={theme.primary.val}
                        small
                      />
                    </XStack>
                  ))}
                </YStack>
              ) : (
                <Text fontSize={13} lineHeight={20} color="$colorMuted">
                  No reminders in this range.
                </Text>
              )}
            </SectionCard>

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
