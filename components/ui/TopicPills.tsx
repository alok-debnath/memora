import React from "react";
import { ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";
import { PressableScale } from "./PressableScale";
import { Text, XStack } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";

interface TopicPillsProps {
  selected: string | null;
  onSelect: (topicId: string | null) => void;
  topics: Array<{
    _id: string;
    name: string;
    icon?: string | null;
    color?: string | null;
    memoryCount: number;
  }>;
}

export function TopicPills({ selected, onSelect, topics }: TopicPillsProps) {
  const theme = useAppTheme();

  const activeTopics = topics
    .filter((t) => t.memoryCount > 0)
    .sort((a, b) => b.memoryCount - a.memoryCount);

  if (activeTopics.length < 2) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 8, flexDirection: "row" }}
    >
      {/* "All" pill */}
      <PressableScale
        onPress={() => onSelect(null)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: 20,
          gap: 6,
          borderWidth: 0.5,
          backgroundColor: selected === null ? theme.primary.val : theme.secondary.val,
          borderColor: selected === null ? theme.primary.val : theme.borderColor.val,
        }}
      >
        <Text
          fontSize={13}
          fontFamily="$body"
          fontWeight="500"
          color={selected === null ? "#FFFFFF" : "$colorMuted"}
        >
          All
        </Text>
      </PressableScale>

      {activeTopics.map((topic) => {
        const isSelected = selected === topic._id;
        const pillColor = topic.color || theme.primary.val;

        return (
          <PressableScale
            key={topic._id}
            onPress={() => onSelect(topic._id)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 20,
              gap: 6,
              borderWidth: 0.5,
              backgroundColor: isSelected ? pillColor : theme.secondary.val,
              borderColor: isSelected ? pillColor : theme.borderColor.val,
            }}
          >
            <Feather
              name={(topic.icon as React.ComponentProps<typeof Feather>["name"]) ?? "tag"}
              size={14}
              color={isSelected ? "#FFFFFF" : theme.colorMuted.val}
            />
            <Text
              fontSize={13}
              fontFamily="$body"
              fontWeight="500"
              color={isSelected ? "#FFFFFF" : "$colorMuted"}
            >
              {topic.name}
            </Text>
            <Text
              fontSize={11}
              fontFamily="$body"
              color={isSelected ? "rgba(255,255,255,0.7)" : "$colorMuted"}
            >
              {topic.memoryCount}
            </Text>
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}
