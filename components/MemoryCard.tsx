import React from "react";
import { Pressable, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn } from "react-native-reanimated";
import { PressableScale } from "./ui/PressableScale";
import { XStack, YStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import { categoryIcons, categoryLabels, moodLabels, moodIcons } from "@/constants/categories";
import { categoryColors, moodColors } from "@/constants/colors";
import type { MemoryNote } from "@/types/memory";

interface MemoryCardProps {
  memory: MemoryNote;
  onPress?: () => void;
  onDelete?: () => void;
  onShare?: () => void;
  onAddToReview?: () => void;
  index?: number;
}

export function MemoryCard({
  memory,
  onPress,
  onDelete,
  onShare,
  onAddToReview,
  index = 0,
}: MemoryCardProps) {
  const theme = useAppTheme();
  const catColor = categoryColors[memory.category] || theme.primary.val;
  const isLocked =
    memory.capsuleUnlockDate &&
    new Date(memory.capsuleUnlockDate) > new Date();

  const handleLongPress = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onPress?.();
  };

  return (
    <Animated.View entering={FadeIn.delay(Math.min(index * 40, 300)).duration(300)}>
      <PressableScale onPress={onPress} onLongPress={handleLongPress}>
        <YStack
          backgroundColor="$card"
          borderColor="$borderColor"
          borderWidth={1}
          borderRadius={16}
          padding={16}
          position="relative"
          overflow="hidden"
        >
          {isLocked && (
            <YStack
              position="absolute"
              top={0}
              left={0}
              right={0}
              bottom={0}
              zIndex={10}
              backgroundColor={theme.secondary.val + "CC"}
              alignItems="center"
              justifyContent="center"
              borderRadius={16}
              gap={6}
            >
              <Feather name="lock" size={24} color={theme.colorMuted.val} />
              <Text fontSize={12} fontFamily="$body" fontWeight="500" color="$colorMuted">
                Unlocks{" "}
                {new Date(memory.capsuleUnlockDate!).toLocaleDateString()}
              </Text>
            </YStack>
          )}

          {/* Top row: category icon + title + date */}
          <XStack alignItems="center" gap={10} marginBottom={8}>
            <YStack
              width={32}
              height={32}
              borderRadius={10}
              backgroundColor={catColor + "20"}
              alignItems="center"
              justifyContent="center"
            >
              <Feather name={categoryIcons[memory.category]} size={14} color={catColor} />
            </YStack>
            <XStack flex={1} alignItems="baseline" justifyContent="space-between" gap={8}>
              <Text flex={1} fontSize={15} fontFamily="$body" fontWeight="600" color="$color" numberOfLines={1}>
                {memory.title}
              </Text>
              <Text fontSize={11} fontFamily="$body" color="$colorMuted">
                {new Date(memory.createdAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </Text>
            </XStack>
          </XStack>

          {!isLocked && (
            <>
              {/* Content preview */}
              <Text
                fontSize={13}
                fontFamily="$body"
                lineHeight={19}
                color="$colorMuted"
                numberOfLines={2}
                marginBottom={10}
              >
                {memory.content}
              </Text>

              {/* Meta row: mood + tags */}
              <XStack flexWrap="wrap" alignItems="center" gap={6} marginBottom={10}>
                {memory.mood && (
                  <XStack
                    backgroundColor={(moodColors[memory.mood] || theme.secondary.val) + "15"}
                    alignItems="center"
                    gap={4}
                    paddingHorizontal={8}
                    paddingVertical={3}
                    borderRadius={8}
                  >
                    <Feather
                      name={moodIcons[memory.mood]}
                      size={11}
                      color={moodColors[memory.mood] || theme.colorMuted.val}
                    />
                    <Text
                      fontSize={11}
                      fontFamily="$body"
                      fontWeight="500"
                      color={moodColors[memory.mood] || theme.colorMuted.val}
                    >
                      {moodLabels[memory.mood]}
                    </Text>
                  </XStack>
                )}
                {memory.tags.slice(0, 2).map((tag) => (
                  <XStack key={tag} backgroundColor="$secondary" paddingHorizontal={8} paddingVertical={3} borderRadius={8}>
                    <Text fontSize={11} fontFamily="$body" fontWeight="500" color="$colorMuted">{tag}</Text>
                  </XStack>
                ))}
                {memory.tags.length > 2 && (
                  <Text fontSize={11} fontFamily="$body" fontWeight="500" color="$colorMuted">
                    +{memory.tags.length - 2}
                  </Text>
                )}
              </XStack>

              {/* Bottom row: category label + reminder + actions */}
              <XStack alignItems="center" justifyContent="space-between">
                <XStack alignItems="center" gap={8}>
                  <Text
                    fontSize={11}
                    fontFamily="$body"
                    fontWeight="600"
                    textTransform="uppercase"
                    letterSpacing={0.5}
                    color={catColor}
                  >
                    {categoryLabels[memory.category] ?? memory.category}
                  </Text>
                  {memory.reminderDate && (
                    <XStack alignItems="center" gap={3}>
                      <Feather name="bell" size={10} color={theme.primary.val} />
                      <Text fontSize={11} fontFamily="$body" fontWeight="500" color="$primary">
                        {new Date(memory.reminderDate).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </Text>
                    </XStack>
                  )}
                  {memory.isRecurring && (
                    <Feather name="refresh-cw" size={10} color={theme.colorMuted.val} />
                  )}
                </XStack>
                <XStack gap={2}>
                  {onShare && (
                    <Pressable onPress={onShare} hitSlop={6} style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 16 }}>
                      <Feather name="share-2" size={14} color={theme.colorMuted.val} />
                    </Pressable>
                  )}
                  {onAddToReview && (
                    <Pressable onPress={onAddToReview} hitSlop={6} style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 16 }}>
                      <Feather name="repeat" size={14} color={theme.colorMuted.val} />
                    </Pressable>
                  )}
                  {onDelete && (
                    <Pressable onPress={onDelete} hitSlop={6} style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 16 }}>
                      <Feather name="trash-2" size={14} color={theme.destructive.val} />
                    </Pressable>
                  )}
                </XStack>
              </XStack>
            </>
          )}
        </YStack>
      </PressableScale>
    </Animated.View>
  );
}
