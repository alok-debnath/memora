import React from "react";
import { Pressable } from "react-native";
import { Feather } from "@/lib/icons";
import Animated, { FadeIn } from "react-native-reanimated";
import { Card } from "./ui/Card";
import { Badge } from "./ui/Badge";
import { XStack, YStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import { moodIcons, moodLabels } from "@/constants/categories";
import { moodColors, statusAccentColors } from "@/constants/colors";
import type { DiaryEntry } from "@/types/memory";

interface DiaryEntryCardProps {
  entry: DiaryEntry;
  onDelete?: () => void;
  index?: number;
}

export function DiaryEntryCard({ entry, onDelete, index = 0 }: DiaryEntryCardProps) {
  const theme = useAppTheme();
  const entryDate = new Date(entry.createdAt);

  return (
    <Animated.View entering={FadeIn.delay(index * 60).duration(300)}>
      <Card
        style={{
          borderRadius: 24,
          borderColor: theme.primary.val + "18",
          backgroundColor: theme.card.val,
        }}
      >
        <XStack alignItems="flex-start" gap={10} marginBottom={10}>
          <YStack flex={1} gap={8}>
            <XStack alignItems="center" gap={8} flexWrap="wrap">
              {entry.mood && (
                <XStack
                  backgroundColor={moodColors[entry.mood] + "18"}
                  alignItems="center"
                  paddingHorizontal={10}
                  paddingVertical={5}
                  borderRadius={999}
                  gap={4}
                >
                  <Feather name={moodIcons[entry.mood]} size={14} color={moodColors[entry.mood]} />
                  <Text
                    fontSize={12}
                    fontFamily="$body"
                    fontWeight="600"
                    color={moodColors[entry.mood]}
                  >
                    {moodLabels[entry.mood]}
                  </Text>
                </XStack>
              )}
              {entry.energyLevel && (
                <Badge
                  label={`Energy ${entry.energyLevel}`}
                  color={
                    entry.energyLevel === "high"
                      ? statusAccentColors.success
                      : entry.energyLevel === "medium"
                        ? statusAccentColors.warning
                        : statusAccentColors.error
                  }
                  small
                />
              )}
            </XStack>
            <Text fontSize={15} fontFamily="$body" lineHeight={22} color="$color" numberOfLines={4}>
              {entry.correctedText || entry.rawText}
            </Text>
          </YStack>
          <XStack gap={8} alignItems="center">
            <Text fontSize={12} fontFamily="$body" color="$colorMuted">
              {entryDate.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </Text>
            {onDelete && (
              <Pressable
                onPress={onDelete}
                style={{
                  width: 32,
                  height: 32,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 10,
                  backgroundColor: theme.destructive.val + "10",
                }}
              >
                <Feather name="trash-2" size={14} color={theme.destructive.val} />
              </Pressable>
            )}
          </XStack>
        </XStack>

        {entry.topics.length > 0 && (
          <XStack flexWrap="wrap" gap={6} marginBottom={10}>
            {entry.topics.slice(0, 4).map((topic) => (
              <Badge key={topic} label={topic} small />
            ))}
          </XStack>
        )}

        {entry.structuredInsights && entry.structuredInsights.length > 0 && (
          <XStack
            backgroundColor={theme.primary.val + "10"}
            alignItems="flex-start"
            padding={12}
            borderRadius={14}
            gap={8}
            borderWidth={1}
            borderColor={theme.primary.val + "18"}
          >
            <Feather name="star" size={13} color={theme.primary.val} />
            <Text
              flex={1}
              fontSize={12}
              fontFamily="$body"
              lineHeight={17}
              color="$color"
              numberOfLines={2}
            >
              {entry.structuredInsights[0].insight}
            </Text>
          </XStack>
        )}
      </Card>
    </Animated.View>
  );
}
