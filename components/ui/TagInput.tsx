import React, { useState } from "react";
import { Pressable } from "react-native";
import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { Feather } from "@/lib/icons";
import { XStack, YStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import { FontFamily } from "@/constants/fonts";

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  label?: string;
}

export function TagInput({ value, onChange, placeholder = "Add tag...", label }: TagInputProps) {
  const theme = useAppTheme();
  const [input, setInput] = useState("");

  const addTag = () => {
    const trimmed = input.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setInput("");
  };

  const removeTag = (tag: string) => {
    onChange(value.filter((t) => t !== tag));
  };

  return (
    <YStack gap={6}>
      {label && (
        <Text
          color={theme.colorMuted.val}
          fontSize={11}
          fontFamily="$body"
          fontWeight="600"
          letterSpacing={0.8}
          marginLeft={4}
          textTransform="uppercase"
        >
          {label}
        </Text>
      )}
      <YStack
        borderWidth={0.5}
        borderColor={theme.borderColor.val}
        backgroundColor={theme.card.val}
        borderRadius={12}
        padding={10}
        minHeight={44}
      >
        <XStack flexWrap="wrap" gap={6} alignItems="center">
          {value.map((tag) => (
            <XStack
              key={tag}
              backgroundColor={theme.secondary.val}
              borderRadius={20}
              paddingHorizontal={10}
              paddingVertical={4}
              alignItems="center"
              gap={4}
            >
              <Text color={theme.color.val} fontSize={13} fontFamily="$body" fontWeight="500">
                {tag}
              </Text>
              <Pressable onPress={() => removeTag(tag)} hitSlop={6}>
                <Feather name="x" size={12} color={theme.colorMuted.val} />
              </Pressable>
            </XStack>
          ))}
          <XStack flex={1} minWidth={80} alignItems="center" gap={4}>
            <BottomSheetTextInput
              value={input}
              onChangeText={setInput}
              onSubmitEditing={addTag}
              placeholder={placeholder}
              placeholderTextColor={theme.colorMuted.val}
              style={{
                flex: 1,
                fontSize: 13,
                fontFamily: FontFamily.regular,
                minHeight: 24,
                color: theme.color.val,
              }}
              returnKeyType="done"
              blurOnSubmit={false}
            />
            <Pressable onPress={addTag} hitSlop={8}>
              <Feather name="plus" size={16} color={theme.primary.val} />
            </Pressable>
          </XStack>
        </XStack>
      </YStack>
    </YStack>
  );
}
