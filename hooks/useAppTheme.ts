import { useTheme } from "tamagui";
import type { Variable } from "tamagui";

type ThemeToken = Variable<string> & { val: string; get: (platform?: "web") => string };

export type AppTheme = {
  background: ThemeToken;
  backgroundHover: ThemeToken;
  backgroundPress: ThemeToken;
  backgroundFocus: ThemeToken;
  backgroundStrong: ThemeToken;
  backgroundTransparent: ThemeToken;
  color: ThemeToken;
  colorHover: ThemeToken;
  colorPress: ThemeToken;
  colorFocus: ThemeToken;
  colorTransparent: ThemeToken;
  colorMuted: ThemeToken;
  primary: ThemeToken;
  primaryHover: ThemeToken;
  secondary: ThemeToken;
  secondaryHover: ThemeToken;
  accent: ThemeToken;
  accentHover: ThemeToken;
  destructive: ThemeToken;
  destructiveHover: ThemeToken;
  success: ThemeToken;
  warning: ThemeToken;
  info: ThemeToken;
  borderColor: ThemeToken;
  borderColorHover: ThemeToken;
  borderColorFocus: ThemeToken;
  borderColorPress: ThemeToken;
  shadowColor: ThemeToken;
  shadowColorHover: ThemeToken;
  card: ThemeToken;
  cardBorder: ThemeToken;
  overlay: ThemeToken;
  overlayStrong: ThemeToken;
  surface: ThemeToken;
  surfaceElevated: ThemeToken;
  surfaceAccent: ThemeToken;
  surfaceDangerSoft: ThemeToken;
  surfaceSuccessSoft: ThemeToken;
  textInverse: ThemeToken;
  textSuccess: ThemeToken;
  textWarning: ThemeToken;
  textError: ThemeToken;
  borderStrong: ThemeToken;
  borderSubtle: ThemeToken;
  focusRing: ThemeToken;
};

export function useAppTheme(): AppTheme {
  return useTheme() as unknown as AppTheme;
}
