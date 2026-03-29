import React, { useEffect } from "react";
import { TextInput, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
} from "react-native-reanimated";
import { XStack } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import { FontFamily } from "@/constants/fonts";

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  isSearching?: boolean;
}

export function SearchBar({
  value,
  onChangeText,
  placeholder = "Search memories...",
  isSearching,
}: SearchBarProps) {
  const theme = useAppTheme();
  const sparkleOpacity = useSharedValue(1);

  useEffect(() => {
    if (isSearching) {
      sparkleOpacity.value = withRepeat(
        withSequence(
          withTiming(0.3, { duration: 400 }),
          withTiming(1, { duration: 400 })
        ),
        -1,
        true
      );
    } else {
      sparkleOpacity.value = withTiming(1);
    }
  }, [isSearching, sparkleOpacity]);

  const sparkleStyle = useAnimatedStyle(() => ({
    opacity: sparkleOpacity.value,
  }));

  return (
    <XStack
      backgroundColor="$secondary"
      borderColor="$borderColor"
      borderWidth={0.5}
      borderRadius={12}
      paddingHorizontal={14}
      paddingVertical={10}
      alignItems="center"
      gap={10}
    >
      <Feather name="search" size={18} color={theme.colorMuted.val} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colorMuted.val}
        style={{ flex: 1, fontSize: 15, fontFamily: FontFamily.regular, padding: 0, color: theme.color.val }}
        returnKeyType="search"
      />
      {isSearching && (
        <Animated.View style={sparkleStyle}>
          <Feather name="zap" size={16} color={theme.primary.val} />
        </Animated.View>
      )}
      {value.length > 0 && !isSearching && (
        <Pressable onPress={() => onChangeText("")}>
          <Feather name="x" size={16} color={theme.colorMuted.val} />
        </Pressable>
      )}
    </XStack>
  );
}
