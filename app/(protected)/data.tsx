import React, { useState } from "react";
import { Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { Text, XStack, YStack } from "tamagui";
import Animated, { FadeInDown } from "react-native-reanimated";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { GradientButton } from "@/components/ui/GradientButton";
import { PressableScale } from "@/components/ui/PressableScale";
import { MorePageScaffold } from "@/components/ui/MorePageScaffold";
import { useAppConfirm } from "@/components/ui/confirm/AppConfirmProvider";
import { useAuth } from "@/hooks/useAuth";
import { useAppTheme } from "@/hooks/useAppTheme";
import { statusAccentColors } from "@/constants/colors";

function formatTs(value?: number, fallback = "Recently") {
  if (!value) return fallback;
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type MemoryRowProps = {
  title?: string;
  content?: string;
  timestamp?: number;
  timestampLabel?: string;
  accentColor: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  menuOpen: boolean;
  onMenuToggle: () => void;
  menuItems: Array<{ label: string; color?: string; onPress: () => void }>;
};

function MemoryRow({
  title,
  content,
  timestamp,
  timestampLabel,
  accentColor,
  icon,
  menuOpen,
  onMenuToggle,
  menuItems,
}: MemoryRowProps) {
  const theme = useAppTheme();
  return (
    <XStack
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
        backgroundColor={accentColor + "18"}
      >
        <Feather name={icon} size={18} color={accentColor} />
      </YStack>
      <YStack flex={1} gap={3}>
        <Text fontSize={15} fontFamily="$body" fontWeight="600" color="$color" numberOfLines={1}>
          {title?.trim() || "Untitled memory"}
        </Text>
        <Text
          fontSize={12}
          fontFamily="$body"
          color="$colorMuted"
          lineHeight={18}
          numberOfLines={2}
        >
          {content?.trim() || "No preview available"}
        </Text>
        <Text fontSize={11} fontFamily="$body" color="$colorMuted">
          {timestampLabel} {formatTs(timestamp)}
        </Text>
      </YStack>
      <PressableScale
        onPress={onMenuToggle}
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

      {menuOpen && (
        <Pressable
          onPress={onMenuToggle}
          style={{
            position: "absolute",
            top: -2000,
            right: -2000,
            bottom: -2000,
            left: -2000,
            zIndex: 9,
          }}
        />
      )}

      {menuOpen && (
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
          {menuItems.map((item, i) => (
            <React.Fragment key={item.label}>
              {i > 0 && <YStack height={1} backgroundColor={theme.borderColor.val} />}
              <PressableScale
                onPress={item.onPress}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 11,
                  minWidth: 160,
                }}
              >
                <Text
                  fontSize={13}
                  fontFamily="$body"
                  fontWeight="600"
                  color={item.color ?? theme.primary.val}
                >
                  {item.label}
                </Text>
              </PressableScale>
            </React.Fragment>
          ))}
        </YStack>
      )}
    </XStack>
  );
}

// ─── Segmented tab control ───────────────────────────────────────────────────

function TabPill({
  label,
  count,
  active,
  onPress,
}: {
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  const theme = useAppTheme();
  return (
    <PressableScale
      onPress={onPress}
      style={{
        flex: 1,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 12,
        backgroundColor: active ? theme.primary.val + "20" : "transparent",
        alignItems: "center",
        flexDirection: "row",
        justifyContent: "center",
        gap: 6,
      }}
    >
      <Text
        fontSize={13}
        fontFamily="$body"
        fontWeight={active ? "700" : "500"}
        color={active ? "$primary" : "$colorMuted"}
      >
        {label}
      </Text>
      {count > 0 && (
        <YStack
          backgroundColor={active ? theme.primary.val : theme.secondary.val}
          borderRadius={99}
          paddingHorizontal={6}
          paddingVertical={1}
          minWidth={20}
          alignItems="center"
        >
          <Text
            fontSize={10}
            fontFamily="$body"
            fontWeight="700"
            color={active ? "white" : "$colorMuted"}
          >
            {count}
          </Text>
        </YStack>
      )}
    </PressableScale>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function DataScreen() {
  const theme = useAppTheme();
  const { token } = useAuth();
  const { confirm } = useAppConfirm();
  const [activeTab, setActiveTab] = useState<"deleted" | "completed">("deleted");
  const [openMenuId, setOpenMenuId] = useState<Id<"memories"> | null>(null);

  // Deleted
  const deletedMemories =
    useQuery(api.memories.listDeleted, token ? { token, limit: 100 } : "skip") ?? [];
  const restoreMemory = useMutation(api.memories.restore);
  const permanentlyRemoveMemory = useMutation(api.memories.permanentlyRemove);
  const permanentlyRemoveAllDeleted = useMutation(api.memories.permanentlyRemoveAllDeleted);

  // Completed
  const completedMemories =
    useQuery(api.memories.listCompleted, token ? { token, limit: 100 } : "skip") ?? [];
  const uncompleteMemory = useMutation(api.memories.uncomplete);
  const permanentlyRemoveCompleted = useMutation(api.memories.permanentlyRemoveCompleted);
  const permanentlyRemoveAllCompleted = useMutation(api.memories.permanentlyRemoveAllCompleted);

  const clearAllMemoryData = useMutation(api.memories.clearAllUserMemoryData);

  // ── helpers ──────────────────────────────────────────────────────────────

  async function confirmAction(title: string, message: string, onConfirm: () => void) {
    const confirmed = await confirm({
      title,
      message,
      tone: title.toLowerCase().includes("restore") ? "default" : "destructive",
      confirmLabel: title.toLowerCase().includes("restore") ? "Restore" : "Confirm",
      icon: title.toLowerCase().includes("restore") ? "rotate-ccw" : "trash-2",
    });
    if (confirmed) onConfirm();
  }

  function handleRestore(id: Id<"memories">) {
    setOpenMenuId(null);
    void confirmAction("Restore Memory", "Restore this memory back into your active vault?", () => {
      if (token) void restoreMemory({ token, id });
    });
  }

  function handlePermanentDelete(id: Id<"memories">) {
    setOpenMenuId(null);
    void confirmAction(
      "Delete Forever",
      "Permanently delete this memory? This cannot be undone.",
      () => {
        if (token) void permanentlyRemoveMemory({ token, id });
      },
    );
  }

  function handlePermanentDeleteAll() {
    void confirmAction(
      "Clear All Deleted",
      "Permanently delete all items in the Deleted tab? This cannot be undone.",
      () => {
        if (token) void permanentlyRemoveAllDeleted({ token });
      },
    );
  }

  function handleUncomplete(id: Id<"memories">) {
    setOpenMenuId(null);
    void confirmAction(
      "Restore to Active",
      "Move this completed item back to your active memories?",
      () => {
        if (token) void uncompleteMemory({ token, id });
      },
    );
  }

  function handlePermanentRemoveCompleted(id: Id<"memories">) {
    setOpenMenuId(null);
    void confirmAction(
      "Delete Forever",
      "Permanently delete this completed item? This cannot be undone.",
      () => {
        if (token) void permanentlyRemoveCompleted({ token, id });
      },
    );
  }

  function handleClearAllCompleted() {
    void confirmAction(
      "Clear All Completed",
      "Permanently delete all completed reminders? This cannot be undone.",
      () => {
        if (token) void permanentlyRemoveAllCompleted({ token });
      },
    );
  }

  function handleClearSlate() {
    void confirmAction(
      "Delete All Memory Data",
      "This removes ALL memories, reminders, review cards, topic links, attachments, completed items, and deleted items from your account.",
      () => {
        if (token) void clearAllMemoryData({ token });
      },
    );
  }

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <MorePageScaffold title="Data" staticHeader>
      {/* Header card */}
      <Card style={{ padding: 18, borderRadius: 26 }}>
        <YStack gap={14}>
          <XStack alignItems="flex-start" justifyContent="space-between" gap={12}>
            <YStack flex={1} gap={6}>
              <Badge label="Data Controls" color={theme.primary.val} />
              <Text
                fontSize={24}
                lineHeight={30}
                fontFamily="$heading"
                fontWeight="700"
                color="$color"
              >
                Manage your memory vault
              </Text>
              <Text fontSize={14} lineHeight={20} fontFamily="$body" color="$colorMuted">
                View deleted memories, completed reminders, and manage your data.
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
        </YStack>
      </Card>

      {/* Tabbed deleted / completed section */}
      <Card style={{ padding: 18, borderRadius: 26 }}>
        <YStack gap={14}>
          {/* Tab pills */}
          <XStack backgroundColor={theme.secondary.val} borderRadius={14} padding={4} gap={4}>
            <TabPill
              label="Deleted"
              count={deletedMemories.length}
              active={activeTab === "deleted"}
              onPress={() => {
                setActiveTab("deleted");
                setOpenMenuId(null);
              }}
            />
            <TabPill
              label="Completed"
              count={completedMemories.length}
              active={activeTab === "completed"}
              onPress={() => {
                setActiveTab("completed");
                setOpenMenuId(null);
              }}
            />
          </XStack>

          {/* Deleted tab */}
          {activeTab === "deleted" && (
            <Animated.View entering={FadeInDown.duration(300)}>
              <YStack gap={14}>
                <YStack gap={4}>
                  <Text fontSize={17} fontFamily="$heading" fontWeight="700" color="$color">
                    Deleted memories
                  </Text>
                  <Text fontSize={13} fontFamily="$body" color="$colorMuted">
                    Deleted memories are moved to trash and stay here until you remove them forever.
                    You can restore any item at any time — there is no auto-expiry.
                  </Text>
                  <XStack
                    marginTop={4}
                    backgroundColor={theme.primary.val + "12"}
                    borderRadius={12}
                    padding={10}
                    gap={8}
                    alignItems="flex-start"
                  >
                    <Feather
                      name="info"
                      size={13}
                      color={theme.primary.val}
                      style={{ marginTop: 1 }}
                    />
                    <Text
                      fontSize={12}
                      fontFamily="$body"
                      color={theme.primary.val}
                      flex={1}
                      lineHeight={17}
                    >
                      Edit &amp; undo history is kept for 7 days. After that, you can still restore
                      deleted memories but cannot undo individual edits.
                    </Text>
                  </XStack>
                </YStack>
                {deletedMemories.length > 0 && (
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
                )}
                {deletedMemories.length === 0 ? (
                  <EmptyState
                    icon="archive"
                    title="Trash is empty"
                    description="Deleted memories appear here until restored or permanently removed."
                  />
                ) : (
                  <YStack gap={10}>
                    {deletedMemories.map((memory) => (
                      <MemoryRow
                        key={memory._id}
                        title={memory.title}
                        content={memory.content}
                        timestamp={memory.deletedAt}
                        timestampLabel="Deleted"
                        accentColor={statusAccentColors.warningStrong}
                        icon="archive"
                        menuOpen={openMenuId === memory._id}
                        onMenuToggle={() =>
                          setOpenMenuId((cur) => (cur === memory._id ? null : memory._id))
                        }
                        menuItems={[
                          {
                            label: "Restore",
                            onPress: () => handleRestore(memory._id),
                          },
                          {
                            label: "Delete forever",
                            color: theme.destructive.val,
                            onPress: () => handlePermanentDelete(memory._id),
                          },
                        ]}
                      />
                    ))}
                  </YStack>
                )}
              </YStack>
            </Animated.View>
          )}

          {/* Completed tab */}
          {activeTab === "completed" && (
            <Animated.View entering={FadeInDown.duration(300)}>
              <YStack gap={14}>
                <YStack gap={4}>
                  <Text fontSize={17} fontFamily="$heading" fontWeight="700" color="$color">
                    Completed reminders
                  </Text>
                  <Text fontSize={13} fontFamily="$body" color="$colorMuted">
                    Reminders you have marked as done. Restore to re-activate or permanently remove.
                  </Text>
                </YStack>
                {completedMemories.length > 0 && (
                  <XStack justifyContent="flex-end">
                    <PressableScale
                      onPress={handleClearAllCompleted}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        borderRadius: 14,
                        backgroundColor: theme.destructive.val + "16",
                      }}
                    >
                      <Text fontSize={12} fontFamily="$body" fontWeight="700" color="$destructive">
                        Clear all forever
                      </Text>
                    </PressableScale>
                  </XStack>
                )}
                {completedMemories.length === 0 ? (
                  <EmptyState
                    icon="check-circle"
                    title="Nothing completed yet"
                    description="Tap the ✓ on any reminder to mark it as done. It will appear here."
                  />
                ) : (
                  <YStack gap={10}>
                    {completedMemories.map((memory) => (
                      <MemoryRow
                        key={memory._id}
                        title={memory.title}
                        content={memory.content}
                        timestamp={memory.completedAt}
                        timestampLabel="Completed"
                        accentColor={statusAccentColors.successStrong}
                        icon="check-circle"
                        menuOpen={openMenuId === memory._id}
                        onMenuToggle={() =>
                          setOpenMenuId((cur) => (cur === memory._id ? null : memory._id))
                        }
                        menuItems={[
                          {
                            label: "Restore to active",
                            onPress: () => handleUncomplete(memory._id),
                          },
                          {
                            label: "Delete forever",
                            color: theme.destructive.val,
                            onPress: () => handlePermanentRemoveCompleted(memory._id),
                          },
                        ]}
                      />
                    ))}
                  </YStack>
                )}
              </YStack>
            </Animated.View>
          )}
        </YStack>
      </Card>

      {/* Clean slate */}
      <Card style={{ padding: 18, borderRadius: 26 }}>
        <YStack gap={14}>
          <YStack gap={4}>
            <Text fontSize={18} fontFamily="$heading" fontWeight="700" color="$color">
              Clean slate
            </Text>
            <Text fontSize={13} fontFamily="$body" color="$colorMuted">
              Removes all memories, reminders, review cards, topic links, attachments, and
              deleted/completed items.
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
