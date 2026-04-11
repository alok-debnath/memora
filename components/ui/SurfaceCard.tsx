import React from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { YStack } from "tamagui";

import { useAppTheme } from "@/hooks/useAppTheme";
import { getSurfaceColors, type SurfaceTone } from "@/components/ui/themeHelpers";

type SurfaceCardProps = {
  children: React.ReactNode;
  tone?: SurfaceTone;
  padding?: number;
  style?: StyleProp<ViewStyle>;
  shadowed?: boolean;
};

export function SurfaceCard({
  children,
  tone = "default",
  padding = 18,
  style,
  shadowed = true,
}: SurfaceCardProps) {
  const theme = useAppTheme();
  const surface = getSurfaceColors(theme, tone);

  return (
    <YStack
      backgroundColor={surface.background}
      borderColor={surface.border}
      borderWidth={1}
      borderRadius={28}
      padding={padding}
      style={style}
      shadowColor={theme.shadowColor.val}
      shadowOffset={shadowed ? { width: 0, height: 14 } : undefined}
      shadowOpacity={shadowed ? 0.08 : 0}
      shadowRadius={shadowed ? 30 : 0}
    >
      {children}
    </YStack>
  );
}
