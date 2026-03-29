import React from "react";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { PressableScale } from "./ui/PressableScale";
import { XStack, YStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import type { MemoryNote } from "@/types/memory";

interface FlashbackCardProps {
  memory: MemoryNote;
  onPress?: () => void;
}

export function FlashbackCard({ memory, onPress }: FlashbackCardProps) {
  const theme = useAppTheme();
  const year = new Date(memory.createdAt).getFullYear();
  const now = new Date().getFullYear();
  const yearsAgo = now - year;

  return (
    <PressableScale onPress={onPress}>
      <LinearGradient
        colors={["#E8911B20", "#F0B84A10"]}
        style={{ width: 220, padding: 14, borderRadius: 14, borderWidth: 0.5, borderColor: theme.primary.val + "30", marginRight: 12 }}
      >
        <YStack marginBottom={8}>
          <XStack
            backgroundColor={theme.primary.val + "20"}
            alignItems="center"
            paddingHorizontal={8}
            paddingVertical={3}
            borderRadius={8}
            gap={4}
            alignSelf="flex-start"
          >
            <Feather name="clock" size={12} color={theme.primary.val} />
            <Text fontSize={11} fontFamily="$body" fontWeight="500" color="$primary">
              {yearsAgo === 1 ? "1 year ago" : `${yearsAgo} years ago`}
            </Text>
          </XStack>
        </YStack>
        <Text fontSize={14} fontFamily="$body" fontWeight="600" color="$color" numberOfLines={1} marginBottom={4}>
          {memory.title}
        </Text>
        <Text fontSize={12} fontFamily="$body" lineHeight={16} color="$colorMuted" numberOfLines={2}>
          {memory.content}
        </Text>
      </LinearGradient>
    </PressableScale>
  );
}
