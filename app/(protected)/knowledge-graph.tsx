import React, { useMemo, useState } from "react";
import { ScrollView, Pressable } from "react-native";
import { XStack, YStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import { Feather } from "@expo/vector-icons";
import Svg, { Circle, Line, G, Text as SvgText } from "react-native-svg";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import { useWindowDimensions } from "react-native";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { getReminderDate } from "@/types/memoryKind";
import { EmptyState } from "@/components/ui/EmptyState";
import { SearchBar } from "@/components/ui/SearchBar";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { MorePageScaffold } from "@/components/ui/MorePageScaffold";

// ─── Types ────────────────────────────────────────────────────────────────────

type GraphMode = "memories" | "topics";

type TopicDoc = {
  _id: string;
  name: string;
  slug: string;
  icon?: string | null;
  color?: string | null;
  description?: string | null;
  memoryCount: number;
  relatedTopics?: Array<{ topicId: string; similarity: number }>;
};

interface MemoryNode {
  id: string;
  label: string;
  topicColor: string;
  primaryTopicId?: string;
  connectionCount: number;
  x: number; y: number; vx: number; vy: number;
}

interface TopicNode {
  id: string;
  label: string;
  icon?: string;
  color: string;
  memoryCount: number;
  description?: string;
  radius: number;
  x: number; y: number; vx: number; vy: number;
}

interface MemoryEdge { source: string; target: string; type: "topic" | "person" }
interface TopicEdge { source: string; target: string; similarity: number }

// ─── Memory Graph Builder ─────────────────────────────────────────────────────

function buildMemoryGraph(
  memories: Array<{
    _id: string; title: string; people: string[];
    primaryTopicId?: string; topicIds?: string[];
  }>,
  topicColorMap: Record<string, string>,
  fallbackColor: string,
  filterTopicId: string | null
): { nodes: MemoryNode[]; edges: MemoryEdge[] } {
  const source = filterTopicId
    ? memories.filter(
        (m) =>
          m.primaryTopicId === filterTopicId ||
          (m.topicIds ?? []).includes(filterTopicId)
      )
    : memories;
  const limited = source.slice(0, 40);

  const edges: MemoryEdge[] = [];
  const connectionCounts: Record<string, number> = {};
  for (let i = 0; i < limited.length; i++) {
    for (let j = i + 1; j < limited.length; j++) {
      const a = limited[i];
      const b = limited[j];
      const sharedPerson = (a.people ?? []).some((p) => (b.people ?? []).includes(p));
      const sharedTopic =
        a.primaryTopicId && b.primaryTopicId && a.primaryTopicId === b.primaryTopicId;
      const overlapping = (a.topicIds ?? []).some((t) => (b.topicIds ?? []).includes(t));
      if (sharedTopic || overlapping) {
        edges.push({ source: a._id, target: b._id, type: "topic" });
        connectionCounts[a._id] = (connectionCounts[a._id] ?? 0) + 1;
        connectionCounts[b._id] = (connectionCounts[b._id] ?? 0) + 1;
      } else if (sharedPerson) {
        edges.push({ source: a._id, target: b._id, type: "person" });
        connectionCounts[a._id] = (connectionCounts[a._id] ?? 0) + 1;
        connectionCounts[b._id] = (connectionCounts[b._id] ?? 0) + 1;
      }
    }
  }

  const nodes: MemoryNode[] = limited.map((m, i) => ({
    id: m._id,
    label: (m.title ?? "Untitled").slice(0, 14),
    topicColor: topicColorMap[m.primaryTopicId ?? ""] ?? fallbackColor,
    primaryTopicId: m.primaryTopicId,
    connectionCount: connectionCounts[m._id] ?? 0,
    x: 200 + Math.cos((i / limited.length) * Math.PI * 2) * (90 + (i % 3) * 22),
    y: 200 + Math.sin((i / limited.length) * Math.PI * 2) * (90 + (i % 3) * 22),
    vx: 0, vy: 0,
  }));

  return { nodes, edges };
}

// ─── Topic Graph Builder ──────────────────────────────────────────────────────

function buildTopicGraph(topics: TopicDoc[]): { nodes: TopicNode[]; edges: TopicEdge[] } {
  if (topics.length === 0) return { nodes: [], edges: [] };
  const maxCount = Math.max(...topics.map((t) => t.memoryCount), 1);

  const nodes: TopicNode[] = topics.map((t, i) => ({
    id: t._id,
    label: t.name,
    icon: t.icon ?? undefined,
    color: t.color ?? "#6B7280",
    memoryCount: t.memoryCount,
    description: t.description ?? undefined,
    radius: 16 + Math.sqrt(t.memoryCount / maxCount) * 22,
    x: 200 + Math.cos((i / topics.length) * Math.PI * 2) * 110,
    y: 200 + Math.sin((i / topics.length) * Math.PI * 2) * 110,
    vx: 0, vy: 0,
  }));

  const edges: TopicEdge[] = [];
  const seen = new Set<string>();
  for (const t of topics) {
    for (const rel of t.relatedTopics ?? []) {
      const key = [t._id, rel.topicId].sort().join(":");
      if (seen.has(key)) continue;
      seen.add(key);
      if (rel.similarity > 0.5) {
        edges.push({ source: t._id, target: rel.topicId, similarity: rel.similarity });
      }
    }
  }

  return { nodes, edges };
}

// ─── Force Simulation (generic) ──────────────────────────────────────────────

function simulate<N extends { x: number; y: number; vx: number; vy: number }>(
  nodes: N[],
  edges: Array<{ source: string; target: string }>,
  getId: (n: N) => string,
  getRadius: (n: N) => number,
  centerX: number,
  centerY: number,
  iterations = 50
): N[] {
  const nodeMap = new Map(nodes.map((n) => [getId(n), n]));
  for (let iter = 0; iter < iterations; iter++) {
    // Repulsion
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[j].x - nodes[i].x;
        const dy = nodes[j].y - nodes[i].y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const minDist = getRadius(nodes[i]) + getRadius(nodes[j]) + 18;
        const force = (minDist * minDist) / (dist * dist) * 0.9;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        nodes[i].vx -= fx; nodes[i].vy -= fy;
        nodes[j].vx += fx; nodes[j].vy += fy;
      }
    }
    // Spring attraction along edges
    for (const e of edges) {
      const s = nodeMap.get(e.source);
      const t = nodeMap.get(e.target);
      if (!s || !t) continue;
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const rest = getRadius(s) + getRadius(t) + 50;
      const strength = "similarity" in e ? (e as any).similarity * 0.022 : 0.016;
      const force = (dist - rest) * strength;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      s.vx += fx; s.vy += fy;
      t.vx -= fx; t.vy -= fy;
    }
    // Gravity toward center
    for (const n of nodes) {
      n.vx += (centerX - n.x) * 0.003;
      n.vy += (centerY - n.y) * 0.003;
      n.vx *= 0.84; n.vy *= 0.84;
      n.x += n.vx; n.y += n.vy;
    }
  }
  return nodes;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function KnowledgeGraphScreen() {
  const theme = useAppTheme();
  const { width, height } = useWindowDimensions();
  const { token } = useAuth();

  const [mode, setMode] = useState<GraphMode>("memories");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filterTopicId, setFilterTopicId] = useState<string | null>(null);

  const memoryResult = useQuery(api.memories.list, token ? { token, limit: 100 } : "skip");
  const rawMemories = (memoryResult?.memories ?? []) as Array<{
    _id: Id<"memories">; title: string; content: string;
    primaryTopicId?: string; topicIds?: string[]; people: string[];
    mood?: string; reminderDate?: string; entryKind?: "memory" | "reminder";
    schedule?: { dueAt: string; isRecurring: boolean; recurrenceType?: "daily" | "weekly" | "monthly" | "yearly" };
  }>;
  const topics = (useQuery(api.userTopics.list, token ? { token } : "skip") ?? []) as TopicDoc[];

  const topicColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const t of topics) if (t.color) map[t._id] = t.color;
    return map;
  }, [topics]);

  const topicById = useMemo(() => {
    const map: Record<string, typeof topics[0]> = {};
    for (const t of topics) map[t._id] = t;
    return map;
  }, [topics]);

  const filteredMemories = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rawMemories;
    return rawMemories.filter((m) =>
      [m.title, m.content, ...(m.people ?? [])].join(" ").toLowerCase().includes(q)
    );
  }, [rawMemories, query]);

  const svgWidth = Math.max(width - 32, 320);
  const svgHeight = Math.max(height * 0.52, 300);
  const cx = svgWidth / 2;
  const cy = svgHeight / 2;

  const memoryGraph = useMemo(() => {
    if (mode !== "memories") return null;
    const base = buildMemoryGraph(filteredMemories, topicColorMap, theme.primary.val, filterTopicId);
    return { ...base, nodes: simulate(base.nodes, base.edges, (n) => n.id, () => 13, cx, cy) };
  }, [filteredMemories, topicColorMap, theme.primary.val, filterTopicId, mode, cx, cy]);

  const topicGraph = useMemo(() => {
    if (mode !== "topics") return null;
    const activeTopic = topics.filter((t) => t.memoryCount > 0);
    const base = buildTopicGraph(activeTopic);
    return { ...base, nodes: simulate(base.nodes, base.edges, (n) => n.id, (n) => n.radius, cx, cy) };
  }, [topics, mode, cx, cy]);

  const selectedMemory = mode === "memories" && selectedId
    ? rawMemories.find((m) => m._id === selectedId)
    : null;
  const selectedTopic = mode === "topics" && selectedId
    ? topics.find((t) => t._id === selectedId)
    : null;

  const activeGraph = mode === "memories" ? memoryGraph : topicGraph;
  const nodeCount = activeGraph?.nodes.length ?? 0;
  const edgeCount = activeGraph?.edges.length ?? 0;

  // Compute number of connected components (clusters) for memory graph
  const clusterCount = useMemo(() => {
    if (!memoryGraph) return 0;
    const parent: Record<string, string> = {};
    const find = (x: string): string => {
      if (!parent[x]) parent[x] = x;
      if (parent[x] !== x) parent[x] = find(parent[x]);
      return parent[x];
    };
    const union = (a: string, b: string) => { parent[find(a)] = find(b); };
    for (const n of memoryGraph.nodes) find(n.id);
    for (const e of memoryGraph.edges) union(e.source, e.target);
    return new Set(memoryGraph.nodes.map((n) => find(n.id))).size;
  }, [memoryGraph]);

  const handleNodePress = (id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
  };

  return (
    <MorePageScaffold
      title="Knowledge Graph"
      scrollProps={{ contentContainerStyle: { gap: 12, paddingBottom: 32 } }}
    >
        {/* ── Header ── */}
        <Animated.View entering={FadeInUp.duration(380)}>
          <Card style={{ padding: 18, borderRadius: 24 }}>
            <YStack flex={1} gap={5}>
              <Badge label="Mind Map" color={theme.primary.val} />
              <Text fontSize={26} lineHeight={30} fontFamily="$heading" fontWeight="700" color="$color">
                Knowledge graph
              </Text>
              <Text fontSize={13} lineHeight={19} fontFamily="$body" color="$colorMuted">
                {mode === "memories"
                  ? "Memories linked by shared topics and people."
                  : "Topic clusters derived from your AI taxonomy."}
              </Text>
            </YStack>

            {/* Stats row */}
            <XStack gap={8} marginTop={14}>
              <YStack
                flex={1} alignItems="center" paddingVertical={10} borderRadius={14}
                backgroundColor="$background" borderWidth={1} borderColor="$borderColor" gap={2}
              >
                <Text fontSize={20} fontFamily="$heading" fontWeight="700" color="$color">{nodeCount}</Text>
                <Text fontSize={10} fontFamily="$body" color="$colorMuted">
                  {mode === "memories" ? "memories" : "topics"}
                </Text>
              </YStack>
              <YStack
                flex={1} alignItems="center" paddingVertical={10} borderRadius={14}
                backgroundColor="$background" borderWidth={1} borderColor="$borderColor" gap={2}
              >
                <Text fontSize={20} fontFamily="$heading" fontWeight="700" color="$color">{edgeCount}</Text>
                <Text fontSize={10} fontFamily="$body" color="$colorMuted">connections</Text>
              </YStack>
              {mode === "memories" ? (
                <YStack
                  flex={1} alignItems="center" paddingVertical={10} borderRadius={14}
                  backgroundColor="$background" borderWidth={1} borderColor="$borderColor" gap={2}
                >
                  <Text fontSize={20} fontFamily="$heading" fontWeight="700" color="$color">{clusterCount}</Text>
                  <Text fontSize={10} fontFamily="$body" color="$colorMuted">clusters</Text>
                </YStack>
              ) : (
                <YStack
                  flex={1} alignItems="center" paddingVertical={10} borderRadius={14}
                  backgroundColor="$background" borderWidth={1} borderColor="$borderColor" gap={2}
                >
                  <Text fontSize={20} fontFamily="$heading" fontWeight="700" color="$color">{topics.length}</Text>
                  <Text fontSize={10} fontFamily="$body" color="$colorMuted">total topics</Text>
                </YStack>
              )}
            </XStack>
          </Card>
        </Animated.View>

        {/* ── Mode Selector ── */}
        <SegmentedControl
          options={[
            {
              value: "memories" as const,
              label: "Memory Network",
              icon: <Feather name="share-2" size={13} color={mode === "memories" ? theme.color.val : theme.colorMuted.val} />,
            },
            {
              value: "topics" as const,
              label: "Topic Clusters",
              icon: <Feather name="layers" size={13} color={mode === "topics" ? theme.color.val : theme.colorMuted.val} />,
            },
          ]}
          value={mode}
          onChange={(v) => {
            setMode(v);
            setSelectedId(null);
            setFilterTopicId(null);
          }}
        />

        {/* ── Search ── */}
        {mode === "memories" && (
          <SearchBar value={query} onChangeText={setQuery} placeholder="Search memories..." />
        )}

        {/* ── Topic filter chips (memory mode) ── */}
        {mode === "memories" && topics.length > 0 && (
          <Animated.View entering={FadeIn.duration(300)}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 6, flexDirection: "row", paddingVertical: 2 }}
            >
              <Pressable
                onPress={() => { setFilterTopicId(null); setSelectedId(null); }}
                style={{
                  flexDirection: "row", alignItems: "center", gap: 5,
                  paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
                  backgroundColor: filterTopicId === null ? theme.primary.val : theme.secondary.val,
                  borderWidth: 0.5,
                  borderColor: filterTopicId === null ? theme.primary.val : theme.borderColor.val,
                }}
              >
                <Feather name="grid" size={11} color={filterTopicId === null ? "#fff" : theme.colorMuted.val} />
                <Text fontSize={12} fontFamily="$body" fontWeight="500"
                  color={filterTopicId === null ? "#FFFFFF" : "$colorMuted"}>All</Text>
              </Pressable>
              {topics.filter((t) => t.memoryCount > 0).map((t) => {
                const active = filterTopicId === t._id;
                return (
                  <Pressable
                    key={t._id}
                    onPress={() => { setFilterTopicId(active ? null : t._id); setSelectedId(null); }}
                    style={{
                      flexDirection: "row", alignItems: "center", gap: 5,
                      paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
                      backgroundColor: active ? (t.color ?? theme.primary.val) : theme.secondary.val,
                      borderWidth: 0.5,
                      borderColor: active ? (t.color ?? theme.primary.val) : theme.borderColor.val,
                    }}
                  >
                    <YStack width={7} height={7} borderRadius={4}
                      backgroundColor={active ? "#fff" : (t.color ?? theme.primary.val)} />
                    <Text fontSize={12} fontFamily="$body" fontWeight="500"
                      color={active ? "#FFFFFF" : "$colorMuted"}>{t.name}</Text>
                    <Text fontSize={10} fontFamily="$body"
                      color={active ? "rgba(255,255,255,0.7)" : "$colorMuted"}>{t.memoryCount}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Animated.View>
        )}

        {/* ── Graph Canvas ── */}
        {(mode === "memories" && (memoryGraph?.nodes.length ?? 0) < 2) ||
         (mode === "topics" && topics.filter((t) => t.memoryCount > 0).length < 1) ? (
          <EmptyState
            icon={mode === "memories" ? "share-2" : "layers"}
            title={mode === "memories" ? "Not enough data" : "No topics yet"}
            description={
              mode === "memories"
                ? "Create more memories to see connections."
                : "Keep capturing memories — AI will build your topic map."
            }
          />
        ) : (
          <Animated.View entering={FadeIn.duration(500)}>
            <Card style={{ padding: 8, overflow: "hidden", borderRadius: 20 }}>
              <Svg width={svgWidth} height={svgHeight} style={{ alignSelf: "center" }}>
                {/* Memory Network edges */}
                {mode === "memories" && memoryGraph?.edges.map((e, i) => {
                  const s = memoryGraph.nodes.find((n) => n.id === e.source);
                  const t = memoryGraph.nodes.find((n) => n.id === e.target);
                  if (!s || !t) return null;
                  const color = e.type === "topic" ? (s.topicColor) : theme.colorMuted.val;
                  return (
                    <Line key={i}
                      x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                      stroke={color}
                      strokeWidth={e.type === "topic" ? 1.2 : 0.8}
                      opacity={e.type === "topic" ? 0.35 : 0.2}
                    />
                  );
                })}

                {/* Topic Cluster edges */}
                {mode === "topics" && topicGraph?.edges.map((e, i) => {
                  const s = topicGraph.nodes.find((n) => n.id === e.source);
                  const t = topicGraph.nodes.find((n) => n.id === e.target);
                  if (!s || !t) return null;
                  return (
                    <Line key={i}
                      x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                      stroke={s.color}
                      strokeWidth={1 + e.similarity * 2.5}
                      opacity={0.25 + e.similarity * 0.45}
                      strokeDasharray={e.similarity < 0.75 ? "4 3" : undefined}
                    />
                  );
                })}

                {/* Memory nodes */}
                {mode === "memories" && memoryGraph?.nodes.map((n) => {
                  const isSelected = selectedId === n.id;
                  const dimmed = filterTopicId !== null && n.primaryTopicId !== filterTopicId &&
                    !((rawMemories.find(m => m._id === n.id)?.topicIds ?? []).includes(filterTopicId));
                  const r = isSelected ? 17 : 12 + Math.min(n.connectionCount, 5);
                  return (
                    <G key={n.id} onPress={() => handleNodePress(n.id)}>
                      <Circle cx={n.x} cy={n.y} r={r + 3}
                        fill={n.topicColor} opacity={dimmed ? 0.06 : 0.12} />
                      <Circle cx={n.x} cy={n.y} r={r}
                        fill={n.topicColor}
                        opacity={dimmed ? 0.18 : isSelected ? 1 : 0.82}
                        stroke={isSelected ? "#fff" : "transparent"}
                        strokeWidth={isSelected ? 2 : 0}
                      />
                      {!dimmed && (
                        <SvgText x={n.x} y={n.y + r + 11} fontSize={8}
                          fill={theme.colorMuted.val} textAnchor="middle" fontWeight="500">
                          {n.label}
                        </SvgText>
                      )}
                    </G>
                  );
                })}

                {/* Topic nodes */}
                {mode === "topics" && topicGraph?.nodes.map((n) => {
                  const isSelected = selectedId === n.id;
                  return (
                    <G key={n.id} onPress={() => handleNodePress(n.id)}>
                      <Circle cx={n.x} cy={n.y} r={n.radius + 5}
                        fill={n.color} opacity={0.1} />
                      <Circle cx={n.x} cy={n.y} r={n.radius}
                        fill={n.color}
                        opacity={isSelected ? 0.95 : 0.75}
                        stroke={isSelected ? "#fff" : n.color}
                        strokeWidth={isSelected ? 2.5 : 0.5}
                        strokeOpacity={0.4}
                      />
                      <SvgText x={n.x} y={n.y + 1} fontSize={Math.max(8, Math.min(n.radius * 0.45, 12))}
                        fill="#fff" textAnchor="middle" fontWeight="700" opacity={0.9}>
                        {n.memoryCount}
                      </SvgText>
                      <SvgText x={n.x} y={n.y + n.radius + 13} fontSize={9}
                        fill={theme.color.val} textAnchor="middle" fontWeight="600">
                        {n.label.slice(0, 14)}
                      </SvgText>
                    </G>
                  );
                })}
              </Svg>
            </Card>

            {/* ── Legend (memory mode) ── */}
            {mode === "memories" && topics.length > 0 && (
              <Animated.View entering={FadeIn.delay(200).duration(300)}>
                <XStack gap={12} paddingTop={4} flexWrap="wrap">
                  <XStack alignItems="center" gap={4}>
                    <YStack width={16} height={2} backgroundColor={theme.primary.val} opacity={0.5} />
                    <Text fontSize={10} fontFamily="$body" color="$colorMuted">shared topic</Text>
                  </XStack>
                  <XStack alignItems="center" gap={4}>
                    <XStack style={{ width: 16, borderBottomWidth: 1, borderStyle: "dashed", borderColor: theme.colorMuted.val, opacity: 0.5 }} />
                    <Text fontSize={10} fontFamily="$body" color="$colorMuted">shared person</Text>
                  </XStack>
                </XStack>
              </Animated.View>
            )}

            {/* ── Selected Memory Panel ── */}
            {selectedMemory && mode === "memories" && (
              <Animated.View entering={FadeInUp.duration(220)}>
                <Card style={{ marginTop: 4, borderRadius: 20, gap: 12 }}>
                  {/* Topic badges */}
                  {(selectedMemory.primaryTopicId || (selectedMemory.topicIds?.length ?? 0) > 0) && (
                    <XStack gap={6} flexWrap="wrap">
                      {[selectedMemory.primaryTopicId, ...(selectedMemory.topicIds ?? []).filter(id => id !== selectedMemory.primaryTopicId)]
                        .filter(Boolean)
                        .slice(0, 4)
                        .map((tid) => {
                          const t = topicById[tid!];
                          if (!t) return null;
                          return (
                            <XStack key={tid} alignItems="center" gap={4}
                              paddingHorizontal={9} paddingVertical={4} borderRadius={20}
                              backgroundColor={(t.color ?? theme.primary.val) + "18"}
                              borderWidth={0.5} borderColor={(t.color ?? theme.primary.val) + "40"}
                            >
                              <YStack width={6} height={6} borderRadius={3} backgroundColor={t.color ?? theme.primary.val} />
                              <Text fontSize={11} fontFamily="$body" fontWeight="600"
                                color={t.color ?? theme.primary.val}>{t.name}</Text>
                            </XStack>
                          );
                        })}
                    </XStack>
                  )}
                  <YStack gap={6}>
                    <Text fontSize={16} fontFamily="$heading" fontWeight="700" color="$color">
                      {selectedMemory.title}
                    </Text>
                    <Text fontSize={13} fontFamily="$body" lineHeight={20} color="$colorMuted" numberOfLines={4}>
                      {selectedMemory.content}
                    </Text>
                  </YStack>
                  <XStack gap={10} flexWrap="wrap">
                    {selectedMemory.mood && (
                      <Badge label={selectedMemory.mood} small />
                    )}
                    {getReminderDate(selectedMemory) && (
                      <XStack alignItems="center" gap={4}>
                        <Feather name="bell" size={11} color={theme.primary.val} />
                        <Text fontSize={11} fontFamily="$body" color="$primary">
                          {new Date(getReminderDate(selectedMemory)!).toLocaleDateString(undefined, {
                            month: "short", day: "numeric",
                          })}
                        </Text>
                      </XStack>
                    )}
                    {(selectedMemory.people?.length ?? 0) > 0 && (
                      <XStack alignItems="center" gap={4}>
                        <Feather name="users" size={11} color={theme.colorMuted.val} />
                        <Text fontSize={11} fontFamily="$body" color="$colorMuted">
                          {selectedMemory.people!.slice(0, 2).join(", ")}
                        </Text>
                      </XStack>
                    )}
                    <XStack alignItems="center" gap={4}>
                      <Feather name="link-2" size={11} color={theme.colorMuted.val} />
                      <Text fontSize={11} fontFamily="$body" color="$colorMuted">
                        {(memoryGraph?.edges.filter((e) =>
                          e.source === selectedMemory._id || e.target === selectedMemory._id
                        ).length ?? 0)} connections
                      </Text>
                    </XStack>
                  </XStack>
                </Card>
              </Animated.View>
            )}

            {/* ── Selected Topic Panel ── */}
            {selectedTopic && mode === "topics" && (
              <Animated.View entering={FadeInUp.duration(220)}>
                <Card style={{ marginTop: 4, borderRadius: 20, gap: 12 }}>
                  <XStack alignItems="center" gap={10}>
                    <YStack
                      width={44} height={44} borderRadius={14} alignItems="center" justifyContent="center"
                      backgroundColor={(selectedTopic.color ?? theme.primary.val) + "20"}
                    >
                      <Feather
                        name={(selectedTopic.icon as any) ?? "tag"}
                        size={20}
                        color={selectedTopic.color ?? theme.primary.val}
                      />
                    </YStack>
                    <YStack flex={1} gap={2}>
                      <Text fontSize={17} fontFamily="$heading" fontWeight="700" color="$color">
                        {selectedTopic.name}
                      </Text>
                      <Text fontSize={12} fontFamily="$body" color="$colorMuted">
                        {selectedTopic.memoryCount} {selectedTopic.memoryCount === 1 ? "memory" : "memories"}
                      </Text>
                    </YStack>
                    <YStack
                      paddingHorizontal={12} paddingVertical={6} borderRadius={20}
                      backgroundColor={(selectedTopic.color ?? theme.primary.val) + "18"}
                    >
                      <Text fontSize={12} fontFamily="$body" fontWeight="600"
                        color={selectedTopic.color ?? theme.primary.val}>
                        {Math.round((selectedTopic.memoryCount / Math.max(rawMemories.length, 1)) * 100)}%
                      </Text>
                    </YStack>
                  </XStack>
                  {selectedTopic.description ? (
                    <Text fontSize={13} fontFamily="$body" lineHeight={19} color="$colorMuted">
                      {selectedTopic.description}
                    </Text>
                  ) : null}
                  {(selectedTopic.relatedTopics?.length ?? 0) > 0 && (
                    <YStack gap={6}>
                      <Text fontSize={11} fontFamily="$body" fontWeight="600" textTransform="uppercase"
                        letterSpacing={0.8} color="$colorMuted">Related topics</Text>
                      <XStack gap={6} flexWrap="wrap">
                        {(selectedTopic.relatedTopics ?? [])
                          .sort((a, b) => b.similarity - a.similarity)
                          .slice(0, 4)
                          .map((rel) => {
                            const t = topicById[rel.topicId];
                            if (!t) return null;
                            return (
                              <Pressable key={rel.topicId}
                                onPress={() => handleNodePress(rel.topicId)}
                                style={{
                                  flexDirection: "row", alignItems: "center", gap: 5,
                                  paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
                                  backgroundColor: (t.color ?? theme.primary.val) + "15",
                                  borderWidth: 0.5,
                                  borderColor: (t.color ?? theme.primary.val) + "40",
                                }}
                              >
                                <YStack width={6} height={6} borderRadius={3}
                                  backgroundColor={t.color ?? theme.primary.val} />
                                <Text fontSize={12} fontFamily="$body" fontWeight="500"
                                  color={t.color ?? theme.primary.val}>{t.name}</Text>
                              </Pressable>
                            );
                          })}
                      </XStack>
                    </YStack>
                  )}
                </Card>
              </Animated.View>
            )}

            {/* ── Topic Index (topic mode, no selection) ── */}
            {mode === "topics" && !selectedTopic && (topicGraph?.nodes.length ?? 0) > 0 && (
              <Animated.View entering={FadeIn.delay(300).duration(300)}>
                <YStack gap={8}>
                  <Text fontSize={13} fontFamily="$body" fontWeight="600" color="$colorMuted">
                    Tap any node to explore · {topicGraph!.nodes.length} topics
                  </Text>
                  <XStack flexWrap="wrap" gap={6}>
                    {topicGraph!.nodes
                      .slice()
                      .sort((a, b) => b.memoryCount - a.memoryCount)
                      .map((n) => (
                        <Pressable
                          key={n.id}
                          onPress={() => handleNodePress(n.id)}
                          style={{
                            flexDirection: "row", alignItems: "center", gap: 5,
                            paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20,
                            backgroundColor: n.color + "15",
                            borderWidth: 0.5, borderColor: n.color + "35",
                          }}
                        >
                          <YStack width={7} height={7} borderRadius={4} backgroundColor={n.color} />
                          <Text fontSize={12} fontFamily="$body" fontWeight="500" color={n.color}>
                            {n.label}
                          </Text>
                          <Text fontSize={10} fontFamily="$body" color={n.color + "AA"}>
                            {n.memoryCount}
                          </Text>
                        </Pressable>
                      ))}
                  </XStack>
                </YStack>
              </Animated.View>
            )}
          </Animated.View>
        )}
    </MorePageScaffold>
  );
}
