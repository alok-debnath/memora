import { useAppTheme } from "@/hooks/useAppTheme";
import { withAlpha } from "@/components/ui/themeHelpers";

export function useColors() {
  const theme = useAppTheme();

  return {
    text: theme.color.val,
    foreground: theme.color.val,
    textSecondary: theme.colorMuted.val,
    textTertiary: withAlpha(theme.colorMuted.val, "B0"),
    mutedForeground: theme.colorMuted.val,
    background: theme.background.val,
    backgroundSecondary: theme.secondary.val,
    backgroundTertiary: theme.accent.val,
    surface: theme.surface.val,
    surfaceElevated: theme.surfaceElevated.val,
    secondary: theme.secondary.val,
    muted: theme.secondary.val,
    accent: theme.accent.val,
    border: theme.borderColor.val,
    borderLight: theme.borderSubtle.val,
    tint: theme.primary.val,
    primary: theme.primary.val,
    tabIconDefault: theme.colorMuted.val,
    tabIconSelected: theme.primary.val,
    card: theme.card.val,
    cardBorder: theme.cardBorder.val,
    surfaceDangerSoft: theme.surfaceDangerSoft.val,
    success: theme.success.val,
    textSuccess: theme.textSuccess.val,
    error: theme.destructive.val,
    textError: theme.textError.val,
    warning: theme.warning.val,
    textWarning: theme.textWarning.val,
    info: theme.info.val,
    overlay: theme.overlay.val,
    shadow: withAlpha(theme.shadowColor.val, "24"),
    destructive: theme.destructive.val,
    destructiveForeground: theme.textInverse.val,
    accentForeground: theme.primary.val,
  };
}
