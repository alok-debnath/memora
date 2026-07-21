import React from "react";
import { type ScrollViewProps, StyleSheet, View } from "react-native";

import { useRouter } from "expo-router";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { YStack } from "tamagui";

import { useAppTheme } from "@/hooks/useAppTheme";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import { layout, spacing } from "@/constants/uiTokens";
import {
  PAGE_TOP_HEADER_GAP,
  PAGE_TOP_HEADER_HEIGHT,
  PAGE_TOP_HEADER_MARGIN,
  PageTopFadeHeader,
} from "@/components/ui/PageTopFadeHeader";
import { withAlpha } from "@/components/ui/themeHelpers";

const HEADER_COLLAPSE_RANGE = 180;

type MorePageScaffoldProps = {
  title: string;
  children: React.ReactNode;
  backHref?: string;
  fallbackHref?: string;
  scrollProps?: Omit<ScrollViewProps, "children">;
  /**
   * When true, renders children directly in a View instead of a ScrollView.
   * Use this when children contain their own VirtualizedList (FlatList/SectionList).
   * Pass the scroll handler via `externalOnScroll` to keep header animation working.
   */
  noScroll?: boolean;
  /** Pass the animated scroll handler from `useAnimatedScrollHandler` to drive the header collapse. */
  externalOnScroll?: ReturnType<typeof useAnimatedScrollHandler>;
  /** The top padding needed for content below the header. Passed to a callback so the caller can apply it. */
  onContentTopPadding?: (padding: number) => void;
  /**
   * When true, the back pill and title pill are permanently fixed at their
   * full size — no collapse/shrink animation on scroll.
   */
  staticHeader?: boolean;
  /** Uses the wider application workspace measure. Defaults to the standard page measure. */
  widthMode?: "standard" | "workspace";
};

export function MorePageScaffold({
  title,
  children,
  backHref,
  fallbackHref = "/",
  scrollProps,
  noScroll,
  externalOnScroll,
  onContentTopPadding,
  staticHeader,
  widthMode = "standard",
}: MorePageScaffoldProps) {
  const router = useRouter();
  const theme = useAppTheme();
  const responsive = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const maxContentWidth =
    widthMode === "workspace" ? layout.workspaceMaxWidth : layout.standardMaxWidth;
  const scrollY = useSharedValue(0);
  const headerTop = insets.top + PAGE_TOP_HEADER_MARGIN;
  const contentTopPadding = headerTop + PAGE_TOP_HEADER_HEIGHT + PAGE_TOP_HEADER_GAP;

  const handleBackPress = React.useCallback(() => {
    if (backHref) {
      router.replace(backHref as never);
      return;
    }

    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(fallbackHref as never);
  }, [backHref, fallbackHref, router]);

  React.useEffect(() => {
    onContentTopPadding?.(contentTopPadding);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentTopPadding]);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      if (staticHeader) return;
      scrollY.value = Math.max(event.contentOffset.y, 0);
    },
  });

  const headerCapsuleStyle = useAnimatedStyle(() => {
    if (staticHeader) return { transform: [] };
    const offset = scrollY.value;
    const scale = interpolate(offset, [0, HEADER_COLLAPSE_RANGE], [1, 0.96], Extrapolation.CLAMP);
    return {
      transform: [
        { scale },
        {
          translateY: interpolate(offset, [0, HEADER_COLLAPSE_RANGE], [0, -4], Extrapolation.CLAMP),
        },
      ],
    };
  });

  const ambientStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, HEADER_COLLAPSE_RANGE * 0.67], [0.95, 0.5]),
  }));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background.val }} edges={["bottom"]}>
      <YStack flex={1} backgroundColor={theme.background.val}>
        {/*
          Scroll cue only: it earns its keep by fading as the header collapses. A
          static header never scrolls, so the band would sit pinned across the bottom
          of the header's blur ramp and read as a seam.
        */}
        {staticHeader ? null : (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.ambientBand,
              {
                top: headerTop + PAGE_TOP_HEADER_HEIGHT + 14,
                backgroundColor: withAlpha(theme.borderStrong.val, "18"),
              },
              ambientStyle,
            ]}
          />
        )}

        {noScroll ? (
          <View
            style={{
              flex: 1,
              width: "100%",
              maxWidth: maxContentWidth,
              alignSelf: "center",
            }}
          >
            {children}
          </View>
        ) : (
          <Animated.ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            scrollEventThrottle={16}
            onScroll={externalOnScroll ?? onScroll}
            {...scrollProps}
            contentContainerStyle={[
              {
                paddingTop: contentTopPadding,
                paddingBottom: 144,
                paddingHorizontal: spacing.lg,
              },
              scrollProps?.contentContainerStyle,
            ]}
          >
            <YStack
              width="100%"
              maxWidth={responsive.isCompact ? undefined : maxContentWidth - spacing.lg * 2}
              alignSelf="center"
              gap={14}
            >
              {children}
            </YStack>
          </Animated.ScrollView>
        )}

        <PageTopFadeHeader
          title={title}
          eyebrow="More"
          onBack={handleBackPress}
          maxContentWidth={maxContentWidth}
          contentStyle={headerCapsuleStyle}
        />
      </YStack>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  ambientBand: {
    position: "absolute",
    left: 16,
    right: 16,
    height: 1,
  },
});
