import React, { useMemo, useState } from "react";
import { Platform, ScrollView } from "react-native";
import { XStack, YStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import Svg, { Circle, Line, G, Text as SvgText } from "react-native-svg";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useWindowDimensions } from "react-native";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { EmptyState } from "@/components/ui/EmptyState";
import { PressableScale } from "@/components/ui/PressableScale";
import { SearchBar } from "@/components/ui/SearchBar";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { categoryColors } from "@/constants/colors";

interface GraphNode {
  id: string;
  label: string;
  category: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface GraphEdge {
  source: string;
  target: string;
}

function buildGraph(
  memories: Array<{
    _id: string;
    title: string;
    tags: string[];
    people: string[];
    category: string;
    content: string;
  }>
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const limited = memories.slice(0, 24);
  const nodes: GraphNode[] = limited.map((m, i) => ({
    id: m._id,
    label: m.title.slice(0, 15) || "Untitled",
    category: m.category,
    x: 200 + Math.cos(i * 0.8) * (78 + i * 6),
    y: 200 + Math.sin(i * 0.8) * (78 + i * 6),
    vx: 0,
    vy: 0,
  }));

  const edges: GraphEdge[] = [];
  for (let i = 0; i < limited.length; i++) {
    for (let j = i + 1; j < limited.length; j++) {
      const a = limited[i];
      const b = limited[j];
      const sharedTags = (a.tags || []).filter((t) => (b.tags || []).includes(t));
      const sharedPeople = (a.people || []).filter((p) => (b.people || []).includes(p));
      if (sharedTags.length > 0 || sharedPeople.length > 0 || a.category === b.category) {
        edges.push({ source: a._id, target: b._id });
      }
    }
  }

  return { nodes, edges };
}

function simulate(nodes: GraphNode[], edges: GraphEdge[], centerX: number, centerY: number) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  for (let iter = 0; iter < 40; iter++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[j].x - nodes[i].x;
        const dy = nodes[j].y - nodes[i].y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const force = 760 / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        nodes[i].vx -= fx;
        nodes[i].vy -= fy;
        nodes[j].vx += fx;
        nodes[j].vy += fy;
      }
    }

    edges.forEach((e) => {
      const s = nodeMap.get(e.source);
      const t = nodeMap.get(e.target);
      if (!s || !t) return;
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const force = (dist - 78) * 0.018;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      s.vx += fx;
      s.vy += fy;
      t.vx -= fx;
      t.vy -= fy;
    });

    nodes.forEach((n) => {
      n.vx += (centerX - n.x) * 0.0028;
      n.vy += (centerY - n.y) * 0.0028;
      n.vx *= 0.86;
      n.vy *= 0.86;
      n.x += n.vx;
      n.y += n.vy;
    });
  }

  return nodes;
}

export default function KnowledgeGraphScreen() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { token } = useAuth();

  const memoryResult = useQuery(api.memories.list, token ? { token, limit: 100 } : "skip");
  const memories = (memoryResult?.memories ?? []) as Array<{
    _id: Id<"memories">;
    title: string;
    content: string;
    category: string;
    tags: string[];
    people: string[];
  }>;
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const visibleMemories = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return memories;
    return memories.filter((memory) =>
      [memory.title, memory.content, memory.category, ...memory.tags, ...memory.people]
        .join(" ")
        .toLowerCase()
        .includes(normalized)
    );
  }, [memories, query]);

  const graph = useMemo(() => {
    const base = buildGraph(visibleMemories);
    const svgWidth = Math.max(width - 32, 320);
    const svgHeight = Math.max(height * 0.56, 320);
    const centerX = svgWidth / 2;
    const centerY = svgHeight / 2;
    return {
      ...base,
      svgWidth,
      svgHeight,
      nodes: simulate(base.nodes, base.edges, centerX, centerY),
    };
  }, [visibleMemories, width, height]);

  const selectedMemory = selectedNode ? visibleMemories.find((m) => m._id === selectedNode) : null;
  const webTopPadding = Platform.OS === "web" ? 67 : 0;
  const nodeCount = graph.nodes.length;
  const edgeCount = graph.edges.length;

  return (
    <YStack flex={1} backgroundColor="$background">
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: insets.top + webTopPadding + 12,
          paddingBottom: 28,
          gap: 12,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInUp.duration(420)}>
          <Card style={{ padding: 18, borderRadius: 24, backgroundColor: theme.card.val }}>
            <XStack alignItems="flex-start" justifyContent="space-between" gap={12}>
              <YStack flex={1} gap={6}>
                <Badge label="Connections" color={theme.primary.val} />
                <Text fontSize={28} lineHeight={32} fontFamily="$heading" fontWeight="700" color="$color">
                  Knowledge graph
                </Text>
                <Text fontSize={14} lineHeight={20} fontFamily="$body" color="$colorMuted">
                  Relationships are inferred from shared tags, people, and category overlap.
                </Text>
              </YStack>
              <PressableScale onPress={() => router.back()} hitSlop={8}>
                <YStack
                  width={42}
                  height={42}
                  borderRadius={14}
                  alignItems="center"
                  justifyContent="center"
                  backgroundColor={theme.secondary.val}
                  borderWidth={1}
                  borderColor={theme.borderColor.val}
                >
                  <Feather name="arrow-left" size={20} color={theme.color.val} />
                </YStack>
              </PressableScale>
            </XStack>
            <XStack gap={10} marginTop={16}>
              <Card style={{ flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 18 }}>
                <Text fontSize={22} fontFamily="$heading" fontWeight="700" color="$color">
                  {nodeCount}
                </Text>
                <Text fontSize={11} fontFamily="$body" marginTop={4} color="$colorMuted">
                  nodes
                </Text>
              </Card>
              <Card style={{ flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 18 }}>
                <Text fontSize={22} fontFamily="$heading" fontWeight="700" color="$color">
                  {edgeCount}
                </Text>
                <Text fontSize={11} fontFamily="$body" marginTop={4} color="$colorMuted">
                  edges
                </Text>
              </Card>
            </XStack>
          </Card>
        </Animated.View>

        <SearchBar value={query} onChangeText={setQuery} placeholder="Filter the graph..." />

        {visibleMemories.length < 2 ? (
          <EmptyState icon="share-2" title="Not enough data" description="Create more memories to visualize connections." />
        ) : (
          <Animated.View entering={FadeIn.duration(500)}>
            <Card style={{ padding: 10, overflow: "hidden" }}>
              <Svg width={graph.svgWidth} height={graph.svgHeight} style={{ alignSelf: "center" }}>
                {graph.edges.map((e, i) => {
                  const s = graph.nodes.find((n) => n.id === e.source);
                  const t = graph.nodes.find((n) => n.id === e.target);
                  if (!s || !t) return null;
                  return <Line key={i} x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke={theme.borderColor.val} strokeWidth={1} opacity={0.45} />;
                })}
                {graph.nodes.map((n) => (
                  <G key={n.id}>
                    <Circle
                      cx={n.x}
                      cy={n.y}
                      r={selectedNode === n.id ? 18 : 12}
                      fill={categoryColors[n.category] || theme.primary.val}
                      opacity={selectedNode && selectedNode !== n.id ? 0.35 : 0.85}
                      onPress={() => setSelectedNode(selectedNode === n.id ? null : n.id)}
                    />
                    <SvgText x={n.x} y={n.y + 22} fontSize={9} fill={theme.colorMuted.val} textAnchor="middle">
                      {n.label}
                    </SvgText>
                  </G>
                ))}
              </Svg>
            </Card>

            {selectedMemory && (
              <Animated.View entering={FadeInUp.duration(200)}>
                <Card style={{ marginTop: 12, borderRadius: 22, borderColor: theme.borderColor.val }}>
                  <Text fontSize={16} fontFamily="$heading" fontWeight="700" marginBottom={4} color="$color">
                    {selectedMemory.title}
                  </Text>
                  <Text fontSize={14} fontFamily="$body" lineHeight={20} marginBottom={10} color="$colorMuted" numberOfLines={3}>
                    {selectedMemory.content}
                  </Text>
                  <XStack gap={10} flexWrap="wrap">
                    <Badge
                      label={categoryColors[selectedMemory.category] ? selectedMemory.category : "other"}
                      color={categoryColors[selectedMemory.category] || theme.primary.val}
                    />
                    {(selectedMemory.tags || []).slice(0, 3).map((t: string) => (
                      <Badge key={t} label={`#${t}`} small />
                    ))}
                  </XStack>
                </Card>
              </Animated.View>
            )}
          </Animated.View>
        )}
      </ScrollView>
    </YStack>
  );
}
