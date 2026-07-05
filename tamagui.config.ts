import { createAnimations } from "@tamagui/animations-react-native";
import { defaultConfig } from "@tamagui/config/v4";
import { createFont, createTamagui } from "tamagui";
import { FontFamily } from "@/constants/fonts";
import { createThemeColors, MEMORA_ACCENT } from "@/constants/themePalettes";

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

export const lightTheme = createThemeColors(MEMORA_ACCENT, "light");
export const darkTheme = createThemeColors(MEMORA_ACCENT, "dark");

export function createAppTamaguiConfig(themes?: {
  light: typeof lightTheme;
  dark: typeof darkTheme;
}) {
  return createTamagui({
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
    themes: themes ?? {
      light: lightTheme,
      dark: darkTheme,
    },
    settings: {
      ...defaultConfig.settings,
      styleCompat: "react-native",
    },
  });
}

export const tamaguiConfig = createAppTamaguiConfig();

export default tamaguiConfig;

export type AppTamaguiConfig = typeof tamaguiConfig;

declare module "tamagui" {
  // @ts-ignore — override re-exported interface with our full config type
  type TamaguiCustomConfig = AppTamaguiConfig;
}
