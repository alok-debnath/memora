import React from "react";
import { Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeIn } from "react-native-reanimated";
import { Card } from "./ui/Card";
import { Badge } from "./ui/Badge";
import { XStack, YStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import { moodIcons, moodLabels } from "@/constants/categories";
import { moodColors } from "@/constants/colors";
import type { DiaryEntry } from "@/types/memory";

interface DiaryEntryCardProps {
  entry: DiaryEntry;
  onDelete?: () => void;
  index?: number;
}

export function DiaryEntryCard({ entry, onDelete, index = 0 }: DiaryEntryCardProps) {
  const theme = useAppTheme();

  return (
    <Animated.View entering={FadeIn.delay(index * 60).duration(300)}>
      <Card>
        <XStack alignItems="center" gap={8} marginBottom={10}>
          {entry.mood && (
            <XStack
              backgroundColor={moodColors[entry.mood] + "20"}
              alignItems="center"
              paddingHorizontal={10}
              paddingVertical={4}
              borderRadius={12}
              gap={4}
            >
              <Feather name={moodIcons[entry.mood]} size={16} color={moodColors[entry.mood]} />
              <Text fontSize={12} fontFamily="$body" fontWeight="500" color={moodColors[entry.mood]}>
                {moodLabels[entry.mood]}
              </Text>
            </XStack>
          )}
          {entry.energyLevel && (
            <Badge
              label={`Energy: ${entry.energyLevel}`}
              color={
                entry.energyLevel === "high"
                  ? "#10B981"
                  : entry.energyLevel === "medium"
                  ? "#F59E0B"
                  : "#EF4444"
              }
              small
            />
          )}
          <YStack flex={1} />
          <Text fontSize={12} fontFamily="$body" color="$colorMuted">
            {new Date(entry.createdAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </Text>
          {onDelete && (
            <Pressable onPress={onDelete} style={{ width: 28, height: 28, alignItems: "center", justifyContent: "center" }}>
              <Feather name="trash-2" size={14} color={theme.destructive.val} />
            </Pressable>
          )}
        </XStack>

        <Text fontSize={14} fontFamily="$body" lineHeight={20} color="$color" numberOfLines={3} marginBottom={10}>
          {entry.correctedText || entry.rawText}
        </Text>

        {entry.topics.length > 0 && (
          <XStack flexWrap="wrap" gap={6} marginBottom={8}>
            {entry.topics.slice(0, 3).map((topic, i) => (
              <Badge key={i} label={topic} small />
            ))}
          </XStack>
        )}

        {entry.structuredInsights && entry.structuredInsights.length > 0 && (
          <XStack
            backgroundColor="$accent"
            alignItems="flex-start"
            padding={10}
            borderRadius={10}
            gap={8}
          >
            <Feather name="zap" size={12} color={theme.primary.val} />
            <Text flex={1} fontSize={12} fontFamily="$body" lineHeight={16} color="$color" numberOfLines={2}>
              {entry.structuredInsights[0].insight}
            </Text>
          </XStack>
        )}
      </Card>
    </Animated.View>
  );
}
