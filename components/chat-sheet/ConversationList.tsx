import React, { useState } from "react";
import { Pressable } from "react-native";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { SheetTextInput as BottomSheetTextInput } from "@/components/ui/SheetTextInput";
import { XStack, YStack, Text } from "tamagui";

import { Feather } from "@/lib/icons";
import { useAppTheme } from "@/hooks/useAppTheme";
import { withAlpha } from "@/components/ui/themeHelpers";
import { PressableScale } from "@/components/ui/PressableScale";
import { FontFamily } from "@/constants/fonts";
import type { ChatConversation, ChatSheetController } from "./types";

function formatActivity(timestamp: number) {
  const date = new Date(timestamp);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function ConversationRow({
  title,
  subtitle,
  active,
  icon,
  onPress,
  onRename,
  onArchive,
}: {
  title: string;
  subtitle?: string;
  active: boolean;
  icon: "message-circle" | "message-square";
  onPress: () => void;
  onRename?: (title: string) => void;
  onArchive?: () => void;
}) {
  const theme = useAppTheme();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);

  const commitRename = () => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== title) onRename?.(next);
  };

  return (
    <XStack
      alignItems="center"
      gap={10}
      paddingHorizontal={12}
      paddingVertical={10}
      borderRadius={14}
      backgroundColor={active ? withAlpha(theme.primary.val, "12") : "transparent"}
      borderWidth={1}
      borderColor={active ? withAlpha(theme.primary.val, "24") : "transparent"}
    >
      <XStack
        width={32}
        height={32}
        borderRadius={16}
        alignItems="center"
        justifyContent="center"
        backgroundColor={active ? withAlpha(theme.primary.val, "18") : theme.secondary.val}
      >
        <Feather name={icon} size={14} color={active ? theme.primary.val : theme.colorMuted.val} />
      </XStack>

      {editing ? (
        <BottomSheetTextInput
          value={draft}
          onChangeText={setDraft}
          autoFocus
          onSubmitEditing={commitRename}
          onBlur={commitRename}
          style={{
            flex: 1,
            fontSize: 14,
            fontFamily: FontFamily.semiBold,
            color: theme.color.val,
            paddingVertical: 2,
          }}
        />
      ) : (
        <Pressable onPress={onPress} style={{ flex: 1 }}>
          <YStack>
            <Text
              fontSize={14}
              fontFamily="$body"
              fontWeight={active ? "700" : "600"}
              color={theme.color.val}
              numberOfLines={1}
            >
              {title}
            </Text>
            {subtitle ? (
              <Text fontSize={11} fontFamily="$body" color={theme.colorMuted.val}>
                {subtitle}
              </Text>
            ) : null}
          </YStack>
        </Pressable>
      )}

      {onRename && !editing ? (
        <Pressable
          onPress={() => {
            setDraft(title);
            setEditing(true);
          }}
          hitSlop={8}
        >
          <Feather name="edit-2" size={14} color={theme.colorMuted.val} />
        </Pressable>
      ) : null}
      {onArchive ? (
        <Pressable onPress={onArchive} hitSlop={8}>
          <Feather name="archive" size={14} color={theme.colorMuted.val} />
        </Pressable>
      ) : null}
    </XStack>
  );
}

export function ConversationList({
  controller,
  onClose,
}: {
  controller: ChatSheetController;
  onClose: () => void;
}) {
  const theme = useAppTheme();
  const {
    conversations,
    activeConversationId,
    selectConversation,
    createNewConversation,
    renameConversation,
    archiveConversation,
  } = controller;

  const handleSelect = (conversationId: string | null) => {
    selectConversation(conversationId);
    onClose();
  };

  return (
    <YStack flex={1}>
      <BottomSheetScrollView contentContainerStyle={{ padding: 12, gap: 4 }}>
        <PressableScale
          onPress={() => {
            void createNewConversation().then(onClose);
          }}
        >
          <XStack
            alignItems="center"
            gap={10}
            paddingHorizontal={12}
            paddingVertical={12}
            borderRadius={14}
            borderWidth={1}
            borderStyle="dashed"
            borderColor={withAlpha(theme.primary.val, "40")}
            marginBottom={6}
          >
            <Feather name="plus-circle" size={16} color={theme.primary.val} />
            <Text fontSize={14} fontFamily="$body" fontWeight="700" color={theme.primary.val}>
              New chat
            </Text>
          </XStack>
        </PressableScale>

        <ConversationRow
          title="Main chat"
          subtitle="Your original conversation"
          icon="message-circle"
          active={activeConversationId === null}
          onPress={() => handleSelect(null)}
        />

        {conversations.map((conversation: ChatConversation) => (
          <ConversationRow
            key={conversation._id}
            title={conversation.title}
            subtitle={formatActivity(conversation.lastMessageAt)}
            icon="message-square"
            active={activeConversationId === conversation._id}
            onPress={() => handleSelect(conversation._id)}
            onRename={(title) => renameConversation(conversation._id, title)}
            onArchive={() => archiveConversation(conversation._id)}
          />
        ))}
      </BottomSheetScrollView>
    </YStack>
  );
}
