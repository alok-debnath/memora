import React, { useState } from "react";
import { Alert, Platform, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { Text, XStack, YStack } from "tamagui";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { GradientButton } from "@/components/ui/GradientButton";
import { PressableScale } from "@/components/ui/PressableScale";
import { MorePageScaffold } from "@/components/ui/MorePageScaffold";
import { useAuth } from "@/hooks/useAuth";
import { useAppTheme } from "@/hooks/useAppTheme";

function formatDeletedAt(value?: number) {
  if (!value) return "Deleted recently";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function DataScreen() {
  const theme = useAppTheme();
  const { token } = useAuth();
  const [openMenuId, setOpenMenuId] = useState<Id<"memories"> | null>(null);
  const deletedMemories = useQuery(
    api.memories.listDeleted,
    token ? { token, limit: 100 } : "skip"
  ) ?? [];
  const restoreMemory = useMutation(api.memories.restore);
  const permanentlyRemoveMemory = useMutation(api.memories.permanentlyRemove);
  const permanentlyRemoveAllDeleted = useMutation(api.memories.permanentlyRemoveAllDeleted);
  const clearAllMemoryData = useMutation(api.memories.clearAllUserMemoryData);

  const handleRestore = (memoryId: Id<"memories">) => {
    if (!token) return;
    setOpenMenuId(null);

    const runRestore = async () => {
      try {
        await restoreMemory({ token, id: memoryId });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to restore memory.";
        if (Platform.OS === "web") {
          window.alert(message);
        } else {
          Alert.alert("Restore failed", message);
        }
      }
    };

    if (Platform.OS === "web") {
      if (window.confirm("Restore this memory back into your active vault?")) {
        void runRestore();
      }
      return;
    }

    Alert.alert("Restore Memory", "Restore this memory back into your active vault?", [
      { text: "Cancel", style: "cancel" },
      { text: "Restore", onPress: () => void runRestore() },
    ]);
  };

  const handleClearSlate = () => {
    if (!token) return;

    const runDelete = async () => {
      try {
        await clearAllMemoryData({ token });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to clear memory data.";
        if (Platform.OS === "web") {
          window.alert(message);
        } else {
          Alert.alert("Clear slate failed", message);
        }
      }
    };

    const message =
      "This deletes all memories, reminders, topic links, review cards, attachments, and deleted items for a clean slate.";
    if (Platform.OS === "web") {
      if (window.confirm(message)) {
        void runDelete();
      }
      return;
    }

    Alert.alert("Delete All Memory Data", message, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete all", style: "destructive", onPress: () => void runDelete() },
    ]);
  };

  const handlePermanentDelete = (memoryId: Id<"memories">) => {
    if (!token) return;
    setOpenMenuId(null);

    const runDelete = async () => {
      try {
        await permanentlyRemoveMemory({ token, id: memoryId });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to permanently delete memory.";
        if (Platform.OS === "web") {
          window.alert(message);
        } else {
          Alert.alert("Delete failed", message);
        }
      }
    };

    const message = "Permanently delete this memory? This cannot be undone.";
    if (Platform.OS === "web") {
      if (window.confirm(message)) {
        void runDelete();
      }
      return;
    }

    Alert.alert("Permanent Delete", message, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete forever", style: "destructive", onPress: () => void runDelete() },
    ]);
  };

  const handlePermanentDeleteAll = () => {
    if (!token) return;

    const runDelete = async () => {
      try {
        await permanentlyRemoveAllDeleted({ token });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to permanently delete deleted memories.";
        if (Platform.OS === "web") {
          window.alert(message);
        } else {
          Alert.alert("Delete failed", message);
        }
      }
    };

    const message =
      "Permanently delete all items currently in Deleted memories? This cannot be undone.";
    if (Platform.OS === "web") {
      if (window.confirm(message)) {
        void runDelete();
      }
      return;
    }

    Alert.alert("Permanent Delete All", message, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete all forever", style: "destructive", onPress: () => void runDelete() },
    ]);
  };

  return (
    <MorePageScaffold title="Data">
      <Card style={{ padding: 18, borderRadius: 26 }}>
        <YStack gap={14}>
          <XStack alignItems="flex-start" justifyContent="space-between" gap={12}>
            <YStack flex={1} gap={6}>
              <Badge label="Data Controls" color={theme.primary.val} />
              <Text fontSize={24} lineHeight={30} fontFamily="$heading" fontWeight="700" color="$color">
                Restore trash or start over
              </Text>
              <Text fontSize={14} lineHeight={20} fontFamily="$body" color="$colorMuted">
                Deleted memories stay here until you restore them. If you want a complete reset, wipe the current memory vault.
              </Text>
            </YStack>
            <YStack
              width={52}
              height={52}
              borderRadius={18}
              alignItems="center"
              justifyContent="center"
              backgroundColor={theme.primary.val + "18"}
            >
              <Feather name="database" size={22} color={theme.primary.val} />
            </YStack>
          </XStack>

          <XStack gap={10} flexWrap="wrap">
            <Badge
              label={
                deletedMemories.length > 0
                  ? `${deletedMemories.length} deleted items`
                  : "Trash empty"
              }
              color={deletedMemories.length > 0 ? "#D97706" : undefined}
            />
            <Badge label="Restore anytime" />
          </XStack>
        </YStack>
      </Card>

      <Card style={{ padding: 18, borderRadius: 26 }}>
        <YStack gap={14}>
          <YStack gap={4}>
            <Text fontSize={18} fontFamily="$heading" fontWeight="700" color="$color">
              Deleted memories
            </Text>
            <Text fontSize={13} fontFamily="$body" color="$colorMuted">
              Restore deleted memories or permanently delete them one by one or all together.
            </Text>
          </YStack>

          {deletedMemories.length > 0 ? (
            <XStack justifyContent="flex-end">
              <PressableScale
                onPress={handlePermanentDeleteAll}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderRadius: 14,
                  backgroundColor: theme.destructive.val + "16",
                }}
              >
                <Text fontSize={12} fontFamily="$body" fontWeight="700" color="$destructive">
                  Delete all forever
                </Text>
              </PressableScale>
            </XStack>
          ) : null}

          {deletedMemories.length === 0 ? (
            <EmptyState
              icon="archive"
              title="Trash is empty"
              description="When you delete a memory or reminder, it will appear here until you restore it or wipe the vault."
            />
          ) : (
            <YStack gap={10}>
              {deletedMemories.map((memory) => (
                <XStack
                  key={memory._id}
                  alignItems="center"
                  gap={12}
                  padding={14}
                  borderRadius={18}
                  borderWidth={1}
                  borderColor={theme.borderColor.val}
                  backgroundColor={theme.background.val}
                  position="relative"
                >
                  <YStack
                    width={40}
                    height={40}
                    borderRadius={12}
                    alignItems="center"
                    justifyContent="center"
                    backgroundColor={"#D97706" + "18"}
                  >
                    <Feather name="archive" size={18} color="#D97706" />
                  </YStack>
                  <YStack flex={1} gap={3}>
                    <Text fontSize={15} fontFamily="$body" fontWeight="600" color="$color" numberOfLines={1}>
                      {memory.title?.trim() || "Untitled memory"}
                    </Text>
                    <Text
                      fontSize={12}
                      fontFamily="$body"
                      color="$colorMuted"
                      lineHeight={18}
                      numberOfLines={2}
                    >
                      {memory.content?.trim() || "No preview available"}
                    </Text>
                    <Text fontSize={11} fontFamily="$body" color="$colorMuted">
                      {formatDeletedAt(memory.deletedAt)}
                    </Text>
                  </YStack>
                  <PressableScale
                    onPress={() =>
                      setOpenMenuId((current) => (current === memory._id ? null : memory._id))
                    }
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 17,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: theme.secondary.val,
                    }}
                  >
                    <Feather name="more-vertical" size={16} color={theme.colorMuted.val} />
                  </PressableScale>

                  {openMenuId === memory._id ? (
                    <Pressable
                      onPress={() => setOpenMenuId(null)}
                      style={{
                        position: "absolute",
                        top: -2000,
                        right: -2000,
                        bottom: -2000,
                        left: -2000,
                        zIndex: 9,
                      }}
                    />
                  ) : null}

                  {openMenuId === memory._id ? (
                    <YStack
                      position="absolute"
                      right={10}
                      top={52}
                      zIndex={10}
                      borderRadius={14}
                      borderWidth={1}
                      borderColor={theme.borderColor.val}
                      backgroundColor={theme.card.val}
                      overflow="hidden"
                    >
                      <PressableScale
                        onPress={() => handleRestore(memory._id)}
                        style={{
                          paddingHorizontal: 14,
                          paddingVertical: 11,
                          minWidth: 150,
                        }}
                      >
                        <Text fontSize={13} fontFamily="$body" fontWeight="600" color={theme.primary.val}>
                          Restore
                        </Text>
                      </PressableScale>
                      <YStack height={1} backgroundColor={theme.borderColor.val} />
                      <PressableScale
                        onPress={() => handlePermanentDelete(memory._id)}
                        style={{
                          paddingHorizontal: 14,
                          paddingVertical: 11,
                          minWidth: 150,
                        }}
                      >
                        <Text fontSize={13} fontFamily="$body" fontWeight="600" color="$destructive">
                          Delete forever
                        </Text>
                      </PressableScale>
                    </YStack>
                  ) : null}
                </XStack>
              ))}
            </YStack>
          )}
        </YStack>
      </Card>

      <Card style={{ padding: 18, borderRadius: 26 }}>
        <YStack gap={14}>
          <YStack gap={4}>
            <Text fontSize={18} fontFamily="$heading" fontWeight="700" color="$color">
              Clean slate
            </Text>
            <Text fontSize={13} fontFamily="$body" color="$colorMuted">
              This removes all memories, reminders, review cards, topic links, attachments, and deleted items from your account.
            </Text>
          </YStack>
          <GradientButton
            title="Delete All Memory Data"
            icon="trash-2"
            onPress={handleClearSlate}
          />
        </YStack>
      </Card>
    </MorePageScaffold>
  );
}
