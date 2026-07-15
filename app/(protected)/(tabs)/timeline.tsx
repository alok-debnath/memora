import React, { useEffect, useMemo, useRef, useState } from "react";
import { SectionList } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { MemoryCard } from "@/components/MemoryCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { SearchBar } from "@/components/ui/SearchBar";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { AppScreen, SectionCard } from "@/components/ui/AppScreen";
import { ResponsiveStatGrid, WorkspaceSplit } from "@/components/ui/Responsive";
import { PressableScale } from "@/components/ui/PressableScale";
import type { MemoryNote } from "@/types/memory";
import { spacing } from "@/constants/uiTokens";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import { useAppTheme } from "@/hooks/useAppTheme";
import { PrimaryPageHeader } from "@/components/navigation/PrimaryPageHeader";
import { getReminderDate, inferMemoryEntryKind } from "@/types/memoryKind";

type TimelineMemory = {
  _id: string;
  _creationTime: number;
  title?: string;
  content?: string;
  people?: string[];
  locations?: string[];
  [key: string]: unknown;
};

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

function groupByDate(
  memories: Array<{
    _id: string;
    title: string;
    content: string;
    _creationTime: number;
  }>,
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
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [semanticResults, setSemanticResults] = useState<TimelineMemory[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const listRef = useRef<SectionList<any>>(null);
  const requestId = useRef(0);
  const semanticSearch = useAction(api.actions.semanticSearch.search);

  const memoryResult = useQuery(api.memories.listAll, token ? { token, limit: 500 } : "skip");
  const allMemories = (memoryResult ?? []) as TimelineMemory[];

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

  const sorted = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
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
  }, [allMemories, searchQuery, semanticResults]);

  const sections = useMemo(
    () => Object.entries(groupByDate(sorted as any)).map(([title, data]) => ({ title, data })),
    [sorted],
  );

  return (
    <AppScreen
      contentWidth="workspace"
      noScroll
      safeTop={false}
      hero={
        <PrimaryPageHeader
          eyebrow="Memory archive"
          title="Timeline"
          description="Browse your archive chronologically and jump between meaningful time periods."
        />
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
          keyExtractor={(item) => String(item._id)}
          renderItem={({ item, index }) => (
            <MemoryCard
              memory={
                {
                  ...item,
                  id: item._id,
                  userId: "" as never,
                  people: item.people ?? [],
                  locations: item.locations ?? [],
                  entryKind: inferMemoryEntryKind(item),
                  schedule: item.schedule,
                  reminderDate: getReminderDate(item),
                  isRecurring: item.schedule?.isRecurring ?? false,
                  recurrenceType: item.schedule?.recurrenceType,
                  importance: item.importance ?? "normal",
                  linkedUrls: item.linkedUrls ?? [],
                  extractedActions: item.extractedActions ?? [],
                  createdAt: new Date(item._creationTime).toISOString(),
                  updatedAt: new Date(item._creationTime).toISOString(),
                } as MemoryNote
              }
              index={index}
            />
          )}
          renderSectionHeader={({ section }) => <SectionLabel>{section.title}</SectionLabel>}
          ItemSeparatorComponent={() => <YStack height={10} />}
          SectionSeparatorComponent={() => <YStack height={spacing.sm} />}
          ListHeaderComponent={
            <SearchBar
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Recall a memory, person, place, or idea..."
              isSearching={isSearching}
            />
          }
          ListHeaderComponentStyle={{ marginBottom: spacing.md }}
          ListEmptyComponent={
            <EmptyState
              icon="clock"
              title={searchQuery.trim() ? "No matching memories" : "No timeline"}
              description={
                searchQuery.trim()
                  ? "Try a different word or phrase."
                  : "Create memories to see them on your timeline."
              }
            />
          }
          stickySectionHeadersEnabled
          showsVerticalScrollIndicator={false}
          style={{ width: "100%", alignSelf: "center" }}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xl }}
        />
      </TimelineWorkspace>
    </AppScreen>
  );
}
