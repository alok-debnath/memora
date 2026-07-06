import React from "react";
import { Feather } from "@/lib/icons";

import { PressableScale } from "@/components/ui/PressableScale";
import { useAppTheme } from "@/hooks/useAppTheme";

type PasswordVisibilityButtonProps = {
  visible: boolean;
  onPress: () => void;
};

export function PasswordVisibilityButton({ visible, onPress }: PasswordVisibilityButtonProps) {
  const theme = useAppTheme();

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={visible ? "Hide password" : "Show password"}
      onPress={onPress}
      hitSlop={8}
      style={{ paddingHorizontal: 10, paddingVertical: 8 }}
    >
      <Feather name={visible ? "eye-off" : "eye"} size={18} color={theme.colorMuted.val} />
    </PressableScale>
  );
}
