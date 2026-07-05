import { Platform } from "react-native";
import { Color } from "expo-router";

export type ThemeMode = "system" | "light" | "dark";
export type ResolvedThemeMode = "light" | "dark";
export type ThemeAccentSource = "memora" | "preset" | "custom" | "androidSystem";

export type ThemeAccentPreset = {
  id: string;
  label: string;
  color: string;
};

export type ThemeColorKey =
  | "background"
  | "backgroundHover"
  | "backgroundPress"
  | "backgroundFocus"
  | "backgroundStrong"
  | "backgroundTransparent"
  | "color"
  | "colorHover"
  | "colorPress"
  | "colorFocus"
  | "colorTransparent"
  | "colorMuted"
  | "primary"
  | "primaryHover"
  | "secondary"
  | "secondaryHover"
  | "accent"
  | "accentHover"
  | "destructive"
  | "destructiveHover"
  | "success"
  | "warning"
  | "info"
  | "borderColor"
  | "borderColorHover"
  | "borderColorFocus"
  | "borderColorPress"
  | "shadowColor"
  | "shadowColorHover"
  | "card"
  | "cardBorder"
  | "overlay"
  | "overlayStrong"
  | "surface"
  | "surfaceElevated"
  | "surfaceAccent"
  | "surfaceDangerSoft"
  | "surfaceSuccessSoft"
  | "textInverse"
  | "textSuccess"
  | "textWarning"
  | "textError"
  | "borderStrong"
  | "borderSubtle"
  | "focusRing";

export type ThemeColorValues = Record<ThemeColorKey, string>;

export const MEMORA_ACCENT = "#C98522";

export const themeAccentPresets: ThemeAccentPreset[] = [
  { id: "amber", label: "Amber", color: MEMORA_ACCENT },
  { id: "blue", label: "Blue", color: "#2563EB" },
  { id: "emerald", label: "Emerald", color: "#059669" },
  { id: "rose", label: "Rose", color: "#E11D48" },
  { id: "violet", label: "Violet", color: "#7C3AED" },
  { id: "slate", label: "Slate", color: "#475569" },
];

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function clamp(value: number, min = 0, max = 255) {
  return Math.min(max, Math.max(min, value));
}

function toHexPart(value: number) {
  return Math.round(clamp(value)).toString(16).padStart(2, "0").toUpperCase();
}

function normalizeHex(color: string | null | undefined) {
  if (!color) return null;
  const trimmed = color.trim();
  if (HEX_COLOR_RE.test(trimmed)) return trimmed.toUpperCase();
  return null;
}

function hexToRgb(color: string) {
  const normalized = normalizeHex(color) ?? MEMORA_ACCENT;
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${toHexPart(r)}${toHexPart(g)}${toHexPart(b)}`;
}

function mix(color: string, target: string, amount: number) {
  const from = hexToRgb(color);
  const to = hexToRgb(target);
  return rgbToHex(
    from.r + (to.r - from.r) * amount,
    from.g + (to.g - from.g) * amount,
    from.b + (to.b - from.b) * amount,
  );
}

function rgbToHsl(color: string) {
  const { r, g, b } = hexToRgb(color);
  const r1 = r / 255;
  const g1 = g / 255;
  const b1 = b / 255;
  const max = Math.max(r1, g1, b1);
  const min = Math.min(r1, g1, b1);
  const lightness = (max + min) / 2;
  const delta = max - min;

  if (delta === 0) {
    return { h: 0, s: 0, l: lightness };
  }

  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue = 0;
  if (max === r1) hue = ((g1 - b1) / delta) % 6;
  else if (max === g1) hue = (b1 - r1) / delta + 2;
  else hue = (r1 - g1) / delta + 4;

  return { h: (hue * 60 + 360) % 360, s: saturation, l: lightness };
}

function hslToHex(h: number, s: number, l: number) {
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - chroma / 2;
  let r = 0;
  let g = 0;
  let b = 0;

  if (h < 60) {
    r = chroma;
    g = x;
  } else if (h < 120) {
    r = x;
    g = chroma;
  } else if (h < 180) {
    g = chroma;
    b = x;
  } else if (h < 240) {
    g = x;
    b = chroma;
  } else if (h < 300) {
    r = x;
    b = chroma;
  } else {
    r = chroma;
    b = x;
  }

  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

function tuneSeed(seed: string, mode: ResolvedThemeMode) {
  const { h, s } = rgbToHsl(seed);
  const tunedSaturation = Math.max(0.42, Math.min(0.82, s));
  const tunedLightness = mode === "dark" ? 0.64 : 0.42;
  return hslToHex(h, tunedSaturation, tunedLightness);
}

function tone(seed: string, saturationMultiplier: number, lightness: number, minSaturation = 0) {
  const { h, s } = rgbToHsl(seed);
  const nextSaturation = Math.max(minSaturation, Math.min(0.88, s * saturationMultiplier));
  return hslToHex(h, nextSaturation, lightness);
}

function hueTone(seed: string, hueOffset: number, saturation: number, lightness: number) {
  const { h } = rgbToHsl(seed);
  return hslToHex((h + hueOffset + 360) % 360, saturation, lightness);
}

function transparent(color: string) {
  return `${color}00`;
}

function alpha(color: string, alphaHex: string) {
  return `${color}${alphaHex}`;
}

export function isValidThemeHex(color: string) {
  return HEX_COLOR_RE.test(color.trim());
}

export function getAndroidSystemAccentColor() {
  if (Platform.OS !== "android") return null;
  const value = Color.android.dynamic.primary;
  return typeof value === "string" ? normalizeHex(value) : null;
}

export function resolveAccentColor(source: ThemeAccentSource, accentColor: string) {
  if (source === "androidSystem") {
    return getAndroidSystemAccentColor() ?? normalizeHex(accentColor) ?? MEMORA_ACCENT;
  }
  return normalizeHex(accentColor) ?? MEMORA_ACCENT;
}

export function createThemeColors(seedColor: string, mode: ResolvedThemeMode): ThemeColorValues {
  const isDark = mode === "dark";
  const primary = tuneSeed(seedColor, mode);
  const primaryHover = isDark
    ? tone(seedColor, 0.8, 0.72, 0.38)
    : tone(seedColor, 0.86, 0.34, 0.38);
  const neutralSaturation = isDark ? 0.26 : 0.34;
  const containerSaturation = isDark ? 0.34 : 0.42;
  const accentSaturation = isDark ? 0.48 : 0.5;
  const background = tone(
    seedColor,
    neutralSaturation,
    isDark ? 0.105 : 0.925,
    isDark ? 0.1 : 0.08,
  );
  const backgroundHover = tone(
    seedColor,
    neutralSaturation,
    isDark ? 0.14 : 0.895,
    isDark ? 0.11 : 0.09,
  );
  const backgroundPress = tone(
    seedColor,
    neutralSaturation,
    isDark ? 0.19 : 0.85,
    isDark ? 0.12 : 0.1,
  );
  const backgroundStrong = tone(
    seedColor,
    neutralSaturation,
    isDark ? 0.155 : 0.955,
    isDark ? 0.1 : 0.07,
  );
  const color = tone(seedColor, 0.18, isDark ? 0.94 : 0.105, isDark ? 0.05 : 0.04);
  const colorMuted = tone(seedColor, 0.22, isDark ? 0.73 : 0.36, isDark ? 0.06 : 0.05);
  const secondary = tone(seedColor, containerSaturation, isDark ? 0.18 : 0.86, isDark ? 0.12 : 0.1);
  const secondaryHover = tone(
    seedColor,
    containerSaturation,
    isDark ? 0.225 : 0.81,
    isDark ? 0.14 : 0.12,
  );
  const accent = tone(seedColor, accentSaturation, isDark ? 0.235 : 0.82, isDark ? 0.18 : 0.16);
  const accentHover = tone(seedColor, accentSaturation, isDark ? 0.29 : 0.74, isDark ? 0.2 : 0.18);
  const borderColor = tone(
    seedColor,
    containerSaturation,
    isDark ? 0.295 : 0.71,
    isDark ? 0.12 : 0.1,
  );
  const borderColorHover = tone(
    seedColor,
    containerSaturation,
    isDark ? 0.37 : 0.63,
    isDark ? 0.14 : 0.12,
  );
  const card = tone(seedColor, neutralSaturation, isDark ? 0.145 : 0.945, isDark ? 0.1 : 0.075);
  const surface = tone(seedColor, neutralSaturation, isDark ? 0.145 : 0.938, isDark ? 0.1 : 0.08);
  const surfaceElevated = tone(
    seedColor,
    neutralSaturation,
    isDark ? 0.19 : 0.968,
    isDark ? 0.11 : 0.065,
  );
  const surfaceAccent = tone(
    seedColor,
    accentSaturation,
    isDark ? 0.265 : 0.86,
    isDark ? 0.2 : 0.16,
  );
  const borderStrong = tone(
    seedColor,
    accentSaturation,
    isDark ? 0.48 : 0.49,
    isDark ? 0.18 : 0.16,
  );
  const borderSubtle = tone(
    seedColor,
    containerSaturation,
    isDark ? 0.225 : 0.79,
    isDark ? 0.12 : 0.1,
  );
  const focusRing = isDark ? primaryHover : primary;
  const destructive = hueTone(seedColor, 150, isDark ? 0.72 : 0.68, isDark ? 0.68 : 0.42);
  const destructiveHover = hueTone(seedColor, 150, isDark ? 0.76 : 0.72, isDark ? 0.76 : 0.5);
  const success = hueTone(seedColor, 105, isDark ? 0.64 : 0.58, isDark ? 0.66 : 0.36);
  const warning = hueTone(seedColor, 35, isDark ? 0.76 : 0.68, isDark ? 0.67 : 0.4);
  const info = hueTone(seedColor, 210, isDark ? 0.66 : 0.62, isDark ? 0.68 : 0.42);
  const shadowColor = mix(primary, isDark ? background : color, isDark ? 0.6 : 0.5);

  return {
    background,
    backgroundHover,
    backgroundPress,
    backgroundFocus: backgroundHover,
    backgroundStrong,
    backgroundTransparent: transparent(background),
    color,
    colorHover: color,
    colorPress: color,
    colorFocus: color,
    colorTransparent: transparent(color),
    colorMuted,
    primary,
    primaryHover,
    secondary,
    secondaryHover,
    accent,
    accentHover,
    destructive,
    destructiveHover,
    success,
    warning,
    info,
    borderColor,
    borderColorHover,
    borderColorFocus: focusRing,
    borderColorPress: focusRing,
    shadowColor,
    shadowColorHover: shadowColor,
    card,
    cardBorder: borderColor,
    overlay: isDark ? "rgba(0, 0, 0, 0.62)" : "rgba(0, 0, 0, 0.4)",
    overlayStrong: isDark ? "rgba(0, 0, 0, 0.74)" : "rgba(0, 0, 0, 0.52)",
    surface,
    surfaceElevated,
    surfaceAccent,
    surfaceDangerSoft: alpha(destructive, isDark ? "22" : "14"),
    surfaceSuccessSoft: alpha(success, isDark ? "22" : "14"),
    textInverse: isDark ? tone(seedColor, 0.14, 0.965, 0.04) : tone(seedColor, 0.14, 0.985, 0.03),
    textSuccess: success,
    textWarning: warning,
    textError: destructive,
    borderStrong,
    borderSubtle,
    focusRing,
  };
}

export function createThemeGradient(seedColor: string, mode: ResolvedThemeMode) {
  const primary = tuneSeed(seedColor, mode);
  const start = mode === "dark" ? mix(primary, "#000000", 0.24) : mix(primary, "#000000", 0.18);
  const end = mode === "dark" ? mix(primary, "#FFFFFF", 0.18) : mix(primary, "#FFFFFF", 0.2);
  return [start, primary, end] as const;
}
