import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SectionList, type SectionListData, Share, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import { Text, XStack, YStack } from "tamagui";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { MemoryCard } from "@/components/MemoryCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { SearchBar } from "@/components/ui/SearchBar";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { AppScreen, SectionCard } from "@/components/ui/AppScreen";
import { ResponsiveStatGrid, WorkspaceSplit } from "@/components/ui/Responsive";
import { PressableScale } from "@/components/ui/PressableScale";
import { withAlpha } from "@/components/ui/themeHelpers";
import { alphaGradients } from "@/constants/themePalettes";
import { useAppConfirm } from "@/components/ui/confirm/AppConfirmProvider";
import { useAppToast } from "@/components/ui/toast";
import type { MemoryNote } from "@/types/memory";
import { CONTENT_GAP, spacing } from "@/constants/uiTokens";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import { useTabBarBottomPadding } from "@/hooks/useTabBarBottomPadding";
import { useAppTheme } from "@/hooks/useAppTheme";
import { PrimaryPageHeader } from "@/components/navigation/PrimaryPageHeader";
import { getReminderDate, inferMemoryEntryKind, isReminder } from "@/types/memoryKind";
import { useUIStore } from "@/store/ui";

/**
 * Day row height. The fade spans the whole row rather than sitting below a
 * solid band, so the label reads against the strongest part of the ramp and
 * rows scrolling under dissolve across the full height.
 */
const STICKY_HEADER_HEIGHT = 40;
/**
 * Peak opacity of the row's wash, 0-255. No blur is available inside a list, so
 * rows show through by raw alpha — below ~0xD0 the label stops being legible
 * against a card passing behind it.
 */
const STICKY_HEADER_ALPHA = 0xf2;
/**
 * Holds the ramp near peak across the label before it decays, so the row reads
 * as a wash rather than an immediate falloff. Even spacing would put the label
 * halfway down the curve.
 */
const STICKY_HEADER_FADE_STOPS = [0, 0.3, 0.42, 0.52, 0.62, 0.72, 0.82, 0.91, 1] as [
  number,
  number,
  ...number[],
];

type TimelineMemory = {
  _id: string;
  _creationTime: number;
  title?: string;
  content?: string;
  people?: string[];
  locations?: string[];
  [key: string]: unknown;
};

/** Stable identity: `?? []` inline would re-trigger every downstream memo. */
const EMPTY_MEMORIES: TimelineMemory[] = [];

const LIST_STYLE = { width: "100%", alignSelf: "center" } as const;

/** Hoisted so the list doesn't remount every separator on each render. */
const ItemSeparator = () => <YStack height={10} />;

const keyExtractor = (item: MemoryNote) => item.id;

/** Rescales a hex alpha pair so a full ramp can peak below fully opaque. */
const scaleAlpha = (alpha: string, peak: number) =>
  Math.round((parseInt(alpha, 16) * peak) / 255)
    .toString(16)
    .padStart(2, "0");

type TimelineSection = { title: string; data: MemoryNote[] };

/**
 * Convex row -> the shape MemoryCard expects. Run once per row inside a memo,
 * so MemoryCard's React.memo actually holds across renders.
 *
 * The row is loosely typed (Convex returns an open record here), so the cast
 * stays confined to this one function instead of leaking into the list.
 */
function toMemoryNote(row: TimelineMemory): MemoryNote {
  const item = row as any;
  const createdAt = new Date(row._creationTime).toISOString();
  return {
    ...item,
    id: row._id,
    userId: "" as never,
    people: row.people ?? [],
    locations: row.locations ?? [],
    entryKind: inferMemoryEntryKind(item),
    schedule: item.schedule,
    reminderDate: getReminderDate(item),
    isRecurring: item.schedule?.isRecurring ?? false,
    recurrenceType: item.schedule?.recurrenceType,
    importance: item.importance ?? "normal",
    linkedUrls: item.linkedUrls ?? [],
    extractedActions: item.extractedActions ?? [],
    createdAt,
    updatedAt: createdAt,
  } as MemoryNote;
}

function TimelineWorkspace({
  children,
  aside,
}: {
  children: React.ReactNode;
  aside: React.ReactNode;
}) {
  const { isExpanded } = useResponsiveLayout();
  if (!isExpanded) return children;
  return (
    <YStack flex={1} width="100%" paddingHorizontal={spacing.lg}>
      <WorkspaceSplit aside={aside} asideWidth={300} splitAt={760} gap={spacing.lg} fill>
        {children}
      </WorkspaceSplit>
    </YStack>
  );
}

function groupByDate(memories: readonly TimelineMemory[]) {
  const now = new Date();
  const today = now.toDateString();
  const yesterday = new Date(now.getTime() - 86400000).toDateString();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);

  const groups: Record<string, TimelineMemory[]> = {};

  memories.forEach((m) => {
    const d = new Date(m._creationTime);
    const ds = d.toDateString();
    let label: string;
    if (ds === today) label = "Today";
    else if (ds === yesterday) label = "Yesterday";
    else if (d >= weekAgo) label = "This Week";
    else
      label = d.toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
      });
    if (!groups[label]) groups[label] = [];
    groups[label].push(m);
  });

  return groups;
}

export default function TimelineScreen() {
  const theme = useAppTheme();
  const { token } = useAuth();
  const tabBarPadding = useTabBarBottomPadding();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [semanticResults, setSemanticResults] = useState<TimelineMemory[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const listRef = useRef<SectionList<MemoryNote, TimelineSection>>(null);
  const requestId = useRef(0);
  const semanticSearch = useAction(api.actions.semanticSearch.search);
  const { confirm } = useAppConfirm();
  const { showToast } = useAppToast();
  const openEditMemory = useUIStore((state) => state.openEditMemory);
  const completeMemory = useMutation(api.memories.complete);
  const deleteMemory = useMutation(api.memories.remove);
  const createShareLink = useMutation(api.sharing.createShareLink);
  const triggerReminderSync = useMutation(api.integrations.triggerReminderSync);
  const removeReminderSync = useMutation(api.integrations.removeReminderSync);

  const memoryResult = useQuery(api.memories.listAll, token ? { token, limit: 500 } : "skip");
  const allMemories = (memoryResult ?? EMPTY_MEMORIES) as TimelineMemory[];

  const handleComplete = useCallback(
    async (memory: MemoryNote) => {
      if (!token) return;
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      try {
        await completeMemory({ token, id: memory.id as Id<"memories"> });
        showToast({ title: "Marked complete", tone: "success" });
      } catch {
        showToast({ title: "Couldn't complete — try again", tone: "error" });
      }
    },
    [completeMemory, showToast, token],
  );

  const handleDelete = useCallback(
    async (memory: MemoryNote) => {
      if (!token) return;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      const confirmed = await confirm({
        title: "Delete Memory",
        message: "This will move the memory to trash.",
        confirmLabel: "Delete",
        tone: "destructive",
        icon: "trash-2",
      });
      if (!confirmed) return;
      try {
        await deleteMemory({ token, id: memory.id as Id<"memories"> });
        showToast({ title: "Memory deleted", tone: "success" });
      } catch {
        showToast({ title: "Couldn't delete — try again", tone: "error" });
      }
    },
    [confirm, deleteMemory, showToast, token],
  );

  const handleShare = useCallback(
    async (memory: MemoryNote) => {
      if (!token) return;
      try {
        const shareToken = await createShareLink({ token, memoryId: memory.id as Id<"memories"> });
        const url = Linking.createURL(`/shared/${shareToken}`);
        await Share.share({ message: url, url });
      } catch {
        showToast({ title: "Couldn't create share link — try again", tone: "error" });
      }
    },
    [createShareLink, showToast, token],
  );

  const handleTriggerSync = useCallback(
    async (memory: MemoryNote) => {
      if (!token) return;
      try {
        const result = await triggerReminderSync({ token, memoryId: memory.id as Id<"memories"> });
        showToast({ title: result.message, tone: result.queued ? "success" : "info" });
      } catch {
        showToast({ title: "Couldn't trigger Google sync", tone: "error" });
      }
    },
    [showToast, token, triggerReminderSync],
  );

  const handleRemoveSync = useCallback(
    async (memory: MemoryNote) => {
      if (!token) return;
      const confirmed = await confirm({
        title: "Remove Google sync",
        message:
          "This removes linked Google Calendar event data for this reminder and clears local sync state.",
        confirmLabel: "Remove sync",
        tone: "destructive",
        icon: "link-2",
      });
      if (!confirmed) return;
      try {
        const result = await removeReminderSync({ token, memoryId: memory.id as Id<"memories"> });
        showToast({ title: result.message, tone: result.removed ? "success" : "info" });
      } catch {
        showToast({ title: "Couldn't remove Google sync", tone: "error" });
      }
    },
    [confirm, removeReminderSync, showToast, token],
  );

  useEffect(() => {
    requestId.current += 1;
    setSemanticResults(null);
    const timer = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (!token || debouncedQuery.length < 3) {
      setSemanticResults(null);
      setIsSearching(false);
      return;
    }

    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;
    setIsSearching(true);
    semanticSearch({ token, query: debouncedQuery, limit: 16 })
      .then((result) => {
        if (requestId.current === currentRequest) {
          setSemanticResults(result.results as TimelineMemory[]);
        }
      })
      .catch(() => {
        if (requestId.current === currentRequest) setSemanticResults(null);
      })
      .finally(() => {
        if (requestId.current === currentRequest) setIsSearching(false);
      });
  }, [debouncedQuery, semanticSearch, token]);

  const trimmedQuery = useMemo(() => searchQuery.trim(), [searchQuery]);

  const sorted = useMemo(() => {
    const query = trimmedQuery.toLowerCase();
    if (!query) return [...allMemories].sort((a, b) => b._creationTime - a._creationTime);

    const matches = new Map<string, TimelineMemory>();
    allMemories.forEach((memory) => {
      const exact =
        (memory.title ?? "").toLowerCase().includes(query) ||
        (memory.content ?? "").toLowerCase().includes(query) ||
        (memory.people ?? []).some((person) => person.toLowerCase().includes(query)) ||
        (memory.locations ?? []).some((location) => location.toLowerCase().includes(query));
      if (exact) matches.set(memory._id, memory);
    });
    semanticResults?.forEach((memory) => matches.set(memory._id, memory));

    return Array.from(matches.values()).sort((a, b) => b._creationTime - a._creationTime);
  }, [allMemories, semanticResults, trimmedQuery]);

  const sectionFadeColors = useMemo(
    () =>
      alphaGradients.surfaceFadeOut.map((stop) =>
        withAlpha(theme.background.val, scaleAlpha(stop, STICKY_HEADER_ALPHA)),
      ) as [string, string, ...string[]],
    [theme.background.val],
  );

  // Rows are converted here, not in renderItem: MemoryCard is React.memo, and
  // rebuilding the object per render gave it a new reference every time.
  const sections = useMemo<TimelineSection[]>(
    () =>
      Object.entries(groupByDate(sorted)).map(([title, rows]) => ({
        title,
        data: rows.map(toMemoryNote),
      })),
    [sorted],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: MemoryNote; index: number }) => (
      <MemoryCard
        memory={item}
        index={index}
        onPress={() => openEditMemory(item)}
        onComplete={isReminder(item) ? () => handleComplete(item) : undefined}
        onDelete={() => handleDelete(item)}
        onShare={() => handleShare(item)}
        onTriggerSync={isReminder(item) ? () => handleTriggerSync(item) : undefined}
        onRemoveSync={isReminder(item) ? () => handleRemoveSync(item) : undefined}
      />
    ),
    [
      handleComplete,
      handleDelete,
      handleRemoveSync,
      handleShare,
      handleTriggerSync,
      openEditMemory,
    ],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: SectionListData<MemoryNote, TimelineSection> }) => (
      // The fade belongs to the day row, not to the list: sticky headers draw
      // above list content, so the ramp dissolves the rows passing under it and
      // pins/moves with the label for free.
      <YStack height={STICKY_HEADER_HEIGHT} justifyContent="flex-start" paddingTop={10}>
        <LinearGradient
          colors={sectionFadeColors}
          locations={STICKY_HEADER_FADE_STOPS}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <SectionLabel marginBottom={0}>{section.title}</SectionLabel>
      </YStack>
    ),
    [sectionFadeColors],
  );

  const contentContainerStyle = useMemo(
    () => ({ paddingHorizontal: spacing.lg, paddingBottom: tabBarPadding }),
    [tabBarPadding],
  );

  return (
    <AppScreen
      contentWidth="workspace"
      noScroll
      safeTop={false}
      // The day row carries its own top padding; the default gap doubles it.
      bodyGap={0}
      hero={
        <>
          <PrimaryPageHeader
            eyebrow="Memory archive"
            title="Timeline"
            description="Browse your archive chronologically and jump between meaningful time periods."
          />
          {/* Static, above the list: as a list header it scrolled into the top fade. */}
          <SearchBar
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Recall a memory, person, place, or idea..."
            isSearching={isSearching}
          />
        </>
      }
    >
      <TimelineWorkspace
        aside={
          <YStack gap={12}>
            <SectionCard
              title="Archive summary"
              eyebrow="Current view"
              density="compact"
              emphasis="quiet"
            >
              <ResponsiveStatGrid
                maximumColumns={2}
                minimumColumnWidth={105}
                items={[
                  { label: "Memories", value: sorted.length },
                  { label: "Periods", value: sections.length },
                ]}
              />
              {searchQuery.trim() ? (
                <Text fontSize={12} lineHeight={18} color={theme.colorMuted.val}>
                  {isSearching
                    ? `Finding related memories for “${searchQuery.trim()}”…`
                    : `Showing keyword and related matches for “${searchQuery.trim()}”.`}
                </Text>
              ) : null}
            </SectionCard>
            {sections.length > 0 ? (
              <SectionCard title="Jump to" density="compact" emphasis="quiet">
                <YStack gap={6}>
                  {sections.slice(0, 8).map((section, sectionIndex) => (
                    <PressableScale
                      key={section.title}
                      onPress={() =>
                        listRef.current?.scrollToLocation({
                          sectionIndex,
                          itemIndex: 0,
                          animated: true,
                        })
                      }
                    >
                      <XStack
                        alignItems="center"
                        justifyContent="space-between"
                        gap={8}
                        paddingVertical={5}
                      >
                        <Text flex={1} fontSize={12} fontWeight="600" color={theme.color.val}>
                          {section.title}
                        </Text>
                        <Text fontSize={11} color={theme.colorMuted.val}>
                          {section.data.length}
                        </Text>
                      </XStack>
                    </PressableScale>
                  ))}
                </YStack>
              </SectionCard>
            ) : null}
          </YStack>
        }
      >
        <SectionList
          ref={listRef}
          sections={sections}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          ItemSeparatorComponent={ItemSeparator}
          ListEmptyComponent={
            // The screen's body gap is 0 because the day row supplies its own
            // leading space; with no rows there is nothing to supply it.
            <YStack paddingTop={CONTENT_GAP}>
              <EmptyState
                icon="clock"
                title={trimmedQuery ? "No matching memories" : "No timeline"}
                description={
                  trimmedQuery
                    ? "Try a different word or phrase."
                    : "Create memories to see them on your timeline."
                }
              />
            </YStack>
          }
          stickySectionHeadersEnabled
          showsVerticalScrollIndicator={false}
          style={LIST_STYLE}
          contentContainerStyle={contentContainerStyle}
        />
      </TimelineWorkspace>
    </AppScreen>
  );
}
