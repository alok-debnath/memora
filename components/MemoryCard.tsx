import React from "react";
import { Pressable, Platform, StyleSheet } from "react-native";
import { Feather, FontAwesome5 } from "@expo/vector-icons";
import Animated, { FadeIn } from "react-native-reanimated";
import { XStack, YStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import type { MemoryNote } from "@/types/memory";
import { getReminderDate, isReminder } from "@/types/memoryKind";
import { ContextMenu, type ContextMenuItemDef } from "./ui/ContextMenu";
import { integrationAccentColors, statusAccentColors } from "@/constants/colors";
import { withAlpha } from "@/components/ui/themeHelpers";

interface MemoryCardProps {
  memory: MemoryNote;
  resolvedTopics?: Array<{ name: string; color?: string | null }>;
  onPress?: () => void;
  onDelete?: () => void;
  onShare?: () => void;
  onAddToReview?: () => void;
  onComplete?: () => void;
  onTriggerSync?: () => void;
  onRemoveSync?: () => void;
  index?: number;
  /** True when this memory has ≥1 Drive file attachment */
  hasFiles?: boolean;
}

interface CardBodyProps {
  memory: MemoryNote;
  resolvedTopics?: Array<{ name: string; color?: string | null }>;
  onComplete?: () => void;
  onShare?: () => void;
  onAddToReview?: () => void;
  onDelete?: () => void;
  showActions?: boolean;
  /** True when this memory has ≥1 Drive file attachment */
  hasFiles?: boolean;
  framed?: boolean;
}

function getReminderSyncTone(theme: ReturnType<typeof useAppTheme>, memory: MemoryNote) {
  if (memory.googleSyncStatus === "synced") {
    return {
      border: withAlpha(theme.success.val, "47"),
      bg: theme.surfaceSuccessSoft.val,
      label: "synced",
      labelColor: theme.textSuccess.val,
    };
  }

  if (memory.googleSyncStatus === "failed") {
    return {
      border: withAlpha(theme.destructive.val, "3D"),
      bg: theme.surfaceDangerSoft.val,
      label: "sync failed",
      labelColor: theme.textError.val,
    };
  }

  return {
    border: withAlpha(theme.warning.val, "3D"),
    bg: withAlpha(theme.warning.val, "14"),
    label: "syncing…",
    labelColor: theme.textWarning.val,
  };
}

export const CardBody = React.memo(function CardBody({
  memory,
  resolvedTopics,
  onComplete,
  onShare,
  onAddToReview,
  onDelete,
  showActions = false,
  hasFiles = false,
  framed = true,
}: CardBodyProps) {
  const theme = useAppTheme();
  const hasGoogleSyncInfo = !!(
    memory.googleSyncStatus ||
    memory.googleEventId ||
    memory.googleSyncMessage
  );
  const reminderSyncTone =
    isReminder(memory) && hasGoogleSyncInfo ? getReminderSyncTone(theme, memory) : null;
  // Determine whether to reserve the bottom row space — only when there's a reminder date or sync info
  const hasBottomRow = !!((isReminder(memory) && getReminderDate(memory)) || reminderSyncTone);

  const isLocked = memory.capsuleUnlockDate && new Date(memory.capsuleUnlockDate) > new Date();

  return (
    <YStack
      backgroundColor={framed ? "$card" : "transparent"}
      borderColor={framed ? "$borderColor" : "transparent"}
      borderWidth={framed ? 1 : 0}
      borderRadius={framed ? 16 : 0}
      padding={16}
      position="relative"
      overflow={framed ? "hidden" : "visible"}
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
          borderRadius={framed ? 16 : 0}
          gap={6}
        >
          <Feather name="lock" size={24} color={theme.colorMuted.val} />
          <Text fontSize={12} fontFamily="$body" fontWeight="500" color="$colorMuted">
            Unlocks {new Date(memory.capsuleUnlockDate!).toLocaleDateString()}
          </Text>
        </YStack>
      )}

      <XStack alignItems="baseline" justifyContent="space-between" gap={8} marginBottom={8}>
        <Text
          flex={1}
          fontSize={15}
          fontFamily="$body"
          fontWeight="600"
          color="$color"
          numberOfLines={1}
        >
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

          {resolvedTopics && resolvedTopics.length > 0 && (
            <XStack flexWrap="wrap" alignItems="center" gap={6} marginBottom={10}>
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

          <XStack
            alignItems="center"
            justifyContent="space-between"
            minHeight={hasBottomRow ? 24 : undefined}
          >
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
                    onPress={(e) => {
                      e.stopPropagation();
                      onComplete();
                    }}
                    hitSlop={12}
                    style={styles.actionBtn}
                  >
                    <Feather
                      name="check-circle"
                      size={14}
                      color={statusAccentColors.successStrong}
                    />
                  </Pressable>
                )}
                {onShare && (
                  <Pressable
                    onPress={(e) => {
                      e.stopPropagation();
                      onShare();
                    }}
                    hitSlop={12}
                    style={styles.actionBtn}
                  >
                    <Feather name="share-2" size={14} color={theme.colorMuted.val} />
                  </Pressable>
                )}
                {onAddToReview && (
                  <Pressable
                    onPress={(e) => {
                      e.stopPropagation();
                      onAddToReview();
                    }}
                    hitSlop={12}
                    style={styles.actionBtn}
                  >
                    <Feather name="repeat" size={14} color={theme.colorMuted.val} />
                  </Pressable>
                )}
                {onDelete && (
                  <Pressable
                    onPress={(e) => {
                      e.stopPropagation();
                      onDelete();
                    }}
                    hitSlop={12}
                    style={styles.actionBtn}
                  >
                    <Feather name="trash-2" size={14} color={theme.destructive.val} />
                  </Pressable>
                )}
              </XStack>
            )}
          </XStack>

          {reminderSyncTone || hasFiles ? (
            <XStack marginTop={8} gap={6} alignItems="center" flexWrap="wrap">
              {reminderSyncTone ? (
                <XStack
                  alignItems="center"
                  gap={4}
                  paddingHorizontal={7}
                  paddingVertical={4}
                  borderRadius={20}
                  borderWidth={1}
                  borderColor={reminderSyncTone.border}
                  backgroundColor={reminderSyncTone.bg}
                >
                  <FontAwesome5 name="calendar-alt" size={11} color={reminderSyncTone.labelColor} />
                  <Text
                    fontSize={10}
                    fontFamily="$body"
                    fontWeight="600"
                    color={reminderSyncTone.labelColor}
                  >
                    {reminderSyncTone.label}
                  </Text>
                </XStack>
              ) : null}
              {hasFiles ? (
                <XStack
                  alignItems="center"
                  gap={4}
                  paddingHorizontal={7}
                  paddingVertical={4}
                  borderRadius={20}
                  borderWidth={1}
                  borderColor={withAlpha(integrationAccentColors.googleDrive, "40")}
                  backgroundColor={withAlpha(integrationAccentColors.googleDrive, "12")}
                >
                  <FontAwesome5
                    name="google-drive"
                    size={11}
                    color={integrationAccentColors.googleDrive}
                  />
                  <Text
                    fontSize={10}
                    fontFamily="$body"
                    fontWeight="600"
                    color={integrationAccentColors.googleDrive}
                  >
                    in Drive
                  </Text>
                </XStack>
              ) : null}
            </XStack>
          ) : null}
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
  onTriggerSync,
  onRemoveSync,
  index = 0,
  hasFiles = false,
}: MemoryCardProps) {
  const theme = useAppTheme();
  const reminderHasSyncInfo =
    isReminder(memory) &&
    !!(memory.googleSyncStatus || memory.googleEventId || memory.googleSyncMessage);
  const canTriggerSync =
    isReminder(memory) &&
    !!onTriggerSync &&
    (!reminderHasSyncInfo || memory.googleSyncStatus === "failed");
  const canRemoveSync = isReminder(memory) && !!onRemoveSync && reminderHasSyncInfo;

  const menuItems: ContextMenuItemDef[] = [
    ...(onComplete && isReminder(memory)
      ? [
          {
            label: "Mark as Completed",
            icon: "check-circle",
            iconColor: statusAccentColors.successStrong,
            onPress: onComplete!,
          },
        ]
      : []),
    ...(canTriggerSync
      ? [
          {
            label:
              memory.googleSyncStatus === "failed" ? "Retry Calendar Sync" : "Sync to Calendar",
            icon: "refresh-cw",
            iconColor: theme.primary.val,
            onPress: onTriggerSync!,
          },
        ]
      : []),
    ...(canRemoveSync
      ? [
          {
            label: "Remove Calendar Sync",
            icon: "link-2",
            destructive: true,
            onPress: onRemoveSync!,
          },
        ]
      : []),
    ...(onShare
      ? [
          {
            label: "Share Memory",
            icon: "share-2",
            iconColor: theme.color.val,
            onPress: onShare,
          },
        ]
      : []),
    ...(onAddToReview
      ? [
          {
            label: "Add to Review",
            icon: "repeat",
            iconColor: theme.color.val,
            onPress: onAddToReview,
          },
        ]
      : []),
    ...(onDelete
      ? [
          {
            label: "Delete Memory",
            icon: "trash-2",
            destructive: true,
            onPress: onDelete,
          },
        ]
      : []),
  ];

  return (
    <Animated.View entering={FadeIn.delay(Math.min(index * 40, 300)).duration(300)}>
      <ContextMenu
        preview={
          <CardBody
            memory={memory}
            resolvedTopics={resolvedTopics}
            showActions={false}
            hasFiles={hasFiles}
            framed={false}
          />
        }
        previewFrame
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
          hasFiles={hasFiles}
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
