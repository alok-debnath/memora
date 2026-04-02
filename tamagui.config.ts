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
  background: "#F7F1E8",
  backgroundHover: "#F2E8DA",
  backgroundPress: "#E8D7BF",
  backgroundFocus: "#F2E8DA",
  backgroundStrong: "#FFFFFF",
  backgroundTransparent: "rgba(247, 241, 232, 0)",

  color: "#1B1814",
  colorHover: "#1B1814",
  colorPress: "#1B1814",
  colorFocus: "#1B1814",
  colorTransparent: "rgba(27, 24, 20, 0)",
  colorMuted: "#6C6256",

  primary: "#C98522",
  primaryHover: "#E9AD4A",

  secondary: "#EFE3D3",
  secondaryHover: "#E8D7BF",

  accent: "#F3E2C1",
  accentHover: "#F2C66E",

  destructive: "#EF4444",
  destructiveHover: "#F87171",

  success: "#10B981",
  warning: "#F59E0B",
  info: "#3B82F6",

  borderColor: "#DCC7AB",
  borderColorHover: "#D2BA9B",
  borderColorFocus: "#C98522",
  borderColorPress: "#C98522",

  shadowColor: "#5C3F19",
  shadowColorHover: "#5C3F19",

  // Semantic aliases used across the app
  card: "#FFFDFC",
  cardBorder: "#E7D7C2",
  overlay: "rgba(0, 0, 0, 0.4)",
};

const darkTheme = {
  background: "#18120D",
  backgroundHover: "#241B14",
  backgroundPress: "#33271D",
  backgroundFocus: "#241B14",
  backgroundStrong: "#2B2018",
  backgroundTransparent: "rgba(24, 18, 13, 0)",

  color: "#FBF4EA",
  colorHover: "#FBF4EA",
  colorPress: "#FBF4EA",
  colorFocus: "#FBF4EA",
  colorTransparent: "rgba(251, 244, 234, 0)",
  colorMuted: "#CCBCA6",

  primary: "#E9AD4A",
  primaryHover: "#F2C66E",

  secondary: "#2D2219",
  secondaryHover: "#3A2E23",

  accent: "#33271D",
  accentHover: "#433325",

  destructive: "#F87171",
  destructiveHover: "#FCA5A5",

  success: "#34D399",
  warning: "#FBBF24",
  info: "#60A5FA",

  borderColor: "#433325",
  borderColorHover: "#533F2F",
  borderColorFocus: "#E9AD4A",
  borderColorPress: "#E9AD4A",

  shadowColor: "#000000",
  shadowColorHover: "#000000",

  // Semantic aliases used across the app
  card: "#221913",
  cardBorder: "#433325",
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
