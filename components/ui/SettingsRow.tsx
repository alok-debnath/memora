import React from "react";
import { Switch } from "react-native";
import type { FeatherIconName } from "@/lib/icons";

import { AppListRow } from "@/components/ui/AppListRow";
import { useAppTheme } from "@/hooks/useAppTheme";

type SettingsRowProps = {
  icon: FeatherIconName;
  title: string;
  description: string;
  value?: boolean;
  onValueChange?: (value: boolean) => void;
  onPress?: () => void;
  disabled?: boolean;
};

export function SettingsRow({
  icon,
  title,
  description,
  value,
  onValueChange,
  onPress,
  disabled,
}: SettingsRowProps) {
  const theme = useAppTheme();
  const isToggle = typeof value === "boolean" && onValueChange;
  return (
    <AppListRow
      icon={icon}
      title={title}
      description={description}
      onPress={isToggle ? () => onValueChange(!value) : onPress}
      showChevron={!isToggle && Boolean(onPress)}
      trailing={
        isToggle ? (
          <Switch
            value={value}
            onValueChange={onValueChange}
            disabled={disabled}
            trackColor={{ true: theme.primary.val, false: theme.borderColor.val }}
            thumbColor={theme.textInverse.val}
            accessibilityLabel={title}
          />
        ) : undefined
      }
    />
  );
}
