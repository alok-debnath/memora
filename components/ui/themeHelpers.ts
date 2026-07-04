import type { ViewStyle } from "react-native";
import type { AppTheme } from "@/hooks/useAppTheme";

export type StatusTone =
  "primary" | "neutral" | "success" | "warning" | "error" | "info" | "accent";

export type SurfaceTone = "default" | "elevated" | "accent" | "dangerSoft" | "successSoft";

export function withAlpha(color: string, alphaHex: string) {
  if (color.startsWith("#") && color.length === 7) {
    return `${color}${alphaHex}`;
  }
  if (color.startsWith("#") && color.length === 9) {
    return `${color.slice(0, 7)}${alphaHex}`;
  }
  return color;
}

export type AppShadowLevel = "hairline" | "xs" | "sm" | "md" | "lg";

const shadowLevels: Record<AppShadowLevel, { y: number; blur: number; alpha: string }> = {
  hairline: { y: 1, blur: 6, alpha: "14" },
  xs: { y: 3, blur: 12, alpha: "1C" },
  sm: { y: 6, blur: 20, alpha: "24" },
  md: { y: 12, blur: 32, alpha: "2B" },
  lg: { y: 18, blur: 46, alpha: "38" },
};

export function appShadow(color: string, level: AppShadowLevel = "sm"): ViewStyle {
  const shadow = shadowLevels[level];
  return {
    boxShadow: `0px ${shadow.y}px ${shadow.blur}px ${withAlpha(color, shadow.alpha)}`,
  } as ViewStyle;
}

export function getStatusColors(theme: AppTheme, tone: StatusTone) {
  switch (tone) {
    case "primary":
      return {
        background: withAlpha(theme.primary.val, "14"),
        border: withAlpha(theme.primary.val, "24"),
        text: theme.primary.val,
      };
    case "success":
      return {
        background: theme.surfaceSuccessSoft.val,
        border: withAlpha(theme.success.val, "2B"),
        text: theme.textSuccess.val,
      };
    case "warning":
      return {
        background: withAlpha(theme.warning.val, "12"),
        border: withAlpha(theme.warning.val, "24"),
        text: theme.textWarning.val,
      };
    case "error":
      return {
        background: theme.surfaceDangerSoft.val,
        border: withAlpha(theme.destructive.val, "24"),
        text: theme.textError.val,
      };
    case "info":
      return {
        background: withAlpha(theme.info.val, "12"),
        border: withAlpha(theme.info.val, "24"),
        text: theme.info.val,
      };
    case "accent":
      return {
        background: theme.surfaceAccent.val,
        border: withAlpha(theme.primary.val, "20"),
        text: theme.primary.val,
      };
    case "neutral":
    default:
      return {
        background: theme.secondary.val,
        border: theme.borderSubtle.val,
        text: theme.colorMuted.val,
      };
  }
}

export function getSurfaceColors(theme: AppTheme, tone: SurfaceTone) {
  switch (tone) {
    case "elevated":
      return {
        background: theme.surfaceElevated.val,
        border: theme.borderStrong.val,
      };
    case "accent":
      return {
        background: theme.surfaceAccent.val,
        border: withAlpha(theme.primary.val, "22"),
      };
    case "dangerSoft":
      return {
        background: theme.surfaceDangerSoft.val,
        border: withAlpha(theme.destructive.val, "22"),
      };
    case "successSoft":
      return {
        background: theme.surfaceSuccessSoft.val,
        border: withAlpha(theme.success.val, "22"),
      };
    case "default":
    default:
      return {
        background: theme.surface.val,
        border: theme.borderColor.val,
      };
  }
}
