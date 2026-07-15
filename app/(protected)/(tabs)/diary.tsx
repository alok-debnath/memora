import React, { useCallback, useMemo, useState } from "react";
import { Pressable } from "react-native";
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
import { useAppRouter as useRouter } from "@/hooks/useAppRouter";
import { useAppConfirm } from "@/components/ui/confirm/AppConfirmProvider";
import { SectionCard } from "@/components/ui/AppScreen";
import { ResponsiveStatGrid, WorkspaceSplit } from "@/components/ui/Responsive";
import { SearchBar } from "@/components/ui/SearchBar";
import { SelectionTabs } from "@/components/ui/SelectionTabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { DiaryComposer } from "@/components/diary/DiaryComposer";
import { DiaryListCard } from "@/components/diary/DiaryListCard";
import { DiaryCalendar } from "@/components/diary/DiaryCalendar";
import { DiaryInsights } from "@/components/diary/DiaryInsights";
import type { DiaryListItem } from "@/components/diary/types";
import { moodIcons, moodLabels, type Mood } from "@/constants/categories";
import { CONTENT_GAP, layout, spacing } from "@/constants/uiTokens";
import { PrimaryPageHeader } from "@/components/navigation/PrimaryPageHeader";
import { FilterChipGroup, type FilterChipOption } from "@/components/ui/FilterChipGroup";
import { AppIconButton } from "@/components/ui/AppIconButton";

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
  type MoodFilterValue = Mood | "all";
  const options: FilterChipOption<MoodFilterValue>[] = [
    { value: "all", label: "All moods", icon: "circle", color: theme.primary.val },
    ...ALL_MOODS.map((mood) => ({
      value: mood,
      label: moodLabels[mood],
      icon: moodIcons[mood],
      color: semantic.mood[mood],
    })),
  ];

  return (
    <FilterChipGroup
      options={options}
      value={selected ?? "all"}
      onChange={(next) => onSelect(next === "all" || next === null ? null : next)}
      scrollable
      size="compact"
      accessibilityLabel="Filter journal by mood"
    />
  );
}

export default function DiaryScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const { confirm } = useAppConfirm();
  const { token } = useAuth();
  const tabBarPadding = useTabBarBottomPadding();

  const [mode, setMode] = useState<DiaryMode>("entries");
  const [showBrowseTools, setShowBrowseTools] = useState(false);
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
      <PrimaryPageHeader
        eyebrow="Daily reflection"
        title="Journal"
        description="A quiet place to write and revisit your days."
      />

      <SelectionTabs<DiaryMode>
        options={[
          { value: "entries", label: "Entries" },
          { value: "calendar", label: "Calendar" },
          { value: "insights", label: "Patterns" },
        ]}
        value={mode}
        onChange={setMode}
      />

      {mode === "entries" ? (
        <YStack gap={CONTENT_GAP}>
          <SectionCard title="New reflection" density="compact" emphasis="primary">
            <DiaryComposer onSubmit={handleSubmit} isSaving={isSaving} />
          </SectionCard>

          <XStack alignItems="center" justifyContent="space-between" gap={12}>
            <YStack gap={2}>
              <Text fontSize={16} fontFamily="$heading" fontWeight="700" color={theme.color.val}>
                Recent reflections
              </Text>
              <Text fontSize={12} color={theme.colorMuted.val}>
                Your newest entries, in one calm stream
              </Text>
            </YStack>
            <AppIconButton
              icon={showBrowseTools ? "x" : "filter"}
              label={showBrowseTools ? "Hide journal filters" : "Filter journal entries"}
              onPress={() => setShowBrowseTools((visible) => !visible)}
              variant={showBrowseTools || moodFilter || searchActive ? "soft" : "ghost"}
            />
          </XStack>

          {showBrowseTools ? (
            <SectionCard title="Find an entry" density="compact" emphasis="quiet">
              <SearchBar
                value={searchText}
                onChangeText={setSearchText}
                placeholder="Search your diary..."
                isSearching={searchActive && searchResults === undefined}
              />
              <MoodFilterRow selected={moodFilter} onSelect={setMoodFilter} />
            </SectionCard>
          ) : null}
        </YStack>
      ) : null}

      {mode === "calendar" ? (
        <WorkspaceSplit
          splitAt={760}
          asideWidth={300}
          aside={
            <SectionCard
              title={selectedDayKey ? "Selected day" : "Choose a day"}
              eyebrow="Calendar context"
              density="compact"
              emphasis="quiet"
            >
              {selectedDayKey ? (
                <YStack gap={10}>
                  <Text fontSize={15} lineHeight={21} fontWeight="700" color={theme.color.val}>
                    {new Date(`${selectedDayKey}T00:00:00`).toLocaleDateString(undefined, {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    })}
                  </Text>
                  <ResponsiveStatGrid
                    maximumColumns={1}
                    items={[{ label: "Entries on this day", value: entries.length }]}
                  />
                  <Pressable onPress={() => setSelectedDayKey(null)} hitSlop={8}>
                    <Text fontSize={12} fontWeight="700" color={theme.primary.val}>
                      Clear selection
                    </Text>
                  </Pressable>
                </YStack>
              ) : (
                <Text fontSize={12} lineHeight={18} color={theme.colorMuted.val}>
                  Days with entries carry a mood marker. Select one to open its reflections below.
                </Text>
              )}
            </SectionCard>
          }
        >
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
        </WorkspaceSplit>
      ) : null}

      {mode === "insights" ? (
        <YStack gap={CONTENT_GAP}>
          <SectionCard
            title="Analysis window"
            eyebrow="Patterns over time"
            density="compact"
            emphasis="quiet"
          >
            <SelectionTabs<InsightsRange>
              options={[
                { value: "7d", label: "Week" },
                { value: "30d", label: "Month" },
                { value: "90d", label: "3 Months" },
              ]}
              value={insightsRange}
              onChange={setInsightsRange}
            />
          </SectionCard>
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
      maxWidth={layout.standardMaxWidth}
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
