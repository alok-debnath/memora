import React from "react";
import { Feather } from "@/lib/icons";
import { LinearGradient } from "expo-linear-gradient";
import { PressableScale } from "./ui/PressableScale";
import { XStack, YStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useThemeStore } from "@/store/theme";
import type { MemoryNote } from "@/types/memory";
import { appShadow, withAlpha } from "./ui/themeHelpers";

interface FlashbackCardProps {
  memory: MemoryNote;
  onPress?: () => void;
}

export function FlashbackCard({ memory, onPress }: FlashbackCardProps) {
  const theme = useAppTheme();
  const resolvedMode = useThemeStore((state) => state.resolvedMode);
  const year = new Date(memory.createdAt).getFullYear();
  const now = new Date().getFullYear();
  const yearsAgo = now - year;

  return (
    <PressableScale onPress={onPress}>
      <LinearGradient
        colors={
          resolvedMode === "dark"
            ? ([
                withAlpha(theme.primary.val, "38"),
                withAlpha(theme.backgroundStrong.val, "EB"),
              ] as const)
            : ([
                withAlpha(theme.primary.val, "52"),
                withAlpha(theme.backgroundStrong.val, "F0"),
              ] as const)
        }
        style={{
          width: 236,
          padding: 16,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: theme.primary.val + "24",
          marginRight: 12,
          ...appShadow(theme.shadowColor.val, "md"),
        }}
      >
        <YStack marginBottom={10} alignItems="flex-start">
          <XStack
            backgroundColor={theme.primary.val + "16"}
            alignItems="center"
            paddingHorizontal={10}
            paddingVertical={5}
            borderRadius={999}
            gap={4}
            alignSelf="flex-start"
          >
            <Feather name="clock" size={12} color={theme.primary.val} />
            <Text fontSize={11} fontFamily="$body" fontWeight="600" color="$primary">
              {yearsAgo === 1 ? "1 year ago" : `${yearsAgo} years ago`}
            </Text>
          </XStack>
        </YStack>
        <Text
          fontSize={15}
          fontFamily="$heading"
          fontWeight="600"
          color="$color"
          numberOfLines={1}
          marginBottom={6}
        >
          {memory.title}
        </Text>
        <Text
          fontSize={12}
          fontFamily="$body"
          lineHeight={18}
          color="$colorMuted"
          numberOfLines={3}
        >
          {memory.content}
        </Text>
      </LinearGradient>
    </PressableScale>
  );
}
