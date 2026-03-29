import React from "react";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeInRight } from "react-native-reanimated";
import { PressableScale } from "./ui/PressableScale";
import { XStack, YStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";

interface NudgeCardProps {
  title: string;
  message: string;
  onDismiss: () => void;
  index?: number;
}

export function NudgeCard({ title, message, onDismiss, index = 0 }: NudgeCardProps) {
  const theme = useAppTheme();

  return (
    <Animated.View entering={FadeInRight.delay(index * 100).duration(400)}>
      <PressableScale style={{ width: 260, padding: 14, borderRadius: 14, borderWidth: 0.5, backgroundColor: theme.accent.val, borderColor: theme.borderColor.val, marginRight: 12 }}>
        <XStack alignItems="center" gap={8} marginBottom={6}>
          <YStack
            width={28}
            height={28}
            borderRadius={8}
            backgroundColor={theme.primary.val + "20"}
            alignItems="center"
            justifyContent="center"
          >
            <Feather name="zap" size={16} color={theme.primary.val} />
          </YStack>
          <Text flex={1} fontSize={14} fontFamily="$body" fontWeight="600" color="$color" numberOfLines={1}>
            {title}
          </Text>
          <PressableScale onPress={onDismiss} style={{ width: 24, height: 24, alignItems: "center", justifyContent: "center" }}>
            <Feather name="x" size={16} color={theme.colorMuted.val} />
          </PressableScale>
        </XStack>
        <Text fontSize={13} fontFamily="$body" lineHeight={18} color="$colorMuted" numberOfLines={2}>
          {message}
        </Text>
      </PressableScale>
    </Animated.View>
  );
}
