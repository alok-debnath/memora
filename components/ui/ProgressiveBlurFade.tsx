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
  /** Controls how much themed surface tint sits over the blur. */
  tintVariant?: "default" | "subtle";
  style?: React.ComponentProps<typeof View>["style"];
};

// Multi-stop mask lets the blur grow on an ease-in curve instead of exposing
// a visible linear seam. Direction is controlled by the gradient vector so
// both edges use the exact same native blur/mask implementation.
const MASK_LOCATIONS: readonly [number, number, ...number[]] = [0, 0.14, 0.3, 0.46, 0.62, 0.78];
// Tint is bottom-weighted so the upper part of the strip reads as blur, not wash.
const TINT_LOCATIONS: readonly [number, number, ...number[]] = [0, 0.3, 0.46, 0.6, 0.74, 0.87, 1];
const TINT_ALPHAS = ["00", "1F", "3D", "5C", "80", "9E", "B8"] as const;
const SUBTLE_TINT_ALPHAS = ["00", "0E", "1C", "2A", "3A", "4E", "64"] as const;

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
  tintVariant = "default",
  style,
}: ProgressiveBlurFadeProps) {
  const theme = useAppTheme();
  const isDark = useThemeStore((s) => s.resolvedMode) === "dark";
  const background = theme.background.val;

  const tintColors = React.useMemo(() => {
    const tintAlphas = tintVariant === "subtle" ? SUBTLE_TINT_ALPHAS : TINT_ALPHAS;
    const alphas = tintAlpha
      ? tintAlphas.map((a, i) => (i === tintAlphas.length - 1 ? tintAlpha : a))
      : tintAlphas;
    return alphas.map((alpha) => withAlpha(background, alpha)) as [string, string, ...string[]];
  }, [background, tintAlpha, tintVariant]);

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
    const gradient =
      direction === "top" ? alphaGradients.maskFadeOutCss : alphaGradients.maskFadeInCss;
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
              locations={MASK_LOCATIONS}
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
