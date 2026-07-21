import React from "react";
import { StyleSheet, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Text, XStack, YStack } from "tamagui";

import { Feather } from "@/lib/icons";
import { spacing } from "@/constants/uiTokens";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useBackdropBlurHost } from "@/components/ui/BackdropBlurProvider";
import { PressableScale } from "@/components/ui/PressableScale";
import { ProgressiveBlurFade } from "@/components/ui/ProgressiveBlurFade";
import { appShadow, withAlpha } from "@/components/ui/themeHelpers";
import { useThemeStore } from "@/store/theme";

export const PAGE_TOP_HEADER_HEIGHT = 58;
export const PAGE_TOP_HEADER_MARGIN = 8;
export const PAGE_TOP_HEADER_GAP = 18;
/** Strip below the solid blur band that carries the blur-to-transparent falloff. */
const FADE_TAIL = 50;
/** Pulled off the solid blur band so the fade sits higher over the title block. */
const BLUR_TRIM = 40;
export const PAGE_TOP_HEADER_OFFSET =
  PAGE_TOP_HEADER_MARGIN + PAGE_TOP_HEADER_HEIGHT + PAGE_TOP_HEADER_GAP;

type PageTopFadeHeaderProps = {
  title: string;
  eyebrow: string;
  onBack: () => void;
  topInset?: number;
  headerRight?: React.ReactNode;
  horizontalPadding?: number;
  maxContentWidth?: number;
  contentStyle?: React.ComponentProps<typeof Animated.View>["style"];
};

/** Shared floating back/title header with the same progressive blur used by bottom navigation. */
export function PageTopFadeHeader({
  title,
  eyebrow,
  onBack,
  topInset,
  headerRight,
  horizontalPadding = spacing.lg,
  maxContentWidth,
  contentStyle,
}: PageTopFadeHeaderProps) {
  const blurHost = useBackdropBlurHost();
  const overlayId = React.useId();
  const insets = useSafeAreaInsets();
  const resolvedTopInset = topInset ?? insets.top;

  useFocusEffect(
    React.useCallback(() => {
      if (!blurHost) return;

      blurHost.setOverlay(
        overlayId,
        <PageTopFadeHeaderVisual
          title={title}
          eyebrow={eyebrow}
          onBack={onBack}
          topInset={resolvedTopInset}
          headerRight={headerRight}
          horizontalPadding={horizontalPadding}
          maxContentWidth={maxContentWidth}
          contentStyle={contentStyle}
          blurTarget={blurHost.blurTargetRef}
        />,
      );

      return () => blurHost.removeOverlay(overlayId);
    }, [
      blurHost,
      contentStyle,
      eyebrow,
      headerRight,
      horizontalPadding,
      maxContentWidth,
      onBack,
      overlayId,
      resolvedTopInset,
      title,
    ]),
  );

  if (blurHost) return null;

  return (
    <PageTopFadeHeaderVisual
      title={title}
      eyebrow={eyebrow}
      onBack={onBack}
      topInset={resolvedTopInset}
      headerRight={headerRight}
      horizontalPadding={horizontalPadding}
      maxContentWidth={maxContentWidth}
      contentStyle={contentStyle}
    />
  );
}

type PageTopFadeHeaderVisualProps = Omit<PageTopFadeHeaderProps, "topInset"> & {
  topInset: number;
  blurTarget?: React.ComponentProps<typeof ProgressiveBlurFade>["blurTarget"];
};

function PageTopFadeHeaderVisual({
  title,
  eyebrow,
  onBack,
  topInset,
  headerRight,
  horizontalPadding = spacing.lg,
  maxContentWidth,
  contentStyle,
  blurTarget,
}: PageTopFadeHeaderVisualProps) {
  const theme = useAppTheme();
  const isDark = useThemeStore((s) => s.resolvedMode) === "dark";

  const solidBlurHeight = Math.max(
    topInset,
    topInset + PAGE_TOP_HEADER_MARGIN * 2 + PAGE_TOP_HEADER_HEIGHT - BLUR_TRIM,
  );
  const fadeHeight = solidBlurHeight + FADE_TAIL;

  return (
    <>
      <ProgressiveBlurFade
        direction="top"
        intensity={isDark ? 55 : 48}
        tintAlpha={isDark ? "F5" : "F0"}
        blurHold={solidBlurHeight / fadeHeight}
        blurTarget={blurTarget}
        style={[styles.fade, { height: fadeHeight }]}
      />
      <Animated.View
        pointerEvents="box-none"
        style={[styles.headerLayer, { top: topInset + PAGE_TOP_HEADER_MARGIN }]}
      >
        <Animated.View
          style={[
            styles.headerContent,
            {
              maxWidth: maxContentWidth,
              paddingHorizontal: horizontalPadding,
            } as ViewStyle,
            contentStyle,
          ]}
        >
          <XStack alignItems="center" gap={spacing.md} height={PAGE_TOP_HEADER_HEIGHT}>
            <PressableScale
              onPress={onBack}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <XStack
                width={40}
                height={40}
                borderRadius={20}
                alignItems="center"
                justifyContent="center"
                backgroundColor={withAlpha(theme.backgroundStrong.val, "CC")}
                borderWidth={1}
                borderColor={withAlpha(theme.borderColor.val, "B8")}
                style={appShadow(theme.shadowColor.val, "xs")}
              >
                <Feather name="chevron-left" size={22} color={theme.color.val} />
              </XStack>
            </PressableScale>
            <YStack flex={1} minWidth={0} gap={1}>
              <Text
                color={theme.colorMuted.val}
                fontFamily="$body"
                fontWeight="700"
                fontSize={10}
                lineHeight={12}
                textTransform="uppercase"
                letterSpacing={0.8}
              >
                {eyebrow}
              </Text>
              <Text
                color={theme.color.val}
                fontFamily="$heading"
                fontWeight="700"
                fontSize={28}
                lineHeight={32}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {title}
              </Text>
            </YStack>
            {headerRight}
          </XStack>
        </Animated.View>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  fade: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    zIndex: 998,
    elevation: 998,
  },
  headerLayer: {
    position: "absolute",
    left: 0,
    right: 0,
    width: "100%",
    zIndex: 1001,
    elevation: 1001,
  },
  headerContent: {
    width: "100%",
    alignSelf: "center",
  },
});
