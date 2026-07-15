import React from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { Feather, type FeatherIconName } from "@/lib/icons";
import { XStack } from "tamagui";

import { PressableScale } from "@/components/ui/PressableScale";
import { withAlpha } from "@/components/ui/themeHelpers";
import { control, radius } from "@/constants/uiTokens";
import { useAppTheme } from "@/hooks/useAppTheme";

type AppIconButtonProps = {
  icon: FeatherIconName;
  label: string;
  onPress: () => void;
  size?: "compact" | "default";
  variant?: "ghost" | "soft" | "primary" | "danger";
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function AppIconButton({
  icon,
  label,
  onPress,
  size = "default",
  variant = "ghost",
  disabled,
  style,
}: AppIconButtonProps) {
  const theme = useAppTheme();
  const dimension = size === "compact" ? control.iconCompact : control.iconDefault;
  const foreground =
    variant === "primary"
      ? theme.textInverse.val
      : variant === "danger"
        ? theme.destructive.val
        : theme.colorMuted.val;
  const background =
    variant === "primary"
      ? theme.primary.val
      : variant === "danger"
        ? theme.surfaceDangerSoft.val
        : variant === "soft"
          ? theme.secondary.val
          : "transparent";

  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={Math.max(0, (control.minimumHitSize - dimension) / 2)}
      style={[{ borderRadius: radius.sm, opacity: disabled ? 0.45 : 1 }, style]}
    >
      <XStack
        width={dimension}
        height={dimension}
        borderRadius={radius.sm}
        alignItems="center"
        justifyContent="center"
        backgroundColor={background}
        borderWidth={variant === "ghost" ? 0 : 1}
        borderColor={
          variant === "primary"
            ? withAlpha(theme.primary.val, "30")
            : variant === "danger"
              ? withAlpha(theme.destructive.val, "28")
              : theme.borderSubtle.val
        }
      >
        <Feather name={icon} size={size === "compact" ? 15 : 17} color={foreground} />
      </XStack>
    </PressableScale>
  );
}
