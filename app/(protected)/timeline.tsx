import React, { useMemo, useRef, useState } from "react";
import { SectionList } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { useQuery } from "convex/react";
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
  const listRef = useRef<SectionList<any>>(null);

  const memoryResult = useQuery(api.memories.list, token ? { token, limit: 100 } : "skip");
  const allMemories = memoryResult?.memories ?? [];

  const sorted = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = query
      ? allMemories.filter(
          (memory) =>
            (memory.title ?? "").toLowerCase().includes(query) ||
            (memory.content ?? "").toLowerCase().includes(query),
        )
      : allMemories;

    return [...filtered].sort((a, b) => b._creationTime - a._creationTime);
  }, [allMemories, searchQuery]);

  const sections = useMemo(
    () => Object.entries(groupByDate(sorted as any)).map(([title, data]) => ({ title, data })),
    [sorted],
  );

  return (
    <AppScreen
      showBack
      title="Timeline"
      subtitle="Browse your archive chronologically and jump between meaningful time periods."
      contentWidth="workspace"
      noScroll
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
                  Showing matches for “{searchQuery.trim()}”.
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
                  people: [],
                  locations: [],
                  entryKind: "memory",
                  schedule: undefined,
                  reminderDate: undefined,
                  isRecurring: false,
                  recurrenceType: undefined,
                  importance: "normal" as const,
                  linkedUrls: [],
                  extractedActions: [],
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
              placeholder="Search your timeline..."
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
