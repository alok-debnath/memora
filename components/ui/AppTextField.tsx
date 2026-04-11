import React from "react";
import {
  TextInput,
  type TextInputProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { XStack, YStack, Text } from "tamagui";

import { FontFamily } from "@/constants/fonts";
import { useAppTheme } from "@/hooks/useAppTheme";
import { withAlpha } from "@/components/ui/themeHelpers";

type AppTextFieldProps = TextInputProps & {
  label?: string;
  helperText?: string;
  error?: string;
  accessory?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  multiline?: boolean;
};

export function AppTextField({
  label,
  helperText,
  error,
  accessory,
  containerStyle,
  multiline,
  style,
  ...inputProps
}: AppTextFieldProps) {
  const theme = useAppTheme();
  const toneColor = error ? theme.textError.val : theme.colorMuted.val;

  return (
    <YStack gap={7} style={containerStyle}>
      {label ? (
        <Text
          fontSize={11}
          fontFamily={FontFamily.semiBold}
          letterSpacing={1.2}
          color={toneColor}
          textTransform="uppercase"
        >
          {label}
        </Text>
      ) : null}
      <XStack
        minHeight={multiline ? 118 : 56}
        borderRadius={18}
        borderWidth={1}
        paddingLeft={16}
        paddingRight={accessory ? 10 : 16}
        paddingVertical={multiline ? 14 : 0}
        alignItems={multiline ? "flex-start" : "center"}
        backgroundColor={theme.surfaceElevated.val}
        borderColor={error ? withAlpha(theme.destructive.val, "30") : theme.borderColor.val}
        shadowColor="$shadowColor"
        shadowOffset={{ width: 0, height: 10 }}
        shadowOpacity={0.05}
        shadowRadius={22}
      >
        <TextInput
          {...inputProps}
          multiline={multiline}
          placeholderTextColor={theme.colorMuted.val}
          style={[
            {
              flex: 1,
              fontSize: 16,
              fontFamily: FontFamily.regular,
              color: theme.color.val,
              paddingVertical: multiline ? 0 : 16,
              minHeight: multiline ? 88 : undefined,
              textAlignVertical: multiline ? "top" : "center",
              includeFontPadding: false,
            } as const,
            style,
          ]}
        />
        {accessory ? (
          <XStack alignItems={multiline ? "flex-start" : "center"} paddingTop={multiline ? 2 : 0}>
            {accessory}
          </XStack>
        ) : null}
      </XStack>
      {error ? (
        <Text fontSize={12} lineHeight={18} color="$textError">
          {error}
        </Text>
      ) : helperText ? (
        <Text fontSize={12} lineHeight={18} color="$colorMuted">
          {helperText}
        </Text>
      ) : null}
    </YStack>
  );
}
