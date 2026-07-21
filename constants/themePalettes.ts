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

// ─── HCT (CAM16) color math — the real Android Monet engine ──────────────────
//
// Android's Material You dynamic theming (Monet) doesn't use HSL or OKLab —
// it uses HCT (hue, chroma, tone), built on CAM16, a full color-appearance
// model from Google's `material-color-utilities`. Unlike OKLab, CAM16 models
// actual viewing conditions (surround luminance, adaptation), which is why
// Android wallpaper-derived palettes read as "correct" in a way ad-hoc color
// math doesn't. This ports that reference algorithm (Apache-2.0, Google)
// directly, so an accent hex here produces the same tones Android's own
// dynamic color would derive from it — hue/chroma stay stable, tone (0 black,
// 100 white) replaces lightness, and out-of-gamut requests are resolved by
// the same boundary-search the platform uses instead of naive clamping.

const MAX_HCT_CHROMA = 120; // practical ceiling for in-gamut sRGB chroma across hues/tones

function linearizeChannel(component: number) {
  const normalized = component / 255.0;
  return normalized <= 0.040449936
    ? (normalized / 12.92) * 100.0
    : Math.pow((normalized + 0.055) / 1.055, 2.4) * 100.0;
}

function delinearizeChannel(component: number) {
  const normalized = component / 100.0;
  const value =
    normalized <= 0.0031308 ? normalized * 12.92 : 1.055 * Math.pow(normalized, 1 / 2.4) - 0.055;
  return clamp(Math.round(value * 255.0));
}

function trueDelinearizeChannel(component: number) {
  // Same as delinearizeChannel but unrounded/unclamped — used by the gamut
  // bisector, which needs the exact boundary position, not a display value.
  const normalized = component / 100.0;
  return (
    (normalized <= 0.0031308 ? normalized * 12.92 : 1.055 * Math.pow(normalized, 1 / 2.4) - 0.055) *
    255.0
  );
}

function labF(t: number) {
  const e = 216.0 / 24389.0;
  const kappa = 24389.0 / 27.0;
  return t > e ? Math.cbrt(t) : (kappa * t + 16) / 116;
}

function labInvf(ft: number) {
  const e = 216.0 / 24389.0;
  const kappa = 24389.0 / 27.0;
  const ft3 = ft * ft * ft;
  return ft3 > e ? ft3 : (116 * ft - 16) / kappa;
}

function yFromLstar(lstar: number) {
  return 100.0 * labInvf((lstar + 16.0) / 116.0);
}

function argbFromLinrgb(rLin: number, gLin: number, bLin: number) {
  return rgbToHex(delinearizeChannel(rLin), delinearizeChannel(gLin), delinearizeChannel(bLin));
}

function grayHexFromTone(tone: number) {
  const component = delinearizeChannel(yFromLstar(tone));
  return rgbToHex(component, component, component);
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

// Viewing conditions for a default sRGB display, computed once (matches
// ViewingConditions.DEFAULT in material-color-utilities: D65 white point,
// 200 lux adapting luminance, mid-gray surround).
const VC = (() => {
  const whitePoint = [95.047, 100.0, 108.883];
  const backgroundLstar = 50.0;
  const surround = 2.0;
  const adaptingLuminance = ((200.0 / Math.PI) * yFromLstar(backgroundLstar)) / 100.0;
  const [xw, yw, zw] = whitePoint;
  const rW = xw * 0.401288 + yw * 0.650173 + zw * -0.051461;
  const gW = xw * -0.250268 + yw * 1.204414 + zw * 0.045854;
  const bW = xw * -0.002079 + yw * 0.048952 + zw * 0.953127;
  const f = 0.8 + surround / 10.0;
  const c = f >= 0.9 ? lerp(0.59, 0.69, (f - 0.9) * 10.0) : lerp(0.525, 0.59, (f - 0.8) * 10.0);
  const dRaw = f * (1.0 - (1.0 / 3.6) * Math.exp((-adaptingLuminance - 42.0) / 92.0));
  const d = Math.min(1.0, Math.max(0.0, dRaw));
  const nc = f;
  const rgbD = [d * (100.0 / rW) + 1.0 - d, d * (100.0 / gW) + 1.0 - d, d * (100.0 / bW) + 1.0 - d];
  const k = 1.0 / (5.0 * adaptingLuminance + 1.0);
  const k4 = k * k * k * k;
  const k4F = 1.0 - k4;
  const fl = k4 * adaptingLuminance + 0.1 * k4F * k4F * Math.cbrt(5.0 * adaptingLuminance);
  const n = yFromLstar(backgroundLstar) / whitePoint[1];
  const z = 1.48 + Math.sqrt(n);
  const nbb = 0.725 / Math.pow(n, 0.2);
  const rgbAFactors = [
    Math.pow((fl * rgbD[0] * rW) / 100.0, 0.42),
    Math.pow((fl * rgbD[1] * gW) / 100.0, 0.42),
    Math.pow((fl * rgbD[2] * bW) / 100.0, 0.42),
  ];
  const rgbA = rgbAFactors.map((af) => (400.0 * af) / (af + 27.13));
  const aw = (2.0 * rgbA[0] + rgbA[1] + 0.05 * rgbA[2]) * nbb;
  return { n, aw, nbb, ncb: nbb, c, nc, rgbD, fl, fLRoot: Math.pow(fl, 0.25), z };
})();

function hctFromHex(color: string): { hue: number; chroma: number; tone: number } {
  const { r, g, b } = hexToRgb(color);
  const redL = linearizeChannel(r);
  const greenL = linearizeChannel(g);
  const blueL = linearizeChannel(b);
  const x = 0.41233895 * redL + 0.35762064 * greenL + 0.18051042 * blueL;
  const y = 0.2126 * redL + 0.7152 * greenL + 0.0722 * blueL;
  const z = 0.01932141 * redL + 0.11916382 * greenL + 0.95034478 * blueL;

  const rC = 0.401288 * x + 0.650173 * y - 0.051461 * z;
  const gC = -0.250268 * x + 1.204414 * y + 0.045854 * z;
  const bC = -0.002079 * x + 0.048952 * y + 0.953127 * z;

  const rD = VC.rgbD[0] * rC;
  const gD = VC.rgbD[1] * gC;
  const bD = VC.rgbD[2] * bC;

  const rAF = Math.pow((VC.fl * Math.abs(rD)) / 100.0, 0.42);
  const gAF = Math.pow((VC.fl * Math.abs(gD)) / 100.0, 0.42);
  const bAF = Math.pow((VC.fl * Math.abs(bD)) / 100.0, 0.42);

  const rA = (Math.sign(rD) * 400.0 * rAF) / (rAF + 27.13);
  const gA = (Math.sign(gD) * 400.0 * gAF) / (gAF + 27.13);
  const bA = (Math.sign(bD) * 400.0 * bAF) / (bAF + 27.13);

  const a = (11.0 * rA - 12.0 * gA + bA) / 11.0;
  const bb = (rA + gA - 2.0 * bA) / 9.0;
  const u = (20.0 * rA + 20.0 * gA + 21.0 * bA) / 20.0;
  const p2 = (40.0 * rA + 20.0 * gA + bA) / 20.0;
  const hueRad = Math.atan2(bb, a);
  const hue = ((hueRad * 180) / Math.PI + 360) % 360;

  const ac = p2 * VC.nbb;
  const j = 100.0 * Math.pow(ac / VC.aw, VC.c * VC.z);
  const huePrime = hue < 20.14 ? hue + 360 : hue;
  const eHue = 0.25 * (Math.cos((huePrime * Math.PI) / 180.0 + 2.0) + 3.8);
  const p1 = (50000.0 / 13.0) * eHue * VC.nc * VC.ncb;
  const t = (p1 * Math.sqrt(a * a + bb * bb)) / (u + 0.305);
  const alpha = Math.pow(t, 0.9) * Math.pow(1.64 - Math.pow(0.29, VC.n), 0.73);
  const chroma = alpha * Math.sqrt(j / 100.0);

  return { hue, chroma, tone: 116.0 * labF(y / 100.0) - 16.0 };
}

// ─── HCT gamut solver (ported from HctSolver in material-color-utilities) ────
// Given (hue, chroma, tone), finds the sRGB color that matches — and when the
// requested chroma isn't displayable at that hue/tone, bisects along the RGB
// cube's boundary to find the closest in-gamut point that keeps hue exact,
// same as Android's own dynamic color resolution.

const SCALED_DISCOUNT_FROM_LINRGB = [
  [0.001200833568784504, 0.002389694492170889, 0.0002795742885861124],
  [0.0005891086651375999, 0.0029785502573438758, 0.0003270666104008398],
  [0.00010146692491640572, 0.0005364214359186694, 0.0032979401770712076],
];

const LINRGB_FROM_SCALED_DISCOUNT = [
  [1373.2198709594231, -1100.4251190754821, -7.278681089101213],
  [-271.815969077903, 559.6580465940733, -32.46047482791194],
  [1.9622899599665666, -57.173814538844006, 308.7233197812385],
];

const Y_FROM_LINRGB = [0.2126, 0.7152, 0.0722];

const CRITICAL_PLANES = [
  0.015176349177441876, 0.045529047532325624, 0.07588174588720938, 0.10623444424209313,
  0.13658714259697685, 0.16693984095186062, 0.19729253930674434, 0.2276452376616281,
  0.2579979360165119, 0.28835063437139563, 0.3188300904430532, 0.350925934958123,
  0.3848314933096426, 0.42057480301049466, 0.458183274052838, 0.4976837250274023,
  0.5391024159806381, 0.5824650784040898, 0.6277969426914107, 0.6751227633498623,
  0.7244668422128921, 0.775853049866786, 0.829304845476233, 0.8848452951698498, 0.942497089126609,
  1.0022825574869039, 1.0642236851973577, 1.1283421258858297, 1.1946592148522128,
  1.2631959812511864, 1.3339731595349034, 1.407011200216447, 1.4823302800086415, 1.5599503113873272,
  1.6398909516233677, 1.7221716113234105, 1.8068114625156377, 1.8938294463134073,
  1.9832442801866852, 2.075074464868551, 2.1693382909216234, 2.2660538449872063, 2.36523901573795,
  2.4669114995532007, 2.5710888059345764, 2.6777882626779785, 2.7870270208169257, 2.898822059350997,
  3.0131901897720907, 3.1301480604002863, 3.2497121605402226, 3.3718988244681087,
  3.4967242352587946, 3.624204428461639, 3.754355295633311, 3.887192587735158, 4.022731918402185,
  4.160988767090289, 4.301978482107941, 4.445716283538092, 4.592217266055746, 4.741496401646282,
  4.893568542229298, 5.048448422192488, 5.20615066083972, 5.3666897647573375, 5.5300801301023865,
  5.696336044816294, 5.865471690767354, 6.037501145825082, 6.212438385869475, 6.390297286737924,
  6.571091626112461, 6.7548350853498045, 6.941541251256611, 7.131223617812143, 7.323895587840543,
  7.5195704746346665, 7.7182615035334345, 7.919981813454504, 8.124744458384042, 8.332562408825165,
  8.543448553206703, 8.757415699253682, 8.974476575321063, 9.194643831691977, 9.417930041841839,
  9.644347703669503, 9.873909240696694, 10.106627003236781, 10.342513269534024, 10.58158024687427,
  10.8238400726681, 11.069304815507364, 11.317986476196008, 11.569896988756009, 11.825048221409341,
  12.083451977536606, 12.345119996613247, 12.610063955123938, 12.878295467455942,
  13.149826086772048, 13.42466730586372, 13.702830557985108, 13.984327217668513, 14.269168601521828,
  14.55736596900856, 14.848930523210871, 15.143873411576273, 15.44220572664832, 15.743938506781891,
  16.04908273684337, 16.35764934889634, 16.66964922287304, 16.985093187232053, 17.30399201960269,
  17.62635644741625, 17.95219714852476, 18.281524751807332, 18.614349837764564, 18.95068293910138,
  19.290534541298456, 19.633915083172692, 19.98083495742689, 20.331304511189067, 20.685334046541502,
  21.042933821039977, 21.404114048223256, 21.76888489811322, 22.137256497705877, 22.50923893145328,
  22.884842241736916, 23.264076429332462, 23.6469514538663, 24.033477234264016, 24.42366364919083,
  24.817520537484558, 25.21505769858089, 25.61628489293138, 26.021211842414342, 26.429848230738664,
  26.842203703840827, 27.258287870275353, 27.678110301598522, 28.10168053274597, 28.529008062403893,
  28.96010235337422, 29.39497283293396, 29.83362889318845, 30.276079891419332, 30.722335150426627,
  31.172403958865512, 31.62629557157785, 32.08401920991837, 32.54558406207592, 33.010999283389665,
  33.4802739966603, 33.953417292456834, 34.430438229418264, 34.911345834551085, 35.39614910352207,
  35.88485700094671, 36.37747846067349, 36.87402238606382, 37.37449765026789, 37.87891309649659,
  38.38727753828926, 38.89959975977785, 39.41588851594697, 39.93615253289054, 40.460400508064545,
  40.98864111053629, 41.520882981230194, 42.05713473317016, 42.597404951718396, 43.141702194811224,
  43.6900349931913, 44.24241185063697, 44.798841244188324, 45.35933162437017, 45.92389141541209,
  46.49252901546552, 47.065252796817916, 47.64207110610409, 48.22299226451468, 48.808024568002054,
  49.3971762874833, 49.9904556690408, 50.587870934119984, 51.189430279724725, 51.79514187861014,
  52.40501387947288, 53.0190544071392, 53.637271562750364, 54.259673423945976, 54.88626804504493,
  55.517063457223934, 56.15206766869424, 56.79128866487574, 57.43473440856916, 58.08241284012621,
  58.734331877617365, 59.39049941699807, 60.05092333227251, 60.715611475655585, 61.38457167773311,
  62.057811747619894, 62.7353394731159, 63.417162620860914, 64.10328893648692, 64.79372614476921,
  65.48848194977529, 66.18756403501224, 66.89098006357258, 67.59873767827808, 68.31084450182222,
  69.02730813691093, 69.74813616640164, 70.47333615344107, 71.20291564160104, 71.93688215501312,
  72.67524319850172, 73.41800625771542, 74.16517879925733, 74.9167682708136, 75.67278210128072,
  76.43322770089146, 77.1981124613393, 77.96744375590167, 78.74122893956174, 79.51947534912904,
  80.30219030335869, 81.08938110306934, 81.88105503125999, 82.67721935322541, 83.4778813166706,
  84.28304815182372, 85.09272707154808, 85.90692527145302, 86.72564993000343, 87.54890820862819,
  88.3767072518277, 89.2090541872801, 90.04595612594655, 90.88742016217518, 91.73345337380438,
  92.58406282226491, 93.43925555268066, 94.29903859396902, 95.16341895893969, 96.03240364439274,
  96.9059996312159, 97.78421388448044, 98.6670533535366, 99.55452497210776,
];

function matMul3(v: number[], m: number[][]) {
  return [
    v[0] * m[0][0] + v[1] * m[0][1] + v[2] * m[0][2],
    v[0] * m[1][0] + v[1] * m[1][1] + v[2] * m[1][2],
    v[0] * m[2][0] + v[1] * m[2][1] + v[2] * m[2][2],
  ];
}

function chromaticAdaptation(component: number) {
  const af = Math.pow(Math.abs(component), 0.42);
  return (Math.sign(component) * 400.0 * af) / (af + 27.13);
}

function inverseChromaticAdaptation(adapted: number) {
  const adaptedAbs = Math.abs(adapted);
  const base = Math.max(0, (27.13 * adaptedAbs) / (400.0 - adaptedAbs));
  return Math.sign(adapted) * Math.pow(base, 1.0 / 0.42);
}

function hueOfLinrgb(linrgb: number[]) {
  const scaled = matMul3(linrgb, SCALED_DISCOUNT_FROM_LINRGB);
  const rA = chromaticAdaptation(scaled[0]);
  const gA = chromaticAdaptation(scaled[1]);
  const bA = chromaticAdaptation(scaled[2]);
  const a = (11.0 * rA - 12.0 * gA + bA) / 11.0;
  const b = (rA + gA - 2.0 * bA) / 9.0;
  return Math.atan2(b, a);
}

function sanitizeRadians(angle: number) {
  return (angle + Math.PI * 8) % (Math.PI * 2);
}

function areInCyclicOrder(a: number, b: number, c: number) {
  return sanitizeRadians(b - a) < sanitizeRadians(c - a);
}

function lerpPoint(source: number[], t: number, target: number[]) {
  return [
    source[0] + (target[0] - source[0]) * t,
    source[1] + (target[1] - source[1]) * t,
    source[2] + (target[2] - source[2]) * t,
  ];
}

function setCoordinate(source: number[], coordinate: number, target: number[], axis: number) {
  const t = (coordinate - source[axis]) / (target[axis] - source[axis]);
  return lerpPoint(source, t, target);
}

function isBounded(x: number) {
  return x >= 0.0 && x <= 100.0;
}

function nthVertex(y: number, n: number): number[] {
  const [kR, kG, kB] = Y_FROM_LINRGB;
  const coordA = n % 4 <= 1 ? 0.0 : 100.0;
  const coordB = n % 2 === 0 ? 0.0 : 100.0;
  if (n < 4) {
    const g = coordA;
    const b = coordB;
    const r = (y - g * kG - b * kB) / kR;
    return isBounded(r) ? [r, g, b] : [-1, -1, -1];
  } else if (n < 8) {
    const b = coordA;
    const r = coordB;
    const g = (y - r * kR - b * kB) / kG;
    return isBounded(g) ? [r, g, b] : [-1, -1, -1];
  } else {
    const r = coordA;
    const g = coordB;
    const b = (y - r * kR - g * kG) / kB;
    return isBounded(b) ? [r, g, b] : [-1, -1, -1];
  }
}

function bisectToSegment(y: number, targetHue: number): number[][] {
  let left = [-1, -1, -1];
  let right = left;
  let leftHue = 0;
  let rightHue = 0;
  let initialized = false;
  let uncut = true;
  for (let n = 0; n < 12; n++) {
    const mid = nthVertex(y, n);
    if (mid[0] < 0) continue;
    const midHue = hueOfLinrgb(mid);
    if (!initialized) {
      left = mid;
      right = mid;
      leftHue = midHue;
      rightHue = midHue;
      initialized = true;
      continue;
    }
    if (uncut || areInCyclicOrder(leftHue, midHue, rightHue)) {
      uncut = false;
      if (areInCyclicOrder(leftHue, targetHue, midHue)) {
        right = mid;
        rightHue = midHue;
      } else {
        left = mid;
        leftHue = midHue;
      }
    }
  }
  return [left, right];
}

function midpoint(a: number[], b: number[]) {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}

function bisectToLimit(y: number, targetHue: number) {
  const [segLeft, segRight] = bisectToSegment(y, targetHue);
  let left = segLeft;
  let leftHue = hueOfLinrgb(left);
  let right = segRight;
  for (let axis = 0; axis < 3; axis++) {
    if (left[axis] !== right[axis]) {
      let lPlane: number;
      let rPlane: number;
      if (left[axis] < right[axis]) {
        lPlane = Math.floor(trueDelinearizeChannel(left[axis]) - 0.5);
        rPlane = Math.ceil(trueDelinearizeChannel(right[axis]) - 0.5);
      } else {
        lPlane = Math.ceil(trueDelinearizeChannel(left[axis]) - 0.5);
        rPlane = Math.floor(trueDelinearizeChannel(right[axis]) - 0.5);
      }
      for (let i = 0; i < 8; i++) {
        if (Math.abs(rPlane - lPlane) <= 1) break;
        const mPlane = Math.floor((lPlane + rPlane) / 2.0);
        const mid = setCoordinate(left, CRITICAL_PLANES[mPlane], right, axis);
        const midHue = hueOfLinrgb(mid);
        if (areInCyclicOrder(leftHue, targetHue, midHue)) {
          right = mid;
          rPlane = mPlane;
        } else {
          left = mid;
          leftHue = midHue;
          lPlane = mPlane;
        }
      }
    }
  }
  return midpoint(left, right);
}

function findResultByJ(hueRadians: number, chroma: number, y: number): string | null {
  let j = Math.sqrt(y) * 11.0;
  const tInnerCoeff = 1 / Math.pow(1.64 - Math.pow(0.29, VC.n), 0.73);
  const eHue = 0.25 * (Math.cos(hueRadians + 2.0) + 3.8);
  const p1 = eHue * (50000.0 / 13.0) * VC.nc * VC.ncb;
  const hSin = Math.sin(hueRadians);
  const hCos = Math.cos(hueRadians);
  for (let round = 0; round < 5; round++) {
    const jNormalized = j / 100.0;
    const alpha = chroma === 0.0 || j === 0.0 ? 0.0 : chroma / Math.sqrt(jNormalized);
    const t = Math.pow(alpha * tInnerCoeff, 1.0 / 0.9);
    const ac = VC.aw * Math.pow(jNormalized, 1.0 / VC.c / VC.z);
    const p2 = ac / VC.nbb;
    const gamma = (23.0 * (p2 + 0.305) * t) / (23.0 * p1 + 11 * t * hCos + 108.0 * t * hSin);
    const a = gamma * hCos;
    const b = gamma * hSin;
    const rA = (460.0 * p2 + 451.0 * a + 288.0 * b) / 1403.0;
    const gA = (460.0 * p2 - 891.0 * a - 261.0 * b) / 1403.0;
    const bA = (460.0 * p2 - 220.0 * a - 6300.0 * b) / 1403.0;
    const linrgb = matMul3(
      [
        inverseChromaticAdaptation(rA),
        inverseChromaticAdaptation(gA),
        inverseChromaticAdaptation(bA),
      ],
      LINRGB_FROM_SCALED_DISCOUNT,
    );
    if (linrgb[0] < 0 || linrgb[1] < 0 || linrgb[2] < 0) return null;
    const fnj =
      Y_FROM_LINRGB[0] * linrgb[0] + Y_FROM_LINRGB[1] * linrgb[1] + Y_FROM_LINRGB[2] * linrgb[2];
    if (fnj <= 0) return null;
    if (round === 4 || Math.abs(fnj - y) < 0.002) {
      if (linrgb[0] > 100.01 || linrgb[1] > 100.01 || linrgb[2] > 100.01) return null;
      return argbFromLinrgb(linrgb[0], linrgb[1], linrgb[2]);
    }
    j = j - ((fnj - y) * j) / (2 * fnj);
  }
  return null;
}

/** Solves for the sRGB hex matching (hueDegrees, chroma, tone) exactly when
 * displayable, falling back to a hue-preserving gamut-boundary search
 * (bisectToLimit) when the requested chroma is out of range for that tone —
 * the same resolution Android's dynamic color system performs. */
function solveToHex(hueDegrees: number, chroma: number, tone: number) {
  if (chroma < 0.0001 || tone < 0.0001 || tone > 99.9999) {
    return grayHexFromTone(tone);
  }
  const hue = ((hueDegrees % 360) + 360) % 360;
  const hueRadians = (hue / 180) * Math.PI;
  const y = yFromLstar(tone);
  const exact = findResultByJ(hueRadians, chroma, y);
  if (exact) return exact;
  const [rLin, gLin, bLin] = bisectToLimit(y, hueRadians);
  return argbFromLinrgb(rLin, gLin, bLin);
}

function lerpHue(fromHue: number, toHue: number, amount: number) {
  const diff = ((((toHue - fromHue + 540) % 360) + 360) % 360) - 180;
  return (fromHue + diff * amount + 360) % 360;
}

/** HCT-space blend — lerps hue along the shortest arc and chroma/tone
 * linearly, avoiding the grey/brown midpoint a plain RGB mix produces between
 * complementary-ish hues. */
function mix(color: string, target: string, amount: number) {
  const from = hctFromHex(color);
  const to = hctFromHex(target);
  return solveToHex(
    lerpHue(from.hue, to.hue, amount),
    from.chroma + (to.chroma - from.chroma) * amount,
    from.tone + (to.tone - from.tone) * amount,
  );
}

type SeedHct = { hue: number; chroma: number };

function tuneSeed(seed: SeedHct, mode: ResolvedThemeMode) {
  const tunedChroma = Math.max(0.42 * MAX_HCT_CHROMA, Math.min(0.82 * MAX_HCT_CHROMA, seed.chroma));
  const tunedLightness = mode === "dark" ? 0.64 : 0.42;
  return solveToHex(seed.hue, tunedChroma, tunedLightness * 100);
}

/** Derives a new tone from `seed`'s hue: `lightness` is an HCT tone expressed
 * as a 0–1 fraction (0 black, 1 white — same meaning across every hue, unlike
 * HSL lightness). `chroma` is scaled from the seed's own HCT chroma so muted
 * accents stay muted and vivid accents stay vivid, floored by `minChroma`
 * (both expressed as fractions of `MAX_HCT_CHROMA`, matching the old 0–1
 * HSL-saturation scale these call sites were tuned against). `seed` is the
 * seed color's HCT hue/chroma, computed once per palette build and reused —
 * this runs ~15+ times per `createThemeColors` call with the same input, and
 * the CAM16 forward transform (trig + pow + matrix multiplies) isn't free. */
function tone(seed: SeedHct, chromaMultiplier: number, lightness: number, minChroma = 0) {
  const nextChroma = Math.max(
    minChroma * MAX_HCT_CHROMA,
    Math.min(MAX_HCT_CHROMA, seed.chroma * chromaMultiplier),
  );
  return solveToHex(seed.hue, nextChroma, lightness * 100);
}

/** Semantic tone at a fixed absolute hue (true red/green/amber/blue), not
 * relative to the seed's hue — so destructive/success/warning/info keep
 * their meaning no matter what accent color the user picks, instead of
 * drifting toward/colliding with it. `saturation`/`lightness` are fractions
 * of `MAX_HCT_CHROMA` / HCT tone respectively. */
function fixedHueTone(hueDeg: number, saturation: number, lightness: number) {
  return solveToHex(hueDeg, saturation * MAX_HCT_CHROMA, lightness * 100);
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

// ─── Contrast guard ───────────────────────────────────────────────────────────
//
// The tone()/tuneSeed() formulas pick sensible lightness targets for typical
// accent hues, but nothing forces a WCAG-safe result for unusual custom hex
// picks. This checks the actual rendered contrast and, only if it falls short,
// nudges lightness away from the background/surface it sits on — hue and
// chroma are left untouched, so it reads as "the same color, just legible"
// rather than a different color.

function relativeLuminance(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  return (
    (0.2126 * linearizeChannel(r) + 0.7152 * linearizeChannel(g) + 0.0722 * linearizeChannel(b)) /
    100
  );
}

function contrastRatio(hexA: string, hexB: string) {
  const a = relativeLuminance(hexA);
  const b = relativeLuminance(hexB);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Bisects `fgHex`'s HCT tone toward whichever extreme (black/white)
 * increases contrast against `bgHex`, stopping as soon as `minRatio` is met —
 * i.e. the smallest tone change that fixes contrast, not a fixed jump. */
function ensureContrast(fgHex: string, bgHex: string, minRatio: number): string {
  if (contrastRatio(fgHex, bgHex) >= minRatio) return fgHex;

  const hct = hctFromHex(fgHex);
  const bgLum = relativeLuminance(bgHex);
  // The luminance crossover where black vs. white contrast tie is ~0.179, not
  // 0.5 (solve (bgLum+0.05)/0.05 == 1.05/(bgLum+0.05)) — so pick whichever
  // extreme actually wins for this background rather than guessing from tone.
  const contrastAtBlack = (bgLum + 0.05) / 0.05;
  const contrastAtWhite = 1.05 / (bgLum + 0.05);
  const targetTone = contrastAtBlack >= contrastAtWhite ? 0 : 100;

  const atExtreme = solveToHex(hct.hue, hct.chroma, targetTone);
  if (contrastRatio(atExtreme, bgHex) < minRatio) {
    return atExtreme; // best effort — chroma this high can't hit the target even at black/white
  }

  let lo = hct.tone;
  let hi = targetTone;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const candidate = solveToHex(hct.hue, hct.chroma, mid);
    if (contrastRatio(candidate, bgHex) >= minRatio) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return solveToHex(hct.hue, hct.chroma, hi);
}

export function createThemeColors(seedColor: string, mode: ResolvedThemeMode): ThemeColorValues {
  const isDark = mode === "dark";
  const seedHct = hctFromHex(seedColor);
  // Memora's archive neutrals stay cool and quiet regardless of the chosen
  // personalization accent. Accent-derived neutrals made each preset feel
  // like an entirely different product and turned amber into a beige wash.
  const archiveHct = hctFromHex("#315064");
  const primary = tuneSeed(seedHct, mode);
  const primaryHover = isDark ? tone(seedHct, 0.8, 0.72, 0.38) : tone(seedHct, 0.86, 0.34, 0.38);
  const neutralSaturation = isDark ? 0.26 : 0.34;
  const containerSaturation = isDark ? 0.34 : 0.42;
  const accentSaturation = isDark ? 0.48 : 0.5;
  const background = tone(
    archiveHct,
    neutralSaturation,
    isDark ? 0.17 : 0.925,
    isDark ? 0.1 : 0.08,
  );
  const backgroundHover = tone(
    archiveHct,
    neutralSaturation,
    isDark ? 0.205 : 0.895,
    isDark ? 0.11 : 0.09,
  );
  const backgroundPress = tone(
    archiveHct,
    neutralSaturation,
    isDark ? 0.25 : 0.85,
    isDark ? 0.12 : 0.1,
  );
  const backgroundStrong = tone(
    archiveHct,
    neutralSaturation,
    isDark ? 0.22 : 0.955,
    isDark ? 0.1 : 0.07,
  );
  const color = ensureContrast(
    tone(archiveHct, 0.18, isDark ? 0.94 : 0.105, isDark ? 0.05 : 0.04),
    background,
    4.5,
  );
  const colorMuted = tone(archiveHct, 0.22, isDark ? 0.73 : 0.36, isDark ? 0.06 : 0.05);
  const secondary = tone(
    archiveHct,
    containerSaturation,
    isDark ? 0.18 : 0.86,
    isDark ? 0.12 : 0.1,
  );
  const secondaryHover = tone(
    archiveHct,
    containerSaturation,
    isDark ? 0.225 : 0.81,
    isDark ? 0.14 : 0.12,
  );
  const accent = tone(seedHct, accentSaturation, isDark ? 0.235 : 0.82, isDark ? 0.18 : 0.16);
  const accentHover = tone(seedHct, accentSaturation, isDark ? 0.29 : 0.74, isDark ? 0.2 : 0.18);
  const borderColor = tone(
    archiveHct,
    containerSaturation,
    isDark ? 0.34 : 0.71,
    isDark ? 0.12 : 0.1,
  );
  const borderColorHover = tone(
    archiveHct,
    containerSaturation,
    isDark ? 0.4 : 0.63,
    isDark ? 0.14 : 0.12,
  );
  const card = tone(archiveHct, neutralSaturation, isDark ? 0.21 : 0.945, isDark ? 0.1 : 0.075);
  const surface = tone(archiveHct, neutralSaturation, isDark ? 0.21 : 0.938, isDark ? 0.1 : 0.08);
  const surfaceElevated = tone(
    archiveHct,
    neutralSaturation,
    isDark ? 0.26 : 0.968,
    isDark ? 0.11 : 0.065,
  );
  const surfaceAccent = tone(seedHct, accentSaturation, isDark ? 0.265 : 0.86, isDark ? 0.2 : 0.16);
  const borderStrong = tone(seedHct, accentSaturation, isDark ? 0.48 : 0.49, isDark ? 0.18 : 0.16);
  const borderSubtle = tone(
    archiveHct,
    containerSaturation,
    isDark ? 0.27 : 0.79,
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
    textInverse: ensureContrast(
      isDark ? tone(seedHct, 0.14, 0.965, 0.04) : tone(seedHct, 0.14, 0.985, 0.03),
      primary,
      4.5,
    ),
    textSuccess: success,
    textWarning: warning,
    textError: destructive,
    borderStrong,
    borderSubtle,
    focusRing,
  };
}

export function createThemeGradient(seedColor: string, mode: ResolvedThemeMode) {
  const primary = tuneSeed(hctFromHex(seedColor), mode);
  const start = mode === "dark" ? mix(primary, "#000000", 0.24) : mix(primary, "#000000", 0.18);
  const end = mode === "dark" ? mix(primary, "#FFFFFF", 0.18) : mix(primary, "#FFFFFF", 0.2);
  return [start, primary, end] as const;
}

/**
 * Alpha-only gradients. These are masks and hit-box fillers, not surface
 * colors — the channel values carry no theme meaning, only opacity, so they
 * live here rather than as literals inside components.
 */
/**
 * Smootherstep (6t^5-15t^4+10t^3) sampled at evenly spaced t, opaque ->
 * transparent. Slope reaches zero at BOTH ends, so neither edge of a fade
 * shows a crease. The easing is in these values, not in gradient stop
 * positions — pair it with evenly spaced locations or the curve is lost.
 */
const FADE_ALPHAS = ["FF", "FB", "E5", "B9", "80", "46", "1A", "04", "00"] as const;

export const alphaGradients = {
  /** Transparent -> opaque ramp, used as a MaskedView mask for a fading blur. */
  maskFadeIn: FADE_ALPHAS.map((alpha) => `#000000${alpha}`).reverse() as [
    string,
    string,
    ...string[],
  ],
  /** Fully transparent, but still a real native view that can capture touches. */
  invisible: ["#00000000", "#00000000"] as [string, string],
  /** Opaque -> transparent, for fading a themed surface out over content. */
  surfaceFadeOut: FADE_ALPHAS,
} as const;
