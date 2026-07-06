import React from "react";
import { Platform, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Text, XStack, YStack } from "tamagui";
import type { Id } from "@/convex/_generated/dataModel";
import { FontFamily } from "@/constants/fonts";
import { ContextMenu, type ContextMenuItemDef } from "@/components/ui/ContextMenu";
import { withAlpha } from "@/components/ui/themeHelpers";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useSemanticColors } from "@/hooks/useSemanticColors";
import { Feather, FontAwesome5 } from "@/lib/icons";
import type { SearchResultItem } from "../types";
import { formatReminderDueAt } from "../rendererUtils";

export const MemoryResultRow = React.memo(function MemoryResultRow({
  item,
  index,
  isCompleted,
  calendarSyncEnabled,
  onComplete,
  onDelete,
  onEdit,
  onTriggerSync,
  onRemoveSync,
  hasFiles = false,
}: {
  item: SearchResultItem;
  index: number;
  isCompleted: boolean;
  calendarSyncEnabled: boolean;
  onComplete: (item: SearchResultItem) => void;
  onDelete: (id: Id<"memories">) => void;
  onEdit: (id: Id<"memories">) => void;
  onTriggerSync: (item: SearchResultItem) => void;
  onRemoveSync: (item: SearchResultItem) => void;
  hasFiles?: boolean;
}) {
  const theme = useAppTheme();
  const semantic = useSemanticColors();
  const isReminder = item.entry_kind === "reminder" || !!item.schedule_due_at;
  const hasGoogleSyncInfo = !!(
    item.google_event_id ||
    item.google_sync_status ||
    item.google_sync_message
  );
  const dueAtLabel = formatReminderDueAt(item.schedule_due_at);
  const success = theme.success.val;
  const syncTone =
    item.google_sync_status === "synced"
      ? {
          border: withAlpha(theme.success.val, "47"),
          bg: theme.surfaceSuccessSoft.val,
          label: "synced",
          labelColor: theme.textSuccess.val,
        }
      : item.google_sync_status === "failed"
        ? {
            border: withAlpha(theme.destructive.val, "3D"),
            bg: theme.surfaceDangerSoft.val,
            label: "sync failed",
            labelColor: theme.textError.val,
          }
        : {
            border: withAlpha(theme.warning.val, "3D"),
            bg: withAlpha(theme.warning.val, "14"),
            label: "syncing…",
            labelColor: theme.textWarning.val,
          };
  const showTriggerSyncAction =
    calendarSyncEnabled &&
    isReminder &&
    (!hasGoogleSyncInfo || item.google_sync_status === "failed");
  const showRemoveSyncAction = calendarSyncEnabled && isReminder && hasGoogleSyncInfo;

  const menuItems: ContextMenuItemDef[] = [
    ...(isReminder && !isCompleted
      ? [
          {
            label: "Mark as Completed",
            icon: "check-circle",
            iconColor: success,
            onPress: () => onComplete(item),
          } satisfies ContextMenuItemDef,
        ]
      : []),
    ...(showTriggerSyncAction
      ? [
          {
            label:
              item.google_sync_status === "failed" ? "Retry Calendar Sync" : "Sync to Calendar",
            icon: "refresh-cw",
            iconColor: theme.primary.val,
            onPress: () => onTriggerSync(item),
          } satisfies ContextMenuItemDef,
        ]
      : []),
    ...(showRemoveSyncAction
      ? [
          {
            label: "Remove Calendar Sync",
            icon: "link-2",
            destructive: true,
            onPress: () => onRemoveSync(item),
          } satisfies ContextMenuItemDef,
        ]
      : []),
    {
      label: "Edit Memory",
      icon: "edit-2",
      onPress: () => onEdit(item.id),
    } satisfies ContextMenuItemDef,
    {
      label: "Delete",
      icon: "trash-2",
      destructive: true,
      onPress: () => onDelete(item.id),
    } satisfies ContextMenuItemDef,
  ];

  const previewCard = (
    <YStack padding={14} gap={8}>
      <XStack gap={10} alignItems="center">
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: isReminder ? `${theme.warning.val}18` : `${theme.primary.val}15`,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Feather
            name={isReminder ? "bell" : "file-text"}
            size={16}
            color={isReminder ? theme.warning.val : theme.primary.val}
          />
        </View>
        <YStack flex={1} gap={2}>
          <Text
            fontSize={14}
            fontFamily={FontFamily.semiBold}
            color={theme.color.val}
            numberOfLines={2}
          >
            {item.title || "Untitled memory"}
          </Text>
          {item.entry_kind ? (
            <Text fontSize={11} color={theme.colorMuted.val}>
              {isReminder ? "Reminder" : "Memory"}
            </Text>
          ) : null}
        </YStack>
      </XStack>
      {item.content ? (
        <Text fontSize={12} fontFamily="$body" color={theme.colorMuted.val} numberOfLines={3}>
          {item.content}
        </Text>
      ) : null}
      {isReminder && dueAtLabel ? (
        <XStack alignItems="center" gap={5}>
          <Feather name="bell" size={11} color={theme.primary.val} />
          <Text fontSize={11} fontFamily={FontFamily.semiBold} color={theme.primary.val}>
            {dueAtLabel}
          </Text>
        </XStack>
      ) : null}
      {isReminder && (hasGoogleSyncInfo || hasFiles) ? (
        <XStack marginTop={6} gap={6} alignItems="center" flexWrap="wrap">
          {isReminder && hasGoogleSyncInfo ? (
            <XStack
              alignItems="center"
              gap={4}
              paddingHorizontal={8}
              paddingVertical={5}
              borderRadius={20}
              borderWidth={1}
              borderColor={syncTone.border}
              backgroundColor={syncTone.bg}
            >
              <FontAwesome5 name="calendar-alt" size={12} color={syncTone.labelColor} />
              <Text fontSize={11} fontFamily={FontFamily.semiBold} color={syncTone.labelColor}>
                {syncTone.label}
              </Text>
            </XStack>
          ) : null}
          {hasFiles ? (
            <XStack
              alignItems="center"
              gap={4}
              paddingHorizontal={8}
              paddingVertical={5}
              borderRadius={20}
              borderWidth={1}
              borderColor={withAlpha(semantic.integration.googleDrive, "40")}
              backgroundColor={withAlpha(semantic.integration.googleDrive, "12")}
            >
              <FontAwesome5
                name="google-drive"
                iconStyle="brand"
                size={12}
                color={semantic.integration.googleDrive}
              />
              <Text
                fontSize={11}
                fontFamily={FontFamily.semiBold}
                color={semantic.integration.googleDrive}
              >
                in Drive
              </Text>
            </XStack>
          ) : null}
        </XStack>
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
      opacity={isCompleted ? 0.45 : 1}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: isCompleted
            ? withAlpha(success, "20")
            : isReminder
              ? withAlpha(theme.warning.val, "18")
              : withAlpha(theme.primary.val, "15"),
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Feather
          name={isCompleted ? "check" : isReminder ? "bell" : "file-text"}
          size={14}
          color={isCompleted ? success : isReminder ? theme.warning.val : theme.primary.val}
        />
      </View>

      <YStack flex={1} gap={6}>
        <Text
          fontSize={13}
          fontFamily={FontFamily.semiBold}
          color={theme.color.val}
          numberOfLines={1}
          textDecorationLine={isCompleted ? "line-through" : "none"}
        >
          {item.title || "Untitled memory"}
        </Text>
        {item.content ? (
          <Text fontSize={11} fontFamily="$body" color={theme.colorMuted.val} numberOfLines={1}>
            {item.content}
          </Text>
        ) : null}
        {isReminder && dueAtLabel ? (
          <XStack alignItems="center" gap={5}>
            <Feather name="bell" size={10} color={theme.primary.val} />
            <Text fontSize={10} fontFamily={FontFamily.semiBold} color={theme.primary.val}>
              {dueAtLabel}
            </Text>
          </XStack>
        ) : null}
        {(isReminder && hasGoogleSyncInfo) || hasFiles ? (
          <XStack marginTop={2} gap={5} alignItems="center" flexWrap="wrap">
            {isReminder && hasGoogleSyncInfo ? (
              <XStack
                alignItems="center"
                gap={4}
                paddingHorizontal={7}
                paddingVertical={4}
                borderRadius={20}
                borderWidth={1}
                borderColor={syncTone.border}
                backgroundColor={syncTone.bg}
              >
                <FontAwesome5 name="calendar-alt" size={10} color={syncTone.labelColor} />
                <Text fontSize={10} fontFamily={FontFamily.semiBold} color={syncTone.labelColor}>
                  {syncTone.label}
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
                borderColor={withAlpha(semantic.integration.googleDrive, "40")}
                backgroundColor={withAlpha(semantic.integration.googleDrive, "12")}
              >
                <FontAwesome5
                  name="google-drive"
                  iconStyle="brand"
                  size={10}
                  color={semantic.integration.googleDrive}
                />
                <Text
                  fontSize={10}
                  fontFamily={FontFamily.semiBold}
                  color={semantic.integration.googleDrive}
                >
                  in Drive
                </Text>
              </XStack>
            ) : null}
          </XStack>
        ) : null}
      </YStack>

      <XStack gap={4} alignItems="center">
        {item._score !== undefined ? (
          <Text fontSize={10} color={theme.colorMuted.val} opacity={0.5}>
            {Math.round(item._score * 100)}%
          </Text>
        ) : null}
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
