import React from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { Feather, type FeatherIconName } from "@/lib/icons";
import { Text, XStack, YStack } from "tamagui";

import { PressableScale } from "@/components/ui/PressableScale";
import { withAlpha } from "@/components/ui/themeHelpers";
import { control, radius, spacing, typeScale } from "@/constants/uiTokens";
import { useAppTheme } from "@/hooks/useAppTheme";

type AppListRowProps = {
  title: string;
  description?: string;
  icon?: FeatherIconName;
  iconColor?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  onPress?: () => void;
  selected?: boolean;
  destructive?: boolean;
  showChevron?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function AppListRow({
  title,
  description,
  icon,
  iconColor,
  leading,
  trailing,
  onPress,
  selected,
  destructive,
  showChevron = Boolean(onPress),
  style,
}: AppListRowProps) {
  const theme = useAppTheme();
  const foreground = destructive ? theme.destructive.val : (iconColor ?? theme.primary.val);
  const row = (
    <XStack
      minHeight={control.comfortableHeight}
      paddingHorizontal={spacing.md}
      paddingVertical={spacing.sm}
      alignItems="center"
      gap={spacing.md}
      borderRadius={radius.md}
      borderWidth={1}
      borderColor={selected ? withAlpha(theme.primary.val, "36") : "transparent"}
      backgroundColor={selected ? theme.surfaceAccent.val : "transparent"}
      style={style}
    >
      {leading ??
        (icon ? (
          <YStack
            width={36}
            height={36}
            borderRadius={radius.sm}
            alignItems="center"
            justifyContent="center"
            backgroundColor={withAlpha(foreground, "16")}
          >
            <Feather name={icon} size={17} color={foreground} />
          </YStack>
        ) : null)}
      <YStack flex={1} minWidth={0} gap={2}>
        <Text
          numberOfLines={1}
          fontFamily="$body"
          fontSize={typeScale.body}
          fontWeight="700"
          color={destructive ? theme.destructive.val : theme.color.val}
        >
          {title}
        </Text>
        {description ? (
          <Text
            numberOfLines={2}
            fontFamily="$body"
            fontSize={typeScale.metadata}
            lineHeight={18}
            color={theme.colorMuted.val}
          >
            {description}
          </Text>
        ) : null}
      </YStack>
      {trailing}
      {showChevron ? <Feather name="chevron-right" size={16} color={theme.colorMuted.val} /> : null}
    </XStack>
  );

  if (!onPress) return row;
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={description ? `${title}. ${description}` : title}
      style={{ borderRadius: radius.md }}
    >
      {row}
    </PressableScale>
  );
}
