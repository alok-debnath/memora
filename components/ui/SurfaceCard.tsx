import React from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { YStack } from "tamagui";

import { useAppTheme } from "@/hooks/useAppTheme";
import { GlassSurface } from "@/components/ui/GlassSurface";
import {
  appShadow,
  getSurfaceColors,
  withAlpha,
  type SurfaceTone,
} from "@/components/ui/themeHelpers";

type SurfaceCardProps = {
  children: React.ReactNode;
  tone?: SurfaceTone;
  padding?: number;
  style?: StyleProp<ViewStyle>;
  shadowed?: boolean;
  variant?: "solid" | "frosted" | "glass";
  radius?: number;
};

export function SurfaceCard({
  children,
  tone = "default",
  padding = 18,
  style,
  shadowed = false,
  variant = "frosted",
  radius = 16,
}: SurfaceCardProps) {
  const theme = useAppTheme();
  const surface = getSurfaceColors(theme, tone);

  if (variant === "glass") {
    return (
      <GlassSurface radius={radius} style={style} contentStyle={{ padding }}>
        {children}
      </GlassSurface>
    );
  }

  return (
    <YStack
      backgroundColor={
        variant === "frosted" ? withAlpha(surface.background, "E8") : surface.background
      }
      borderColor={surface.border}
      borderWidth={1}
      borderRadius={radius}
      padding={padding}
      style={[shadowed ? appShadow(theme.shadowColor.val, "xs") : null, style]}
    >
      {children}
    </YStack>
  );
}
