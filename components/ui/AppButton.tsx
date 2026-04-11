import React from "react";
import { ActivityIndicator, type StyleProp, type ViewStyle } from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { XStack, Text } from "tamagui";

import { brandGradients } from "@/constants/colors";
import { FontFamily } from "@/constants/fonts";
import { useAppTheme } from "@/hooks/useAppTheme";
import { PressableScale } from "@/components/ui/PressableScale";
import { getStatusColors, withAlpha, type StatusTone } from "@/components/ui/themeHelpers";

type AppButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "gradient";
type AppButtonSize = "sm" | "md" | "lg";

type AppButtonProps = {
  title: string;
  onPress: () => void;
  icon?: keyof typeof Feather.glyphMap;
  variant?: AppButtonVariant;
  size?: AppButtonSize;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  tone?: StatusTone;
};

const BUTTON_SIZES: Record<AppButtonSize, { minHeight: number; paddingX: number; icon: number; fontSize: number; radius: number }> = {
  sm: { minHeight: 40, paddingX: 14, icon: 15, fontSize: 13, radius: 14 },
  md: { minHeight: 54, paddingX: 22, icon: 17, fontSize: 15, radius: 16 },
  lg: { minHeight: 60, paddingX: 26, icon: 18, fontSize: 16, radius: 18 },
};

export function AppButton({
  title,
  onPress,
  icon,
  variant = "primary",
  size = "md",
  loading,
  disabled,
  fullWidth,
  style,
  tone = "primary",
}: AppButtonProps) {
  const theme = useAppTheme();
  const metrics = BUTTON_SIZES[size];
  const toneColors = getStatusColors(theme, tone);
  const isDisabled = disabled || loading;

  const baseContent = (
    <XStack
      minHeight={metrics.minHeight}
      paddingHorizontal={metrics.paddingX}
      width={fullWidth ? "100%" : undefined}
      alignItems="center"
      justifyContent="center"
      gap={8}
    >
      {loading ? (
        <ActivityIndicator size="small" color={variant === "secondary" || variant === "ghost" ? theme.color.val : theme.textInverse.val} />
      ) : (
        <>
          {icon ? (
            <Feather
              name={icon}
              size={metrics.icon}
              color={
                variant === "secondary" || variant === "ghost"
                  ? toneColors.text
                  : theme.textInverse.val
              }
            />
          ) : null}
          <Text
            color={
              variant === "secondary" || variant === "ghost"
                ? toneColors.text
                : theme.textInverse.val
            }
            fontSize={metrics.fontSize}
            fontFamily={FontFamily.semiBold}
            fontWeight="600"
            letterSpacing={0.2}
          >
            {title}
          </Text>
        </>
      )}
    </XStack>
  );

  return (
    <PressableScale
      onPress={onPress}
      disabled={isDisabled}
      scale={0.98}
      style={[
        {
          alignSelf: fullWidth ? "stretch" : "flex-start",
          borderRadius: metrics.radius,
          opacity: isDisabled ? 0.58 : 1,
        },
        style,
      ]}
    >
      {variant === "gradient" ? (
        <LinearGradient
          colors={[...brandGradients.ember]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            borderRadius: metrics.radius,
            borderWidth: 1,
            borderColor: withAlpha(theme.textInverse.val, "2B"),
          }}
        >
          {baseContent}
        </LinearGradient>
      ) : (
        <XStack
          borderRadius={metrics.radius}
          borderWidth={variant === "ghost" ? 0 : 1}
          borderColor={
            variant === "secondary"
              ? toneColors.border
              : variant === "danger"
                ? withAlpha(theme.destructive.val, "28")
                : variant === "primary"
                  ? withAlpha(theme.primary.val, "24")
                  : "transparent"
          }
          backgroundColor={
            variant === "secondary"
              ? toneColors.background
              : variant === "ghost"
                ? "transparent"
                : variant === "danger"
                  ? theme.destructive.val
                  : theme.primary.val
          }
        >
          {baseContent}
        </XStack>
      )}
    </PressableScale>
  );
}
