import React, { useState } from "react";
import { Feather } from "@/lib/icons";
import { useMutation, useQuery } from "convex/react";
import { Text, XStack, YStack } from "tamagui";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { SurfaceCard } from "@/components/ui/SurfaceCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { AppButton } from "@/components/ui/AppButton";
import { PressableScale } from "@/components/ui/PressableScale";
import { AppScreen } from "@/components/ui/AppScreen";
import { ResponsiveStatGrid, WorkspaceSplit } from "@/components/ui/Responsive";
import { useAppConfirm } from "@/components/ui/confirm/AppConfirmProvider";
import { useAuth } from "@/hooks/useAuth";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useSemanticColors } from "@/hooks/useSemanticColors";
import { appShadow } from "@/components/ui/themeHelpers";
import { SelectionTabs } from "@/components/ui/SelectionTabs";
import { PopoverMenu, type PopoverMenuItem } from "@/components/ui/PopoverMenu";

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
  menuItems: PopoverMenuItem[];
};

function MemoryRow({
  title,
  content,
  timestamp,
  timestampLabel,
  accentColor,
  icon,
  menuItems,
}: MemoryRowProps) {
  const theme = useAppTheme();
  return (
    <XStack
      alignItems="center"
      gap={12}
      padding={14}
      borderRadius={16}
      borderWidth={1}
      borderColor={theme.borderColor.val}
      backgroundColor={theme.background.val}
      position="relative"
      style={appShadow(theme.shadowColor.val, "xs")}
    >
      <YStack
        width={32}
        height={32}
        borderRadius={9}
        alignItems="center"
        justifyContent="center"
        backgroundColor={accentColor}
      >
        <Feather name={icon} size={16} color={theme.textInverse.val} />
      </YStack>
      <YStack flex={1} gap={3}>
        <Text
          fontSize={15}
          fontFamily="$body"
          fontWeight="600"
          color={theme.color.val}
          numberOfLines={1}
        >
          {title?.trim() || "Untitled memory"}
        </Text>
        <Text
          fontSize={12}
          fontFamily="$body"
          color={theme.colorMuted.val}
          lineHeight={18}
          numberOfLines={2}
        >
          {content?.trim() || "No preview available"}
        </Text>
        <Text fontSize={11} fontFamily="$body" color={theme.colorMuted.val}>
          {timestampLabel} {formatTs(timestamp)}
        </Text>
      </YStack>
      <PopoverMenu items={menuItems}>
        <YStack
          width={34}
          height={34}
          borderRadius={17}
          alignItems="center"
          justifyContent="center"
          backgroundColor={theme.secondary.val}
        >
          <Feather name="more-vertical" size={16} color={theme.colorMuted.val} />
        </YStack>
      </PopoverMenu>
    </XStack>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function DataScreen() {
  const theme = useAppTheme();
  const semantic = useSemanticColors();
  const { token } = useAuth();
  const { confirm } = useAppConfirm();
  const [activeTab, setActiveTab] = useState<"deleted" | "completed">("deleted");

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
    void confirmAction("Restore Memory", "Restore this memory back into your active vault?", () => {
      if (token) void restoreMemory({ token, id });
    });
  }

  function handlePermanentDelete(id: Id<"memories">) {
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
    void confirmAction(
      "Restore to Active",
      "Move this completed item back to your active memories?",
      () => {
        if (token) void uncompleteMemory({ token, id });
      },
    );
  }

  function handlePermanentRemoveCompleted(id: Id<"memories">) {
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
    <AppScreen
      showBack
      title="Data"
      subtitle="Restore archived items or permanently remove data from your account."
      contentWidth="workspace"
    >
      <WorkspaceSplit
        splitAt={900}
        asideWidth={320}
        aside={
          <YStack gap={16}>
            <SurfaceCard style={{ padding: 16, borderRadius: 16 }}>
              <YStack gap={12}>
                <YStack gap={3}>
                  <Text
                    fontSize={16}
                    fontFamily="$heading"
                    fontWeight="700"
                    color={theme.color.val}
                  >
                    Archive summary
                  </Text>
                  <Text fontSize={12} lineHeight={18} color={theme.colorMuted.val}>
                    Items remain recoverable until you remove them permanently.
                  </Text>
                </YStack>
                <ResponsiveStatGrid
                  maximumColumns={2}
                  minimumColumnWidth={110}
                  items={[
                    { label: "Deleted", value: deletedMemories.length },
                    { label: "Completed", value: completedMemories.length },
                  ]}
                />
              </YStack>
            </SurfaceCard>

            <SurfaceCard style={{ padding: 16, borderRadius: 16 }}>
              <YStack gap={14}>
                <YStack gap={4}>
                  <Text
                    fontSize={18}
                    fontFamily="$heading"
                    fontWeight="700"
                    color={theme.color.val}
                  >
                    Clean slate
                  </Text>
                  <Text
                    fontSize={13}
                    lineHeight={19}
                    fontFamily="$body"
                    color={theme.colorMuted.val}
                  >
                    Removes all memories, reminders, review cards, topic links, attachments, and
                    deleted or completed items.
                  </Text>
                </YStack>
                <AppButton
                  title="Delete All Memory Data"
                  icon="trash-2"
                  onPress={handleClearSlate}
                  variant="danger"
                  fullWidth
                />
              </YStack>
            </SurfaceCard>
          </YStack>
        }
      >
        {/* Tabbed deleted / completed section */}
        <SurfaceCard style={{ padding: 16, borderRadius: 16 }}>
          <YStack gap={14}>
            <SelectionTabs
              options={[
                { value: "deleted", label: "Deleted", count: deletedMemories.length },
                { value: "completed", label: "Completed", count: completedMemories.length },
              ]}
              value={activeTab}
              onChange={(next) => {
                setActiveTab(next);
              }}
              accessibilityLabel="Data view"
            />

            {/* Deleted tab */}
            {activeTab === "deleted" && (
              <YStack>
                <YStack gap={14}>
                  <YStack gap={4}>
                    <Text
                      fontSize={17}
                      fontFamily="$heading"
                      fontWeight="700"
                      color={theme.color.val}
                    >
                      Deleted memories
                    </Text>
                    <Text fontSize={13} fontFamily="$body" color={theme.colorMuted.val}>
                      Deleted memories are moved to trash and stay here until you remove them
                      forever. You can restore any item at any time — there is no auto-expiry.
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
                        Edit &amp; undo history is kept for 7 days. After that, you can still
                        restore deleted memories but cannot undo individual edits.
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
                        <Text
                          fontSize={12}
                          fontFamily="$body"
                          fontWeight="700"
                          color={theme.destructive.val}
                        >
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
                          accentColor={semantic.status.warningStrong}
                          icon="archive"
                          menuItems={[
                            {
                              label: "Restore",
                              icon: "rotate-ccw",
                              onPress: () => handleRestore(memory._id),
                            },
                            {
                              label: "Delete forever",
                              icon: "trash-2",
                              destructive: true,
                              onPress: () => handlePermanentDelete(memory._id),
                            },
                          ]}
                        />
                      ))}
                    </YStack>
                  )}
                </YStack>
              </YStack>
            )}

            {/* Completed tab */}
            {activeTab === "completed" && (
              <YStack>
                <YStack gap={14}>
                  <YStack gap={4}>
                    <Text
                      fontSize={17}
                      fontFamily="$heading"
                      fontWeight="700"
                      color={theme.color.val}
                    >
                      Completed reminders
                    </Text>
                    <Text fontSize={13} fontFamily="$body" color={theme.colorMuted.val}>
                      Reminders you have marked as done. Restore to re-activate or permanently
                      remove.
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
                        <Text
                          fontSize={12}
                          fontFamily="$body"
                          fontWeight="700"
                          color={theme.destructive.val}
                        >
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
                          accentColor={semantic.status.successStrong}
                          icon="check-circle"
                          menuItems={[
                            {
                              label: "Restore to active",
                              icon: "rotate-ccw",
                              onPress: () => handleUncomplete(memory._id),
                            },
                            {
                              label: "Delete forever",
                              icon: "trash-2",
                              destructive: true,
                              onPress: () => handlePermanentRemoveCompleted(memory._id),
                            },
                          ]}
                        />
                      ))}
                    </YStack>
                  )}
                </YStack>
              </YStack>
            )}
          </YStack>
        </SurfaceCard>
      </WorkspaceSplit>
    </AppScreen>
  );
}
