import { Platform, type ViewStyle } from "react-native";
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
  hairline: { y: 1, blur: 4, alpha: "0F" },
  xs: { y: 2, blur: 8, alpha: "14" },
  sm: { y: 4, blur: 16, alpha: "1C" },
  md: { y: 8, blur: 24, alpha: "24" },
  lg: { y: 14, blur: 36, alpha: "30" },
};

// Stops along the falloff curve, from tight/dark near the edge to soft/faint
// at the outer rim. t^1.5 spacing (vs. linear) front-loads stops near the
// source, which reads closer to a true Gaussian blur than even spacing does.
const ANDROID_SHADOW_STOPS = [0.2, 0.45, 0.7, 1] as const;

export function appShadow(color: string, level: AppShadowLevel = "sm"): ViewStyle {
  const shadow = shadowLevels[level];
  if (Platform.OS === "android") {
    // Android's Fabric boxShadow bands visibly on a single large blur radius —
    // stack several passes along the falloff curve so it reads as smooth.
    const alphaNum = parseInt(shadow.alpha, 16);
    const stopCount = ANDROID_SHADOW_STOPS.length;
    const boxShadow = ANDROID_SHADOW_STOPS.map((t, i) => {
      const eased = t ** 1.5;
      const y = Math.max(1, Math.round(shadow.y * eased));
      const blur = Math.max(1, Math.round(shadow.blur * eased));
      // Each pass carries a slice of the total alpha so the stack sums close
      // to the original density instead of over-darkening.
      const alphaHex = Math.max(0, Math.min(255, Math.round((alphaNum * 1.8) / stopCount)))
        .toString(16)
        .padStart(2, "0")
        .toUpperCase();
      return `0px ${y}px ${blur}px ${withAlpha(color, alphaHex)}`;
    }).join(", ");
    return { boxShadow } as ViewStyle;
  }
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
        border: theme.borderSubtle.val,
      };
  }
}
