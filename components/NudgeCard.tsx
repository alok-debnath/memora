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
      <PressableScale
        style={{
          width: 268,
          padding: 14,
          borderRadius: 20,
          borderWidth: 1,
          backgroundColor: theme.accent.val,
          borderColor: theme.borderColor.val,
          marginRight: 12,
          shadowColor: theme.shadowColor.val,
          shadowOpacity: 0.05,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 8 },
        }}
      >
        <XStack alignItems="center" gap={10} marginBottom={8}>
          <YStack
            width={28}
            height={28}
            borderRadius={10}
            backgroundColor={theme.primary.val + "18"}
            alignItems="center"
            justifyContent="center"
          >
            <Feather name="star" size={16} color={theme.primary.val} />
          </YStack>
          <Text
            flex={1}
            fontSize={14}
            fontFamily="$heading"
            fontWeight="600"
            color="$color"
            numberOfLines={1}
          >
            {title}
          </Text>
          <PressableScale
            onPress={onDismiss}
            style={{
              width: 28,
              height: 28,
              borderRadius: 10,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: theme.backgroundStrong.val,
            }}
          >
            <Feather name="x" size={16} color={theme.colorMuted.val} />
          </PressableScale>
        </XStack>
        <Text
          fontSize={13}
          fontFamily="$body"
          lineHeight={19}
          color="$colorMuted"
          numberOfLines={3}
        >
          {message}
        </Text>
      </PressableScale>
    </Animated.View>
  );
}
