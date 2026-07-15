import React from "react";
import { Pressable } from "react-native";
import { XStack, YStack, Text } from "tamagui";

import { Feather } from "@/lib/icons";
import { SurfaceCard } from "@/components/ui/SurfaceCard";
import { Badge } from "@/components/ui/Badge";
import { PressableScale } from "@/components/ui/PressableScale";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useSemanticColors } from "@/hooks/useSemanticColors";
import { moodIcons, moodLabels } from "@/constants/categories";
import type { DiaryListItem } from "./types";

function formatEntryDate(timestamp: number) {
  const date = new Date(timestamp);
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export const DiaryListCard = React.memo(function DiaryListCard({
  entry,
  onPress,
  onDelete,
}: {
  entry: DiaryListItem;
  onPress: (id: DiaryListItem["_id"]) => void;
  onDelete?: (id: DiaryListItem["_id"]) => void;
}) {
  const theme = useAppTheme();
  const semantic = useSemanticColors();
  const moodColor = entry.mood ? semantic.mood[entry.mood] : theme.borderColor.val;

  return (
    <PressableScale onPress={() => onPress(entry._id)}>
      <SurfaceCard
        style={{
          borderRadius: 16,
          borderColor: theme.primary.val + "18",
          backgroundColor: theme.card.val,
          borderLeftWidth: 3,
          borderLeftColor: entry.mood ? moodColor : theme.borderColor.val,
        }}
      >
        <XStack alignItems="center" justifyContent="space-between" gap={8} marginBottom={8}>
          <XStack alignItems="center" gap={8} flexShrink={1} flexWrap="wrap">
            <Text fontSize={12} fontFamily="$body" fontWeight="600" color={theme.colorMuted.val}>
              {formatEntryDate(entry._creationTime)}
            </Text>
            {entry.mood ? (
              <XStack
                backgroundColor={moodColor + "18"}
                alignItems="center"
                paddingHorizontal={8}
                paddingVertical={3}
                borderRadius={999}
                gap={4}
              >
                <Feather name={moodIcons[entry.mood]} size={12} color={moodColor} />
                <Text fontSize={11} fontFamily="$body" fontWeight="600" color={moodColor}>
                  {moodLabels[entry.mood]}
                </Text>
              </XStack>
            ) : null}
            {entry.energyLevel ? (
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
            ) : null}
            {entry.processing ? (
              <Badge label="Analyzing…" color={semantic.status.info} small />
            ) : null}
          </XStack>
          {onDelete ? (
            <Pressable
              onPress={() => onDelete(entry._id)}
              hitSlop={8}
              style={{
                width: 30,
                height: 30,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 10,
                backgroundColor: theme.destructive.val + "10",
              }}
            >
              <Feather name="trash-2" size={13} color={theme.destructive.val} />
            </Pressable>
          ) : null}
        </XStack>

        {entry.summary ? (
          <Text
            fontSize={14}
            fontFamily="$body"
            fontWeight="600"
            lineHeight={20}
            color={theme.color.val}
            marginBottom={6}
            numberOfLines={2}
          >
            {entry.summary}
          </Text>
        ) : null}
        <Text
          fontSize={entry.summary ? 13 : 15}
          fontFamily="$body"
          lineHeight={entry.summary ? 19 : 22}
          color={entry.summary ? theme.colorMuted.val : theme.color.val}
          numberOfLines={entry.summary ? 2 : 4}
        >
          {entry.excerpt}
        </Text>

        {entry.topics.length > 0 ? (
          <XStack flexWrap="wrap" gap={6} marginTop={10}>
            {entry.topics.slice(0, 4).map((topic) => (
              <Badge key={topic} label={topic} small />
            ))}
          </XStack>
        ) : null}

        {entry.insight ? (
          <XStack
            backgroundColor={theme.primary.val + "10"}
            alignItems="flex-start"
            padding={10}
            borderRadius={12}
            gap={8}
            marginTop={10}
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
              {entry.insight}
            </Text>
          </XStack>
        ) : null}
      </SurfaceCard>
    </PressableScale>
  );
});
