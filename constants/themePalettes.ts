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

// ─── OKLab/OKLCH color math ───────────────────────────────────────────────────
//
// HSL is perceptually uneven: the same numeric saturation/lightness look far
// more vivid for blue/violet seeds than for yellow/green seeds, because HSL
// has no model of human-perceived brightness or colorfulness. OKLab/OKLCH
// (Björn Ottosson, 2020) fixes that — L tracks perceived lightness uniformly
// across all hues, so any custom accent hex a user picks produces an equally
// balanced, equally vivid palette instead of some hues looking muddy.
//
// This does the conversion math directly (sRGB -> linear -> OKLab -> OKLCH)
// rather than pulling in a color library, since it's ~40 lines of pure
// arithmetic — same cost class as the HSL math it replaces.

const MAX_OKLCH_CHROMA = 0.37; // practical ceiling for in-gamut sRGB chroma across hues

function srgbChannelToLinear(value: number) {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearChannelToSrgb(value: number) {
  const c = value <= 0.0031308 ? value * 12.92 : 1.055 * Math.pow(value, 1 / 2.4) - 0.055;
  return clamp(c * 255);
}

function linearSrgbToOklab(r: number, g: number, b: number) {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}

function oklabToLinearSrgb(L: number, a: number, b: number) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

type Oklab = { L: number; a: number; b: number };
type Oklch = { L: number; C: number; H: number };

function hexToOklab(color: string): Oklab {
  const { r, g, b } = hexToRgb(color);
  return linearSrgbToOklab(srgbChannelToLinear(r), srgbChannelToLinear(g), srgbChannelToLinear(b));
}

function oklabToHex(lab: Oklab) {
  const { r, g, b } = oklabToLinearSrgb(lab.L, lab.a, lab.b);
  return rgbToHex(linearChannelToSrgb(r), linearChannelToSrgb(g), linearChannelToSrgb(b));
}

function oklabToOklch(lab: Oklab): Oklch {
  const C = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
  const hueRad = Math.atan2(lab.b, lab.a);
  const H = ((hueRad * 180) / Math.PI + 360) % 360;
  return { L: lab.L, C, H };
}

function oklchToOklab(lch: Oklch): Oklab {
  const hueRad = (lch.H * Math.PI) / 180;
  return { L: lch.L, a: lch.C * Math.cos(hueRad), b: lch.C * Math.sin(hueRad) };
}

function hexToOklch(color: string): Oklch {
  return oklabToOklch(hexToOklab(color));
}

function oklchToHex(L: number, C: number, H: number) {
  return oklabToHex(oklchToOklab({ L, C, H }));
}

/** Perceptually-uniform blend (OKLab-space lerp) — avoids the grey/brown
 * midpoint that a plain RGB mix produces between complementary-ish hues. */
function mix(color: string, target: string, amount: number) {
  const from = hexToOklab(color);
  const to = hexToOklab(target);
  return oklabToHex({
    L: from.L + (to.L - from.L) * amount,
    a: from.a + (to.a - from.a) * amount,
    b: from.b + (to.b - from.b) * amount,
  });
}

function tuneSeed(seed: string, mode: ResolvedThemeMode) {
  const { C, H } = hexToOklch(seed);
  const tunedChroma = Math.max(0.42 * MAX_OKLCH_CHROMA, Math.min(0.82 * MAX_OKLCH_CHROMA, C));
  const tunedLightness = mode === "dark" ? 0.64 : 0.42;
  return oklchToHex(tunedLightness, tunedChroma, H);
}

/** Derives a new tone from `seed`'s hue: `lightness` is an OKLab L (0 black,
 * 1 white — same meaning across every hue, unlike HSL lightness). `chroma` is
 * scaled from the seed's own OKLCH chroma so muted accents stay muted and
 * vivid accents stay vivid, floored by `minChroma` (both expressed as
 * fractions of `MAX_OKLCH_CHROMA`, matching the old 0–1 HSL-saturation scale
 * these call sites were tuned against). */
function tone(seed: string, chromaMultiplier: number, lightness: number, minChroma = 0) {
  const { C, H } = hexToOklch(seed);
  const nextChroma = Math.max(
    minChroma * MAX_OKLCH_CHROMA,
    Math.min(MAX_OKLCH_CHROMA, C * chromaMultiplier),
  );
  return oklchToHex(lightness, nextChroma, H);
}

/** Semantic tone at a fixed absolute hue (true red/green/amber/blue), not
 * relative to the seed's hue — so destructive/success/warning/info keep
 * their meaning no matter what accent color the user picks, instead of
 * drifting toward/colliding with it. `saturation`/`lightness` are fractions
 * of `MAX_OKLCH_CHROMA` / OKLab L respectively. */
function fixedHueTone(hueDeg: number, saturation: number, lightness: number) {
  return oklchToHex(lightness, saturation * MAX_OKLCH_CHROMA, hueDeg);
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
  // Fixed absolute hues (not seed-relative) so these keep their true-red/
  // true-green/true-amber/true-blue meaning regardless of the chosen accent.
  const HUE_DESTRUCTIVE = 25; // red
  const HUE_SUCCESS = 145; // green
  const HUE_WARNING = 75; // amber
  const HUE_INFO = 250; // blue
  const destructive = fixedHueTone(HUE_DESTRUCTIVE, isDark ? 0.72 : 0.68, isDark ? 0.68 : 0.42);
  const destructiveHover = fixedHueTone(HUE_DESTRUCTIVE, isDark ? 0.76 : 0.72, isDark ? 0.76 : 0.5);
  const success = fixedHueTone(HUE_SUCCESS, isDark ? 0.64 : 0.58, isDark ? 0.66 : 0.36);
  const warning = fixedHueTone(HUE_WARNING, isDark ? 0.76 : 0.68, isDark ? 0.67 : 0.4);
  const info = fixedHueTone(HUE_INFO, isDark ? 0.66 : 0.62, isDark ? 0.68 : 0.42);
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
