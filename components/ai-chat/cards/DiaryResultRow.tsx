import React from "react";
import { Platform, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Text, XStack, YStack } from "tamagui";
import type { Id } from "@/convex/_generated/dataModel";
import { FontFamily } from "@/constants/fonts";
import { ContextMenu, type ContextMenuItemDef } from "@/components/ui/ContextMenu";
import { withAlpha } from "@/components/ui/themeHelpers";
import { useAppTheme } from "@/hooks/useAppTheme";
import { Feather } from "@/lib/icons";

export type DiaryCardDoc = {
  _id: Id<"diaryEntries">;
  _creationTime: number;
  mood: string | null;
  energyLevel: string | null;
  topics: string[];
  summary: string | null;
  excerpt: string;
};

function formatDiaryDate(timestamp: number) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(timestamp));
  } catch {
    return new Date(timestamp).toDateString();
  }
}

export const DiaryResultRow = React.memo(function DiaryResultRow({
  entry,
  index,
  onOpenDiary,
  onDelete,
}: {
  entry: DiaryCardDoc;
  index: number;
  onOpenDiary: () => void;
  onDelete: (id: Id<"diaryEntries">) => void;
}) {
  const theme = useAppTheme();
  const dateLabel = formatDiaryDate(entry._creationTime);

  const menuItems: ContextMenuItemDef[] = [
    {
      label: "View in Diary",
      icon: "book-open",
      iconColor: theme.primary.val,
      onPress: onOpenDiary,
    },
    {
      label: "Delete Entry",
      icon: "trash-2",
      destructive: true,
      onPress: () => onDelete(entry._id),
    },
  ];

  const previewCard = (
    <YStack padding={14} gap={8}>
      <XStack gap={10} alignItems="center">
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: withAlpha(theme.success.val, "18"),
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Feather name="book-open" size={16} color={theme.success.val} />
        </View>
        <YStack flex={1} gap={2}>
          <Text fontSize={14} fontFamily={FontFamily.semiBold} color={theme.color.val}>
            {dateLabel}
          </Text>
          <Text fontSize={11} color={theme.colorMuted.val}>
            Diary entry{entry.mood ? ` • ${entry.mood}` : ""}
          </Text>
        </YStack>
      </XStack>
      {entry.excerpt || entry.summary ? (
        <Text fontSize={12} fontFamily="$body" color={theme.colorMuted.val} numberOfLines={8}>
          {entry.excerpt || entry.summary}
        </Text>
      ) : null}
      {entry.topics.length > 0 ? (
        <Text fontSize={11} color={theme.colorMuted.val}>
          {entry.topics.join(" · ")}
        </Text>
      ) : null}
    </YStack>
  );

  const row = (
    <XStack
      paddingHorizontal={14}
      paddingVertical={11}
      gap={12}
      alignItems="center"
      borderTopWidth={index > 0 ? 1 : 0}
      borderTopColor={theme.borderColor.val}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: withAlpha(theme.success.val, "18"),
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Feather name="book-open" size={14} color={theme.success.val} />
      </View>

      <YStack flex={1} gap={6}>
        <XStack alignItems="center" gap={6}>
          <Text fontSize={13} fontFamily={FontFamily.semiBold} color={theme.color.val}>
            {dateLabel}
          </Text>
          {entry.mood ? (
            <Text fontSize={11} color={theme.colorMuted.val}>
              • {entry.mood}
            </Text>
          ) : null}
        </XStack>
        {entry.summary || entry.excerpt ? (
          <Text fontSize={11} fontFamily="$body" color={theme.colorMuted.val} numberOfLines={2}>
            {entry.summary || entry.excerpt}
          </Text>
        ) : null}
      </YStack>

      <XStack gap={4} alignItems="center">
        <Text fontSize={10} fontFamily={FontFamily.semiBold} color={theme.success.val}>
          Diary
        </Text>
        <ContextMenu
          items={menuItems}
          openOn="press"
          preview={
            Platform.OS === "ios" ? (
              <YStack backgroundColor={theme.card.val} borderRadius={18}>
                {previewCard}
              </YStack>
            ) : undefined
          }
        >
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Feather name="more-horizontal" size={16} color={theme.colorMuted.val} />
          </View>
        </ContextMenu>
      </XStack>
    </XStack>
  );

  return (
    <Animated.View entering={FadeInDown.duration(260).delay(index * 55)}>
      <ContextMenu items={menuItems} preview={previewCard} previewFrame>
        {row}
      </ContextMenu>
    </Animated.View>
  );
});
