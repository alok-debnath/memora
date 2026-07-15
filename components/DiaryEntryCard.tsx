import React from "react";
import { Pressable } from "react-native";
import { Feather } from "@/lib/icons";
import { Card } from "./ui/Card";
import { Badge } from "./ui/Badge";
import { XStack, YStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useSemanticColors } from "@/hooks/useSemanticColors";
import { moodIcons, moodLabels } from "@/constants/categories";
import type { DiaryEntry } from "@/types/memory";

interface DiaryEntryCardProps {
  entry: DiaryEntry;
  onDelete?: (id: DiaryEntry["id"]) => void;
}

export const DiaryEntryCard = React.memo(function DiaryEntryCard({
  entry,
  onDelete,
}: DiaryEntryCardProps) {
  const theme = useAppTheme();
  const semantic = useSemanticColors();
  const entryDate = new Date(entry.createdAt);
  const moodColor = entry.mood ? semantic.mood[entry.mood] : undefined;

  return (
    <Card
      style={{
        borderRadius: 16,
        borderColor: theme.primary.val + "18",
        backgroundColor: theme.card.val,
      }}
    >
      <XStack alignItems="flex-start" gap={10} marginBottom={10}>
        <YStack flex={1} gap={8}>
          <XStack alignItems="center" gap={8} flexWrap="wrap">
            {entry.mood && (
              <XStack
                backgroundColor={moodColor + "18"}
                alignItems="center"
                paddingHorizontal={10}
                paddingVertical={5}
                borderRadius={999}
                gap={4}
              >
                <Feather name={moodIcons[entry.mood]} size={14} color={moodColor} />
                <Text fontSize={12} fontFamily="$body" fontWeight="600" color={moodColor}>
                  {moodLabels[entry.mood]}
                </Text>
              </XStack>
            )}
            {entry.energyLevel && (
              <Badge
                label={`Energy ${entry.energyLevel}`}
                color={
                  entry.energyLevel === "high"
                    ? semantic.status.success
                    : entry.energyLevel === "medium"
                      ? semantic.status.warning
                      : semantic.status.error
                }
                small
              />
            )}
          </XStack>
          <Text
            fontSize={15}
            fontFamily="$body"
            lineHeight={22}
            color={theme.color.val}
            numberOfLines={4}
          >
            {entry.correctedText || entry.rawText}
          </Text>
        </YStack>
        <XStack gap={8} alignItems="center">
          <Text fontSize={12} fontFamily="$body" color={theme.colorMuted.val}>
            {entryDate.toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </Text>
          {onDelete && (
            <Pressable
              onPress={() => onDelete(entry.id)}
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
            color={theme.color.val}
            numberOfLines={2}
          >
            {entry.structuredInsights[0].insight}
          </Text>
        </XStack>
      )}
    </Card>
  );
});
