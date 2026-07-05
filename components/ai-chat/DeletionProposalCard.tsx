import React, { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useMutation } from "convex/react";
import { Text, XStack, YStack } from "tamagui";
import { api } from "@/convex/_generated/api";
import { FontFamily } from "@/constants/fonts";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useSemanticColors } from "@/hooks/useSemanticColors";
import { Feather } from "@/lib/icons";
import { appShadow, withAlpha } from "@/components/ui/themeHelpers";
import type { DeletionItem } from "./types";

type CardState = "idle" | "deleting" | "done" | "cancelled";

const getBubbleShadow = (shadowColor: string) => appShadow(shadowColor, "xs");

export function DeletionProposalCard({
  items,
  token,
}: {
  items: DeletionItem[];
  token?: string | null;
}) {
  const theme = useAppTheme();
  const semantic = useSemanticColors();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(items.map((item) => item.id)),
  );
  const [cardState, setCardState] = useState<CardState>("idle");
  const [resultCount, setResultCount] = useState(0);
  const removeMany = useMutation(api.memories.removeMany);

  const toggleItem = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!token) return;
    const ids = Array.from(selected);
    if (!ids.length) {
      setCardState("cancelled");
      return;
    }
    setCardState("deleting");
    try {
      await removeMany({ token, ids });
      setResultCount(ids.length);
      setCardState("done");
    } catch {
      setCardState("idle");
    }
  }, [removeMany, selected, token]);

  if (cardState === "done") {
    return (
      <Animated.View entering={FadeIn.duration(300)} style={{ marginTop: 6 }}>
        <XStack
          backgroundColor={theme.surfaceElevated.val}
          borderWidth={1}
          borderColor={withAlpha(semantic.status.success, "59")}
          borderRadius={18}
          padding={14}
          gap={12}
          alignItems="center"
          style={getBubbleShadow(theme.shadowColor.val)}
        >
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: withAlpha(semantic.status.success, "26"),
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Feather name="check" size={16} color={semantic.status.success} />
          </View>
          <YStack flex={1}>
            <Text fontSize={13} fontFamily={FontFamily.semiBold} color={theme.color.val}>
              {resultCount === 1 ? "1 item deleted" : `${resultCount} items deleted`}
            </Text>
            <Text fontSize={11} fontFamily="$body" color={theme.colorMuted.val} marginTop={2}>
              Moved to trash · Restore anytime from Data
            </Text>
          </YStack>
        </XStack>
      </Animated.View>
    );
  }

  if (cardState === "cancelled") {
    return (
      <Animated.View entering={FadeIn.duration(300)} style={{ marginTop: 6 }}>
        <XStack
          backgroundColor={theme.surfaceElevated.val}
          borderWidth={1}
          borderColor={theme.borderSubtle.val}
          borderRadius={18}
          padding={14}
          gap={12}
          alignItems="center"
          style={getBubbleShadow(theme.shadowColor.val)}
        >
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: theme.accent.val,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Feather name="x" size={16} color={theme.colorMuted.val} />
          </View>
          <Text fontSize={13} fontFamily="$body" color={theme.colorMuted.val}>
            Nothing was deleted
          </Text>
        </XStack>
      </Animated.View>
    );
  }

  const selectedCount = selected.size;

  return (
    <Animated.View entering={FadeInDown.duration(300)} style={{ marginTop: 6 }}>
      <YStack
        backgroundColor={theme.surfaceElevated.val}
        borderWidth={1}
        borderColor={theme.borderSubtle.val}
        borderRadius={20}
        overflow="hidden"
        style={getBubbleShadow(theme.shadowColor.val)}
      >
        <LinearGradient
          colors={[
            withAlpha(semantic.status.errorStrong, "17"),
            withAlpha(theme.primary.val, "0F"),
            withAlpha(theme.surfaceElevated.val, "00"),
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12 }}
        >
          <XStack alignItems="center" justifyContent="space-between" gap={10}>
            <YStack gap={6} flex={1}>
              <XStack gap={8} alignItems="center">
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: withAlpha(semantic.status.error, "18"),
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor: withAlpha(semantic.status.error, "24"),
                  }}
                >
                  <Feather name="trash-2" size={13} color={semantic.status.error} />
                </View>
                <Text fontSize={14} fontFamily={FontFamily.semiBold} color={theme.color.val}>
                  {items.length === 1 ? "1 item found" : `${items.length} items found`}
                </Text>
              </XStack>
              <Text fontSize={11} fontFamily="$body" color={theme.colorMuted.val}>
                Review the items below before moving them to trash
              </Text>
            </YStack>
            {selectedCount < items.length ? (
              <Pressable
                onPress={() => setSelected(new Set(items.map((item) => item.id)))}
                hitSlop={8}
              >
                <Text fontSize={11} fontFamily={FontFamily.semiBold} color={theme.primary.val}>
                  {selectedCount === 0
                    ? "Select all"
                    : `${selectedCount} of ${items.length} · Select all`}
                </Text>
              </Pressable>
            ) : (
              <Text fontSize={11} fontFamily="$body" color={theme.colorMuted.val}>
                All selected
              </Text>
            )}
          </XStack>
        </LinearGradient>

        <YStack>
          {items.map((item, index) => {
            const isSelected = selected.has(item.id);
            const isReminder = item.entry_kind === "reminder";
            return (
              <Pressable
                key={item.id}
                onPress={() => cardState !== "deleting" && toggleItem(item.id)}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.75 : 1,
                })}
              >
                <XStack
                  paddingHorizontal={14}
                  paddingVertical={11}
                  gap={12}
                  alignItems="center"
                  borderTopWidth={index > 0 ? 1 : 0}
                  borderTopColor={theme.borderSubtle.val}
                  backgroundColor={isSelected ? withAlpha(theme.primary.val, "0A") : "transparent"}
                >
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      borderWidth: 1.5,
                      borderColor: isSelected ? theme.primary.val : theme.borderColor.val,
                      backgroundColor: isSelected ? theme.primary.val : "transparent",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {isSelected ? (
                      <Feather name="check" size={12} color={theme.textInverse.val} />
                    ) : null}
                  </View>
                  <YStack flex={1} gap={3}>
                    <XStack gap={5} alignItems="center">
                      <Feather
                        name={isReminder ? "bell" : "archive"}
                        size={11}
                        color={isSelected ? theme.primary.val : theme.colorMuted.val}
                      />
                      <Text
                        fontSize={13}
                        fontFamily={FontFamily.semiBold}
                        color={isSelected ? theme.color.val : theme.colorMuted.val}
                        numberOfLines={1}
                        flex={1}
                      >
                        {item.title}
                      </Text>
                    </XStack>
                    {item.content ? (
                      <Text
                        fontSize={11}
                        fontFamily="$body"
                        color={theme.colorMuted.val}
                        numberOfLines={1}
                        opacity={isSelected ? 1 : 0.6}
                      >
                        {item.content}
                      </Text>
                    ) : null}
                  </YStack>
                </XStack>
              </Pressable>
            );
          })}
        </YStack>

        <XStack padding={12} gap={8} borderTopWidth={1} borderTopColor={theme.borderSubtle.val}>
          <Pressable
            onPress={() => setCardState("cancelled")}
            disabled={cardState === "deleting"}
            style={({ pressed }) => ({
              flex: 1,
              paddingVertical: 11,
              borderRadius: 14,
              alignItems: "center",
              backgroundColor: theme.surface.val,
              borderWidth: 1,
              borderColor: theme.borderSubtle.val,
              opacity: pressed || cardState === "deleting" ? 0.6 : 1,
            })}
          >
            <Text fontSize={13} fontFamily={FontFamily.semiBold} color={theme.colorMuted.val}>
              Cancel
            </Text>
          </Pressable>

          <Pressable
            onPress={handleConfirm}
            disabled={cardState === "deleting" || selectedCount === 0}
            style={({ pressed }) => ({
              flex: 2,
              paddingVertical: 11,
              borderRadius: 14,
              alignItems: "center",
              backgroundColor: selectedCount === 0 ? theme.accent.val : semantic.status.error,
              opacity: pressed || cardState === "deleting" || selectedCount === 0 ? 0.6 : 1,
            })}
          >
            <Text
              fontSize={13}
              fontFamily={FontFamily.semiBold}
              color={selectedCount === 0 ? theme.colorMuted.val : theme.textInverse.val}
            >
              {cardState === "deleting"
                ? "Deleting…"
                : selectedCount === 0
                  ? "Select items"
                  : `Delete ${selectedCount}`}
            </Text>
          </Pressable>
        </XStack>
      </YStack>
    </Animated.View>
  );
}
