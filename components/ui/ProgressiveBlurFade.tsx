import MaskedView from "@react-native-masked-view/masked-view";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Platform, StyleSheet, View, type ViewStyle } from "react-native";

import { withAlpha } from "@/components/ui/themeHelpers";
import { useAppTheme } from "@/hooks/useAppTheme";
import { alphaGradients } from "@/constants/themePalettes";
import { useThemeStore } from "@/store/theme";

type ProgressiveBlurFadeProps = {
  /** Blur strength at the fully-opaque edge. */
  intensity?: number;
  /** Alpha of the background tint at the fully-opaque edge, as a hex pair. */
  tintAlpha?: string;
  /** Android blur target from the backdrop host; without it Android cannot blur. */
  blurTarget?: React.RefObject<View | null>;
  /** Edge where the blur is strongest. Defaults to the bottom edge. */
  direction?: "top" | "bottom";
  /**
   * Fraction of the strip, measured from the strong edge, held at full blur before
   * the fade ramp starts. `0` keeps the default ramp; higher values grow the solid
   * blur band and compress the gradient into the remaining space.
   */
  blurHold?: number;
  style?: React.ComponentProps<typeof View>["style"];
};

/** `expo-linear-gradient` requires at least two stops. */
type GradientStops = [number, number, ...number[]];

// Span the mask ramp occupies by default; past it the strip is fully blurred.
// Direction is set by the gradient vector, so both edges share one native path.
const MASK_RAMP_SPAN = 0.78;
// Evenly spaced: the easing lives in `maskFadeIn`'s alpha values, not here.
const MASK_LOCATIONS: readonly number[] = alphaGradients.maskFadeIn.map(
  (_, index, all) => (index / (all.length - 1)) * MASK_RAMP_SPAN,
);

// Weak-edge-weighted, so the held part of the strip reads as blur, not wash.
const TINT_LOCATIONS: GradientStops = [0, 0.3, 0.46, 0.6, 0.74, 0.87, 1];
// Ends at the alpha applied where the blur is strongest.
const TINT_ALPHAS = ["00", "1F", "3D", "5C", "80", "9E", "B8"] as const;

/** Rescales the mask ramp onto `span`, keeping its curve. */
const compress = (span: number) =>
  MASK_LOCATIONS.map((location) => (location / MASK_RAMP_SPAN) * span);

/** Mirrors `maskFadeIn` as CSS, so web and native never drift onto different curves. */
const toCssMask = (towards: string, locations: readonly number[]) => {
  // The palette ramp is already #RRGGBBAA, which CSS accepts verbatim.
  const stops = alphaGradients.maskFadeIn.map(
    (color, index) => `${color} ${(locations[index] * 100).toFixed(1)}%`,
  );
  return `linear-gradient(${towards}, ${stops.join(", ")})`;
};

/**
 * Fading blur: a BlurView masked by a vertical linear gradient, so content
 * dissolves into the chosen edge instead of hitting a hard blur boundary.
 *
 * Platform behaviour:
 * - iOS: real masked blur.
 * - Android: masked blur only when `blurTarget` is provided (dimezis backdrop);
 *   otherwise the gradient tint alone carries the fade.
 * - Web: CSS `backdrop-filter` + `mask-image`, since MaskedView is unreliable there.
 */
export const ProgressiveBlurFade = React.memo(function ProgressiveBlurFade({
  intensity = 24,
  tintAlpha,
  blurTarget,
  direction = "bottom",
  blurHold = 0,
  style,
}: ProgressiveBlurFadeProps) {
  const theme = useAppTheme();
  const isDark = useThemeStore((s) => s.resolvedMode) === "dark";
  const background = theme.background.val;

  const hold = Math.min(Math.max(blurHold, 0), 0.9);

  // At hold 0 the ramp rescales onto itself, so there is no special case.
  const maskLocations = React.useMemo(
    () => compress(hold ? 1 - hold : MASK_RAMP_SPAN) as GradientStops,
    [hold],
  );

  // Deliberately independent of `hold`: the tint always ramps across the full
  // strip so only the very edge reaches peak. Compressing it too would wash the
  // whole held band flat and hide the blur it exists to show.
  const tintColors = React.useMemo(() => {
    const alphas = [...TINT_ALPHAS.slice(0, -1), tintAlpha ?? TINT_ALPHAS[TINT_ALPHAS.length - 1]];
    return alphas.map((alpha) => withAlpha(background, alpha)) as [string, string, ...string[]];
  }, [background, tintAlpha]);

  const gradientStart = direction === "top" ? { x: 0, y: 1 } : { x: 0, y: 0 };
  const gradientEnd = direction === "top" ? { x: 0, y: 0 } : { x: 0, y: 1 };

  const tint = (
    <LinearGradient
      colors={tintColors}
      locations={TINT_LOCATIONS}
      start={gradientStart}
      end={gradientEnd}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    />
  );

  if (Platform.OS === "web") {
    const gradient = toCssMask(direction === "top" ? "to top" : "to bottom", maskLocations);
    return (
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            // web-only CSS properties
            {
              backdropFilter: `blur(${Math.round(intensity * 0.9)}px)`,
              WebkitBackdropFilter: `blur(${Math.round(intensity * 0.9)}px)`,
              maskImage: gradient,
              WebkitMaskImage: gradient,
            } as unknown as ViewStyle,
          ]}
        />
        {tint}
      </View>
    );
  }

  const canBlur = Platform.OS !== "android" || Boolean(blurTarget);

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      {canBlur ? (
        <MaskedView
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
          maskElement={
            <LinearGradient
              colors={alphaGradients.maskFadeIn}
              locations={maskLocations}
              start={gradientStart}
              end={gradientEnd}
              style={StyleSheet.absoluteFill}
            />
          }
        >
          <BlurView
            style={StyleSheet.absoluteFill}
            intensity={intensity}
            tint={isDark ? "dark" : "light"}
            blurMethod={Platform.OS === "android" ? "dimezisBlurViewSdk31Plus" : undefined}
            blurTarget={Platform.OS === "android" ? blurTarget : undefined}
            blurReductionFactor={Platform.OS === "android" ? 3.5 : undefined}
          />
        </MaskedView>
      ) : null}
      {tint}
    </View>
  );
});
