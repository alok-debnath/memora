import React, { useState, useMemo } from "react";
import { Platform, StyleSheet } from "react-native";
import { XStack, YStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import Svg, { Circle, Line, G, Text as SvgText } from "react-native-svg";
import Animated, { FadeIn } from "react-native-reanimated";
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

function buildGraph(memories: Array<{ _id: string; title: string; tags: string[]; people: string[]; category: string; content: string }>): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = memories.slice(0, 30).map((m, i: number) => ({
    id: m._id,
    label: m.title.slice(0, 15),
    category: m.category,
    x: 200 + Math.cos(i * 0.8) * (80 + i * 6),
    y: 200 + Math.sin(i * 0.8) * (80 + i * 6),
    vx: 0,
    vy: 0,
  }));

  const edges: GraphEdge[] = [];
  for (let i = 0; i < memories.length && i < 30; i++) {
    for (let j = i + 1; j < memories.length && j < 30; j++) {
      const a = memories[i];
      const b = memories[j];
      const sharedTags = (a.tags || []).filter((t: string) => (b.tags || []).includes(t));
      if (sharedTags.length > 0 || a.category === b.category) {
        edges.push({ source: a._id, target: b._id });
      }
    }
  }
  return { nodes, edges };
}

function simulate(nodes: GraphNode[], edges: GraphEdge[], centerX: number, centerY: number) {
  for (let iter = 0; iter < 60; iter++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[j].x - nodes[i].x;
        const dy = nodes[j].y - nodes[i].y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const force = 800 / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        nodes[i].vx -= fx;
        nodes[i].vy -= fy;
        nodes[j].vx += fx;
        nodes[j].vy += fy;
      }
    }

    edges.forEach((e) => {
      const s = nodes.find((n) => n.id === e.source);
      const t = nodes.find((n) => n.id === e.target);
      if (!s || !t) return;
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const force = (dist - 80) * 0.02;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      s.vx += fx;
      s.vy += fy;
      t.vx -= fx;
      t.vy -= fy;
    });

    nodes.forEach((n) => {
      n.vx += (centerX - n.x) * 0.003;
      n.vy += (centerY - n.y) * 0.003;
      n.vx *= 0.85;
      n.vy *= 0.85;
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

  const svgWidth = width - 32;
  const svgHeight = height * 0.65;
  const centerX = svgWidth / 2;
  const centerY = svgHeight / 2;

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

  const { nodes, edges } = useMemo(() => {
    const graph = buildGraph(visibleMemories);
    graph.nodes = simulate(graph.nodes, graph.edges, centerX, centerY);
    return graph;
  }, [visibleMemories, centerX, centerY]);

  const selectedMemory = selectedNode ? visibleMemories.find((m) => m._id === selectedNode) : null;
  const webTopPadding = Platform.OS === "web" ? 67 : 0;

  return (
    <YStack flex={1} backgroundColor="$background">
      <XStack
        alignItems="center"
        justifyContent="space-between"
        paddingHorizontal={16}
        paddingBottom={12}
        paddingTop={insets.top + webTopPadding + 12}
      >
        <PressableScale onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={theme.color.val} />
        </PressableScale>
        <Text fontSize={18} fontFamily="$heading" fontWeight="600" color="$color">Knowledge Graph</Text>
        <YStack width={22} />
      </XStack>

      <YStack paddingHorizontal={16} gap={12} marginBottom={12}>
        <Card style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <YStack flex={1} alignItems="center">
            <Text fontSize={22} fontFamily="$heading" fontWeight="700" color="$color">{nodes.length}</Text>
            <Text fontSize={11} fontFamily="$body" marginTop={4} color="$colorMuted">nodes</Text>
          </YStack>
          <YStack width={1} height={32} backgroundColor="$borderColor" />
          <YStack flex={1} alignItems="center">
            <Text fontSize={22} fontFamily="$heading" fontWeight="700" color="$color">{edges.length}</Text>
            <Text fontSize={11} fontFamily="$body" marginTop={4} color="$colorMuted">edges</Text>
          </YStack>
        </Card>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder="Filter the graph..."
        />
      </YStack>

      {visibleMemories.length < 2 ? (
        <EmptyState icon="share-2" title="Not enough data" description="Create more memories to visualize connections" />
      ) : (
        <Animated.View entering={FadeIn.duration(600)}>
          <Svg width={svgWidth} height={svgHeight} style={{ alignSelf: "center" }}>
            {edges.map((e, i) => {
              const s = nodes.find((n) => n.id === e.source);
              const t = nodes.find((n) => n.id === e.target);
              if (!s || !t) return null;
              return (
                <Line
                  key={i}
                  x1={s.x}
                  y1={s.y}
                  x2={t.x}
                  y2={t.y}
                  stroke={theme.borderColor.val}
                  strokeWidth={1}
                  opacity={0.5}
                />
              );
            })}
            {nodes.map((n) => (
              <G key={n.id}>
                <Circle
                  cx={n.x}
                  cy={n.y}
                  r={selectedNode === n.id ? 18 : 12}
                  fill={categoryColors[n.category] || theme.primary.val}
                  opacity={selectedNode && selectedNode !== n.id ? 0.3 : 0.8}
                  onPress={() => setSelectedNode(selectedNode === n.id ? null : n.id)}
                />
                <SvgText
                  x={n.x}
                  y={n.y + 22}
                  fontSize={9}
                  fill={theme.colorMuted.val}
                  textAnchor="middle"
                >
                  {n.label}
                </SvgText>
              </G>
            ))}
          </Svg>

          {selectedMemory && (
            <Animated.View
              entering={FadeIn.duration(200)}
              style={[
                styles.detail,
                { backgroundColor: theme.card.val, borderColor: theme.borderColor.val },
              ]}
            >
              <Text fontSize={16} fontFamily="$heading" fontWeight="600" marginBottom={4} color="$color">
                {selectedMemory.title}
              </Text>
              <Text fontSize={14} fontFamily="$body" lineHeight={20} marginBottom={8} color="$colorMuted" numberOfLines={2}>
                {selectedMemory.content}
              </Text>
              <XStack gap={10}>
                <Text
                  fontSize={12}
                  fontFamily="$heading"
                  fontWeight="600"
                  textTransform="capitalize"
                  style={{ color: categoryColors[selectedMemory.category] }}
                >
                  {selectedMemory.category}
                </Text>
                {(selectedMemory.tags || []).slice(0, 3).map((t: string) => (
                  <Text key={t} fontSize={12} fontFamily="$body" color="$colorMuted">
                    #{t}
                  </Text>
                ))}
              </XStack>
            </Animated.View>
          )}
        </Animated.View>
      )}
    </YStack>
  );
}

const styles = StyleSheet.create({
  detail: {
    marginHorizontal: 16, padding: 16, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
});
