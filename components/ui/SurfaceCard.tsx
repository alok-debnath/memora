import React from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { YStack } from "tamagui";

import { useAppTheme } from "@/hooks/useAppTheme";
import { GlassSurface } from "@/components/ui/GlassSurface";
import {
  appShadow,
  getSurfaceColors,
  withAlpha,
  type AppShadowLevel,
  type SurfaceTone,
} from "@/components/ui/themeHelpers";
import { radius as radiusTokens, spacing } from "@/constants/uiTokens";

type SurfaceCardProps = {
  children: React.ReactNode;
  tone?: SurfaceTone;
  padding?: number;
  style?: StyleProp<ViewStyle>;
  shadowed?: boolean;
  shadowLevel?: AppShadowLevel;
  variant?: "solid" | "frosted" | "glass";
  radius?: number;
};

export function SurfaceCard({
  children,
  tone = "default",
  padding = spacing.lg,
  style,
  shadowed,
  shadowLevel,
  variant = "frosted",
  radius = radiusTokens.md,
}: SurfaceCardProps) {
  const theme = useAppTheme();
  const surface = getSurfaceColors(theme, tone);
  const resolvedShadowLevel = shadowLevel ?? (shadowed ? "sm" : "xs");
  const shouldShadow = shadowed ?? variant !== "solid";

  if (variant === "glass") {
    return (
      <GlassSurface
        radius={radius}
        style={style}
        contentStyle={{ padding }}
        shadowLevel={shouldShadow ? resolvedShadowLevel : false}
      >
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
      style={[shouldShadow ? appShadow(theme.shadowColor.val, resolvedShadowLevel) : null, style]}
    >
      {children}
    </YStack>
  );
}
