import { createAnimations } from "@tamagui/animations-react-native";
import { defaultConfig } from "@tamagui/config/v4";
import { createFont, createTamagui } from "tamagui";
import { FontFamily } from "@/constants/fonts";

const animations = createAnimations({
  fast: {
    type: "timing",
    duration: 160,
  },
  medium: {
    type: "spring",
    damping: 15,
    stiffness: 120,
  },
  slow: {
    type: "spring",
    damping: 20,
    stiffness: 60,
  },
  bouncy: {
    type: "spring",
    damping: 10,
    mass: 0.9,
    stiffness: 100,
  },
  quick: {
    type: "spring",
    damping: 20,
    mass: 1.2,
    stiffness: 250,
  },
});

const interFont = createFont({
  family: FontFamily.regular,
  size: {
    1: 11,
    2: 12,
    3: 13,
    4: 14,
    true: 14,
    5: 16,
    6: 18,
    7: 20,
    8: 24,
    9: 30,
    10: 36,
  },
  lineHeight: {
    1: 15,
    2: 17,
    3: 18,
    4: 20,
    true: 20,
    5: 22,
    6: 25,
    7: 28,
    8: 32,
    9: 40,
    10: 46,
  },
  weight: {
    4: "400",
    5: "500",
    6: "600",
    7: "700",
    true: "400",
  },
  letterSpacing: {
    1: 0.2,
    2: 0.1,
    3: 0,
    4: 0,
    true: 0,
    5: -0.2,
    6: -0.3,
    7: -0.5,
    8: -0.5,
    9: -1,
    10: -1,
  },
  face: {
    400: { normal: FontFamily.regular },
    500: { normal: FontFamily.medium },
    600: { normal: FontFamily.semiBold },
    700: { normal: FontFamily.bold },
  },
});

const lightTheme = {
  background: "#FEFCF8",
  backgroundHover: "#FFF8ED",
  backgroundPress: "#FFF1DB",
  backgroundFocus: "#FFF8ED",
  backgroundStrong: "#FFFFFF",
  backgroundTransparent: "rgba(254, 252, 248, 0)",

  color: "#1A1A2E",
  colorHover: "#1A1A2E",
  colorPress: "#1A1A2E",
  colorFocus: "#1A1A2E",
  colorTransparent: "rgba(26, 26, 46, 0)",
  colorMuted: "#6B7280",

  primary: "#E8911B",
  primaryHover: "#F5A623",

  secondary: "#F3F4F6",
  secondaryHover: "#E5E7EB",

  accent: "#FFF1DB",
  accentHover: "#FDE68A",

  destructive: "#EF4444",
  destructiveHover: "#F87171",

  success: "#10B981",
  warning: "#F59E0B",
  info: "#3B82F6",

  borderColor: "#E5E7EB",
  borderColorHover: "#D1D5DB",
  borderColorFocus: "#E8911B",
  borderColorPress: "#E8911B",

  shadowColor: "#000000",
  shadowColorHover: "#000000",

  // Semantic aliases used across the app
  card: "#FFFFFF",
  cardBorder: "#F0E6D6",
  overlay: "rgba(0, 0, 0, 0.4)",
};

const darkTheme = {
  background: "#0F0F1A",
  backgroundHover: "#1A1A2E",
  backgroundPress: "#252540",
  backgroundFocus: "#1A1A2E",
  backgroundStrong: "#1E1E32",
  backgroundTransparent: "rgba(15, 15, 26, 0)",

  color: "#F9FAFB",
  colorHover: "#F9FAFB",
  colorPress: "#F9FAFB",
  colorFocus: "#F9FAFB",
  colorTransparent: "rgba(249, 250, 251, 0)",
  colorMuted: "#9CA3AF",

  primary: "#F5A623",
  primaryHover: "#FCD34D",

  secondary: "#252540",
  secondaryHover: "#2D2D44",

  accent: "#2D2D44",
  accentHover: "#3D3D54",

  destructive: "#F87171",
  destructiveHover: "#FCA5A5",

  success: "#34D399",
  warning: "#FBBF24",
  info: "#60A5FA",

  borderColor: "#2D2D44",
  borderColorHover: "#3D3D54",
  borderColorFocus: "#F5A623",
  borderColorPress: "#F5A623",

  shadowColor: "#000000",
  shadowColorHover: "#000000",

  // Semantic aliases used across the app
  card: "#1E1E32",
  cardBorder: "#2D2D44",
  overlay: "rgba(0, 0, 0, 0.6)",
};

export const tamaguiConfig = createTamagui({
  ...defaultConfig,
  animations,
  defaultTheme: "light",
  shouldAddPrefersColorThemes: false,
  themeClassNameOnRoot: true,
  fonts: {
    ...defaultConfig.fonts,
    heading: interFont,
    body: interFont,
  },
  themes: {
    light: lightTheme,
    dark: darkTheme,
  },
  settings: {
    ...defaultConfig.settings,
    styleCompat: "react-native",
  },
});

export default tamaguiConfig;

export type AppTamaguiConfig = typeof tamaguiConfig;

declare module "tamagui" {
  // @ts-ignore — override re-exported interface with our full config type
  type TamaguiCustomConfig = AppTamaguiConfig;
}
