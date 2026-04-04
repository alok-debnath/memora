import React from "react";
import { Pressable, Platform, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeIn } from "react-native-reanimated";
import { XStack, YStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import { moodLabels, moodIcons } from "@/constants/categories";
import { moodColors } from "@/constants/colors";
import type { MemoryNote } from "@/types/memory";
import { getReminderDate, isReminder } from "@/types/memoryKind";
import { ContextMenu, type ContextMenuItemDef } from "./ui/ContextMenu";

interface MemoryCardProps {
  memory: MemoryNote;
  resolvedTopics?: Array<{ name: string; color?: string | null }>;
  onPress?: () => void;
  onDelete?: () => void;
  onShare?: () => void;
  onAddToReview?: () => void;
  onComplete?: () => void;
  index?: number;
}

interface CardBodyProps {
  memory: MemoryNote;
  resolvedTopics?: Array<{ name: string; color?: string | null }>;
  onComplete?: () => void;
  onShare?: () => void;
  onAddToReview?: () => void;
  onDelete?: () => void;
  showActions?: boolean;
}

export const CardBody = React.memo(function CardBody({
  memory,
  resolvedTopics,
  onComplete,
  onShare,
  onAddToReview,
  onDelete,
  showActions = false,
}: CardBodyProps) {
  const theme = useAppTheme();

  const isLocked =
    memory.capsuleUnlockDate &&
    new Date(memory.capsuleUnlockDate) > new Date();

  return (
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
            Unlocks {new Date(memory.capsuleUnlockDate!).toLocaleDateString()}
          </Text>
        </YStack>
      )}

      <XStack alignItems="baseline" justifyContent="space-between" gap={8} marginBottom={8}>
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

      {!isLocked && (
        <>
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

          {(memory.mood || (resolvedTopics && resolvedTopics.length > 0)) && (
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
                    name={moodIcons[memory.mood] as any}
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
              {resolvedTopics?.slice(0, 2).map((topic, i) => (
                <XStack
                  key={i}
                  alignItems="center"
                  gap={4}
                  paddingHorizontal={7}
                  paddingVertical={3}
                  borderRadius={8}
                  backgroundColor={(topic.color ?? theme.primary.val) + "15"}
                >
                  <YStack
                    width={6}
                    height={6}
                    borderRadius={3}
                    backgroundColor={topic.color ?? theme.primary.val}
                  />
                  <Text
                    fontSize={11}
                    fontFamily="$body"
                    fontWeight="500"
                    color={topic.color ?? theme.primary.val}
                    numberOfLines={1}
                  >
                    {topic.name}
                  </Text>
                </XStack>
              ))}
              {resolvedTopics && resolvedTopics.length > 2 && (
                <Text fontSize={10} fontFamily="$body" color="$colorMuted">
                  +{resolvedTopics.length - 2}
                </Text>
              )}
            </XStack>
          )}

          <XStack alignItems="center" justifyContent="space-between" minHeight={24}>
            <XStack alignItems="center" gap={8}>
              {isReminder(memory) && getReminderDate(memory) && (
                <XStack alignItems="center" gap={3}>
                  <Feather name="bell" size={10} color={theme.primary.val} />
                  <Text fontSize={11} fontFamily="$body" fontWeight="500" color="$primary">
                    {new Date(getReminderDate(memory)!).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </Text>
                </XStack>
              )}
              {memory.schedule?.isRecurring && (
                <Feather name="refresh-cw" size={10} color={theme.colorMuted.val} />
              )}
            </XStack>
            {showActions && (
              <XStack gap={2}>
                {onComplete && isReminder(memory) && (
                  <Pressable
                    onPress={(e) => { e.stopPropagation(); onComplete(); }}
                    hitSlop={12}
                    style={styles.actionBtn}
                  >
                    <Feather name="check-circle" size={14} color="#16a34a" />
                  </Pressable>
                )}
                {onShare && (
                  <Pressable
                    onPress={(e) => { e.stopPropagation(); onShare(); }}
                    hitSlop={12}
                    style={styles.actionBtn}
                  >
                    <Feather name="share-2" size={14} color={theme.colorMuted.val} />
                  </Pressable>
                )}
                {onAddToReview && (
                  <Pressable
                    onPress={(e) => { e.stopPropagation(); onAddToReview(); }}
                    hitSlop={12}
                    style={styles.actionBtn}
                  >
                    <Feather name="repeat" size={14} color={theme.colorMuted.val} />
                  </Pressable>
                )}
                {onDelete && (
                  <Pressable
                    onPress={(e) => { e.stopPropagation(); onDelete(); }}
                    hitSlop={12}
                    style={styles.actionBtn}
                  >
                    <Feather name="trash-2" size={14} color={theme.destructive.val} />
                  </Pressable>
                )}
              </XStack>
            )}
          </XStack>
        </>
      )}
    </YStack>
  );
});

export const MemoryCard = React.memo(function MemoryCard({
  memory,
  resolvedTopics,
  onPress,
  onDelete,
  onShare,
  onAddToReview,
  onComplete,
  index = 0,
}: MemoryCardProps) {
  const theme = useAppTheme();

  const menuItems: (ContextMenuItemDef | false)[] = [
    !!(onComplete && isReminder(memory)) && {
      label: "Mark as Completed",
      icon: "check-circle",
      iconColor: "#16a34a",
      onPress: onComplete!,
    },
    !!onShare && {
      label: "Share Memory",
      icon: "share-2",
      iconColor: theme.color.val,
      onPress: onShare,
    },
    !!onAddToReview && {
      label: "Add to Review",
      icon: "repeat",
      iconColor: theme.color.val,
      onPress: onAddToReview,
    },
    !!onDelete && {
      label: "Delete Memory",
      icon: "trash-2",
      destructive: true,
      onPress: onDelete,
    },
  ];

  return (
    <Animated.View entering={FadeIn.delay(Math.min(index * 40, 300)).duration(300)}>
      <ContextMenu
        preview={
          <CardBody memory={memory} resolvedTopics={resolvedTopics} showActions={false} />
        }
        items={menuItems}
        onPress={onPress}
      >
        <CardBody
          memory={memory}
          resolvedTopics={resolvedTopics}
          showActions={Platform.OS === "web"}
          onComplete={onComplete}
          onShare={onShare}
          onAddToReview={onAddToReview}
          onDelete={onDelete}
        />
      </ContextMenu>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  actionBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
  },
});
