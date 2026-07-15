import React, { useCallback, useMemo, useState } from "react";
import { ScrollView, Pressable } from "react-native";
import { AppList, type ListRenderItemInfo } from "@/components/ui/AppList";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { XStack, YStack, Text } from "tamagui";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Feather } from "@/lib/icons";
import { useAuth } from "@/hooks/useAuth";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useSemanticColors } from "@/hooks/useSemanticColors";
import { useTabBarBottomPadding } from "@/hooks/useTabBarBottomPadding";
import { useIsLargeScreen } from "@/hooks/useIsLargeScreen";
import { useAppRouter as useRouter } from "@/hooks/useAppRouter";
import { useAppConfirm } from "@/components/ui/confirm/AppConfirmProvider";
import { PageHero } from "@/components/ui/PageHero";
import { SearchBar } from "@/components/ui/SearchBar";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { DiaryComposer } from "@/components/diary/DiaryComposer";
import { DiaryListCard } from "@/components/diary/DiaryListCard";
import { DiaryCalendar } from "@/components/diary/DiaryCalendar";
import { DiaryInsights } from "@/components/diary/DiaryInsights";
import type { DiaryListItem } from "@/components/diary/types";
import { moodIcons, moodLabels, type Mood } from "@/constants/categories";
import { CONTENT_GAP, spacing } from "@/constants/uiTokens";

type DiaryMode = "entries" | "calendar" | "insights";
type InsightsRange = "7d" | "30d" | "90d";

const ALL_MOODS = Object.keys(moodLabels) as Mood[];
const DAY_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 20;

const INSIGHTS_RANGE_DAYS: Record<InsightsRange, number> = { "7d": 7, "30d": 30, "90d": 90 };

function localDayRange(dayKey: string): { startMs: number; endMs: number } {
  const startMs = new Date(`${dayKey}T00:00:00`).getTime();
  return { startMs, endMs: startMs + DAY_MS };
}

function MoodFilterRow({
  selected,
  onSelect,
}: {
  selected: Mood | null;
  onSelect: (mood: Mood | null) => void;
}) {
  const theme = useAppTheme();
  const semantic = useSemanticColors();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8 }}
    >
      <Pressable
        onPress={() => onSelect(null)}
        style={{
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 999,
          backgroundColor: selected === null ? theme.primary.val : theme.secondary.val,
        }}
      >
        <Text
          fontSize={12}
          fontFamily="$body"
          fontWeight="600"
          color={selected === null ? theme.textInverse.val : theme.colorMuted.val}
        >
          All moods
        </Text>
      </Pressable>
      {ALL_MOODS.map((mood) => {
        const active = selected === mood;
        const color = semantic.mood[mood];
        return (
          <Pressable
            key={mood}
            onPress={() => onSelect(active ? null : mood)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              paddingHorizontal: 11,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: active ? color + "26" : theme.secondary.val,
              borderWidth: 1,
              borderColor: active ? color : "transparent",
            }}
          >
            <Feather
              name={moodIcons[mood]}
              size={12}
              color={active ? color : theme.colorMuted.val}
            />
            <Text
              fontSize={12}
              fontFamily="$body"
              fontWeight="600"
              color={active ? color : theme.colorMuted.val}
            >
              {moodLabels[mood]}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export default function DiaryScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const { confirm } = useAppConfirm();
  const { token } = useAuth();
  const tabBarPadding = useTabBarBottomPadding();
  const isLargeScreen = useIsLargeScreen();

  const [mode, setMode] = useState<DiaryMode>("entries");
  const [searchText, setSearchText] = useState("");
  const [moodFilter, setMoodFilter] = useState<Mood | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [insightsRange, setInsightsRange] = useState<InsightsRange>("30d");

  const now = new Date();
  const [calendarYear, setCalendarYear] = useState(now.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(now.getMonth());
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);

  const createEntry = useMutation(api.diary.create);
  const deleteEntry = useMutation(api.diary.remove);

  const tzOffsetMinutes = now.getTimezoneOffset();
  const searchActive = mode === "entries" && searchText.trim().length > 0;
  const dayRange = mode === "calendar" && selectedDayKey ? localDayRange(selectedDayKey) : null;

  const listArgs = token
    ? {
        token,
        mood: moodFilter ?? undefined,
        dateStartMs: dayRange?.startMs,
        dateEndMs: dayRange?.endMs,
      }
    : "skip";
  const {
    results: pagedEntries,
    status: pageStatus,
    loadMore,
  } = usePaginatedQuery(api.diary.listPaginated, searchActive ? "skip" : listArgs, {
    initialNumItems: PAGE_SIZE,
  });

  const searchResults = useQuery(
    api.diary.search,
    token && searchActive ? { token, query: searchText.trim() } : "skip",
  );

  const calendarStartMs = new Date(calendarYear, calendarMonth, 1).getTime();
  const calendarEndMs = new Date(calendarYear, calendarMonth + 1, 1).getTime();
  const calendarData = useQuery(
    api.diary.calendarSummary,
    token && mode === "calendar"
      ? { token, startMs: calendarStartMs, endMs: calendarEndMs, tzOffsetMinutes }
      : "skip",
  );

  // Snapshot the range bounds per selection: inline Date.now() would change the
  // query args every render, resubscribing in a setState loop.
  const insightsWindow = useMemo(() => {
    const endMs = Date.now();
    return { startMs: endMs - INSIGHTS_RANGE_DAYS[insightsRange] * DAY_MS, endMs };
  }, [insightsRange]);
  const insightsData = useQuery(
    api.diary.insights,
    token && mode === "insights" ? { token, ...insightsWindow, tzOffsetMinutes } : "skip",
  );

  const handleSubmit = useCallback(
    async (text: string) => {
      if (!token) return;
      setIsSaving(true);
      try {
        await createEntry({ token, rawText: text });
      } finally {
        setIsSaving(false);
      }
    },
    [createEntry, token],
  );

  const handleOpenEntry = useCallback(
    (id: Id<"diaryEntries">) => {
      router.push(`/diary/${id}` as never);
    },
    [router],
  );

  const handleDelete = useCallback(
    async (id: Id<"diaryEntries">) => {
      const confirmed = await confirm({
        title: "Delete Entry",
        message: "This diary entry will be permanently deleted.",
        confirmLabel: "Delete",
        tone: "destructive",
        icon: "trash-2",
      });
      if (confirmed && token) {
        deleteEntry({ token, id });
      }
    },
    [confirm, deleteEntry, token],
  );

  const entries: DiaryListItem[] = useMemo(() => {
    if (searchActive) return (searchResults ?? []) as DiaryListItem[];
    if (mode === "calendar" && !dayRange) return [];
    return (pagedEntries ?? []) as DiaryListItem[];
  }, [searchActive, searchResults, mode, dayRange, pagedEntries]);

  const isInitialLoading = searchActive
    ? searchResults === undefined
    : pageStatus === "LoadingFirstPage";

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<DiaryListItem>) => (
      <DiaryListCard entry={item} onPress={handleOpenEntry} onDelete={handleDelete} />
    ),
    [handleOpenEntry, handleDelete],
  );

  const keyExtractor = useCallback((item: DiaryListItem) => item._id, []);

  const handleEndReached = useCallback(() => {
    if (!searchActive && pageStatus === "CanLoadMore") {
      loadMore(PAGE_SIZE);
    }
  }, [searchActive, pageStatus, loadMore]);

  const header = (
    <YStack gap={CONTENT_GAP}>
      <PageHero
        eyebrow="Daily capture"
        title="AI Diary"
        description="Capture voice or typed reflections. Memora turns them into structured entries and insights."
        icon="book-open"
      />

      <DiaryComposer onSubmit={handleSubmit} isSaving={isSaving} />

      <SegmentedControl<DiaryMode>
        options={[
          { value: "entries", label: "Entries" },
          { value: "calendar", label: "Calendar" },
          { value: "insights", label: "Insights" },
        ]}
        value={mode}
        onChange={setMode}
      />

      {mode === "entries" ? (
        <YStack gap={10}>
          <SearchBar
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search your diary..."
            isSearching={searchActive && searchResults === undefined}
          />
          <MoodFilterRow selected={moodFilter} onSelect={setMoodFilter} />
        </YStack>
      ) : null}

      {mode === "calendar" ? (
        <YStack gap={CONTENT_GAP}>
          <DiaryCalendar
            year={calendarYear}
            month={calendarMonth}
            summary={calendarData}
            selectedDayKey={selectedDayKey}
            onSelectDay={setSelectedDayKey}
            onChangeMonth={(year, month) => {
              setCalendarYear(year);
              setCalendarMonth(month);
              setSelectedDayKey(null);
            }}
          />
          {selectedDayKey ? (
            <XStack alignItems="center" justifyContent="space-between">
              <Text fontSize={13} fontFamily="$body" fontWeight="700" color={theme.color.val}>
                {new Date(`${selectedDayKey}T00:00:00`).toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </Text>
              <Pressable onPress={() => setSelectedDayKey(null)} hitSlop={8}>
                <Text fontSize={12} fontFamily="$body" fontWeight="600" color={theme.primary.val}>
                  Clear
                </Text>
              </Pressable>
            </XStack>
          ) : (
            <Text fontSize={12} fontFamily="$body" color={theme.colorMuted.val} textAlign="center">
              Tap a day to see its entries.
            </Text>
          )}
        </YStack>
      ) : null}

      {mode === "insights" ? (
        <YStack gap={CONTENT_GAP}>
          <SegmentedControl<InsightsRange>
            options={[
              { value: "7d", label: "Week" },
              { value: "30d", label: "Month" },
              { value: "90d", label: "3 Months" },
            ]}
            value={insightsRange}
            onChange={setInsightsRange}
          />
          {insightsData === undefined ? (
            <YStack gap={12}>
              <Skeleton height={56} borderRadius={14} />
              <Skeleton height={120} borderRadius={16} />
              <Skeleton height={120} borderRadius={16} />
            </YStack>
          ) : (
            <DiaryInsights data={insightsData} />
          )}
        </YStack>
      ) : null}
    </YStack>
  );

  const showList = mode === "entries" || (mode === "calendar" && !!dayRange);

  return (
    <YStack
      flex={1}
      backgroundColor={theme.background.val}
      width="100%"
      maxWidth={isLargeScreen ? 1100 : undefined}
      alignSelf="center"
    >
      <AppList<DiaryListItem>
        data={showList && !isInitialLoading ? entries : []}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <YStack height={12} />}
        ListHeaderComponent={header}
        ListHeaderComponentStyle={{ marginBottom: showList ? CONTENT_GAP : 0 }}
        ListEmptyComponent={
          !showList ? null : isInitialLoading ? (
            <YStack gap={12}>
              <Skeleton height={128} borderRadius={16} />
              <Skeleton height={128} borderRadius={16} />
              <Skeleton height={128} borderRadius={16} />
            </YStack>
          ) : (
            <EmptyState
              icon="book"
              title={
                searchActive
                  ? "No matches"
                  : moodFilter
                    ? "No entries with this mood"
                    : dayRange
                      ? "No entries on this day"
                      : "No diary entries yet"
              }
              description={
                searchActive
                  ? "Try a different phrase."
                  : moodFilter || dayRange
                    ? "Adjust the filters to see more entries."
                    : "Start speaking or typing to create your first entry."
              }
            />
          )
        }
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.4}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: 10,
          paddingBottom: tabBarPadding,
          paddingHorizontal: spacing.lg,
        }}
      />
    </YStack>
  );
}
