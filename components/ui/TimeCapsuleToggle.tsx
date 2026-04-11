import React from "react";
import { TextInput, Switch } from "react-native";
import { Feather } from "@expo/vector-icons";
import { XStack, YStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import { FontFamily } from "@/constants/fonts";

interface TimeCapsuleToggleProps {
  enabled: boolean;
  date: string;
  onToggle: (enabled: boolean) => void;
  onDateChange: (date: string) => void;
}

export function TimeCapsuleToggle({ enabled, date, onToggle, onDateChange }: TimeCapsuleToggleProps) {
  const theme = useAppTheme();

  return (
    <YStack borderWidth={0.5} borderColor="$borderColor" backgroundColor="$card" borderRadius={14} overflow="hidden">
      <XStack alignItems="center" gap={12} padding={14}>
        <Feather name="lock" size={18} color={theme.colorMuted.val} />
        <YStack flex={1}>
          <Text color="$color" fontSize={14} fontFamily="$body" fontWeight="600">Time Capsule</Text>
          <Text color="$colorMuted" fontSize={12} fontFamily="$body" marginTop={1}>
            Lock until a future date
          </Text>
        </YStack>
        <Switch
          value={enabled}
          onValueChange={onToggle}
          trackColor={{ true: theme.primary.val, false: theme.borderColor.val }}
          thumbColor={theme.textInverse.val}
        />
      </XStack>
      {enabled && (
        <XStack
          alignItems="center"
          gap={8}
          paddingHorizontal={14}
          paddingVertical={10}
          borderTopWidth={0.5}
          borderTopColor="$borderColor"
        >
          <Feather name="calendar" size={14} color={theme.colorMuted.val} />
          <TextInput
            value={date}
            onChangeText={onDateChange}
            placeholder="yyyy-mm-ddTHH:MM"
            placeholderTextColor={theme.colorMuted.val}
            autoCapitalize="none"
            style={{ flex: 1, fontSize: 14, fontFamily: FontFamily.regular, color: theme.color.val }}
          />
        </XStack>
      )}
    </YStack>
  );
}
