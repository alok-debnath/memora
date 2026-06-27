import React from "react";
import { type ViewStyle } from "react-native";
import { Feather, type FeatherIconName } from "@/lib/icons";
import { AppButton } from "@/components/ui/AppButton";

interface GradientButtonProps {
  title: string;
  onPress: () => void;
  icon?: FeatherIconName;
  style?: ViewStyle;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  variant?: "warm" | "golden";
}

export function GradientButton({
  title,
  onPress,
  icon,
  style,
  loading,
  disabled,
  fullWidth = true,
  variant: _variant = "warm",
}: GradientButtonProps) {
  return (
    <AppButton
      title={title}
      onPress={onPress}
      icon={icon}
      loading={loading}
      disabled={disabled}
      variant="gradient"
      style={style}
      size="md"
      fullWidth={fullWidth}
    />
  );
}
