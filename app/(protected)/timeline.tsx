import React, { useMemo, useState } from "react";
import { YStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { MemoryCard } from "@/components/MemoryCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { SearchBar } from "@/components/ui/SearchBar";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { AppScreen } from "@/components/ui/AppScreen";
import type { MemoryNote } from "@/types/memory";

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

  const groups = useMemo(() => groupByDate(sorted as any), [sorted]);
  const sectionCount = Object.keys(groups).length;

  return (
    <AppScreen showBack title="Timeline">
      <SearchBar
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Search your timeline..."
      />

      {sectionCount === 0 ? (
        <EmptyState
          icon="clock"
          title="No timeline"
          description="Create memories to see them on your timeline."
        />
      ) : (
        Object.entries(groups).map(([label, items]) => (
          <YStack key={label}>
            <SectionLabel>{label}</SectionLabel>
            <YStack gap={10}>
              {items.map((m, i: number) => (
                <MemoryCard
                  key={m._id}
                  memory={
                    {
                      ...m,
                      id: m._id,
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
                      createdAt: new Date(m._creationTime).toISOString(),
                      updatedAt: new Date(m._creationTime).toISOString(),
                    } as MemoryNote
                  }
                  index={i}
                />
              ))}
            </YStack>
          </YStack>
        ))
      )}
    </AppScreen>
  );
}
