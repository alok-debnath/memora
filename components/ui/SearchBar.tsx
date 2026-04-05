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
import { useAppTheme } from "@/hooks/useAppTheme";
import { FontFamily } from "@/constants/fonts";
import { XStack, Text } from "tamagui";

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
      backgroundColor="$card"
      borderColor="$borderColor"
      borderWidth={1}
      borderRadius={18}
      paddingHorizontal={14}
      height={52}
      alignItems="stretch"
      gap={10}
      shadowColor="$shadowColor"
      shadowOffset={{ width: 0, height: 10 }}
      shadowOpacity={0.05}
      shadowRadius={24}
    >
      {/* Icon — centered within the row height */}
      <XStack
        width={34}
        height={34}
        borderRadius={12}
        alignItems="center"
        justifyContent="center"
        backgroundColor={theme.primary.val + "12"}
        alignSelf="center"
      >
        <Feather name="search" size={16} color={theme.primary.val} />
      </XStack>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colorMuted.val}
        style={{
          flex: 1,
          alignSelf: "stretch",
          fontSize: 15,
          fontFamily: FontFamily.regular,
          padding: 0,
          color: theme.color.val,
          // Android centres text within its own internal padding by default
          textAlignVertical: "center",
          includeFontPadding: false,
        } as any}
        returnKeyType="search"
      />
      {isSearching && (
        <Animated.View style={[sparkleStyle, { alignSelf: "center" }]}>
          <XStack alignItems="center" gap={6}>
            <Feather name="zap" size={15} color={theme.primary.val} />
            <Text fontSize={12} color="$primary" fontWeight="600">
              Searching
            </Text>
          </XStack>
        </Animated.View>
      )}
      {value.length > 0 && !isSearching && (
        <Pressable
          onPress={() => onChangeText("")}
          style={{ alignSelf: "center" }}
          hitSlop={8}
        >
          <Feather name="x" size={16} color={theme.colorMuted.val} />
        </Pressable>
      )}
    </XStack>
  );
}
