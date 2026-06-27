import React from "react";
import {
  type LayoutChangeEvent,
  Platform,
  type ScrollViewProps,
  type StyleProp,
  StyleSheet,
  type ViewStyle,
  View,
} from "react-native";

import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@/lib/icons";
import { useRouter } from "expo-router";
import Animated, {
  Extrapolation,
  FadeIn,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, XStack, YStack } from "tamagui";

import { useAppTheme } from "@/hooks/useAppTheme";
import { useIsLargeScreen } from "@/hooks/useIsLargeScreen";
import { PressableScale } from "@/components/ui/PressableScale";
import { withAlpha } from "@/components/ui/themeHelpers";

const HEADER_HEIGHT = 48;
const HEADER_TOP_MARGIN = 8;
const CONTENT_TOP_GAP = 30;
const TITLE_PILL_MAX_WIDTH = 240;
const HEADER_COLLAPSE_RANGE = 180;

function GlassPill({
  children,
  style,
  onLayout,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  const theme = useAppTheme();
  const flattened = StyleSheet.flatten(style) ?? {};
  const borderRadius = typeof flattened.borderRadius === "number" ? flattened.borderRadius : 999;

  return (
    <View
      onLayout={onLayout}
      style={[
        styles.glassShellBase,
        Platform.OS === "web" ? styles.glassShellWeb : styles.glassShellNative,
        {
          backgroundColor: withAlpha(theme.surfaceElevated.val, "E6"),
          borderColor: theme.borderStrong.val,
          borderWidth: 1,
          borderRadius,
          shadowColor: theme.shadowColor.val,
        },
        flattened,
      ]}
    >
      <View style={styles.glassContent}>{children}</View>
    </View>
  );
}

type MorePageScaffoldProps = {
  title: string;
  children: React.ReactNode;
  backHref?: string;
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
};

export function MorePageScaffold({
  title,
  children,
  backHref,
  scrollProps,
  noScroll,
  externalOnScroll,
  onContentTopPadding,
  staticHeader,
}: MorePageScaffoldProps) {
  const router = useRouter();
  const theme = useAppTheme();
  const isLargeScreen = useIsLargeScreen();
  const headerCollapse = useSharedValue(0);
  const titlePillWidth = useSharedValue(TITLE_PILL_MAX_WIDTH);
  const headerTop = HEADER_TOP_MARGIN;
  const contentTopPadding = headerTop + HEADER_HEIGHT + CONTENT_TOP_GAP;

  const handleBackPress = React.useCallback(() => {
    if (backHref) {
      router.replace(backHref as never);
      return;
    }

    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/");
  }, [backHref, router]);

  const handleTitlePillLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      const measuredWidth = event.nativeEvent.layout.width;
      if (measuredWidth > 0) {
        titlePillWidth.value = measuredWidth;
      }
    },
    [titlePillWidth],
  );

  React.useEffect(() => {
    onContentTopPadding?.(contentTopPadding);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentTopPadding]);

  const onScroll = useAnimatedScrollHandler<{ lastY?: number }>({
    onBeginDrag: (event, context) => {
      context.lastY = Math.max(event.contentOffset.y, 0);
    },
    onMomentumBegin: (event, context) => {
      context.lastY = Math.max(event.contentOffset.y, 0);
    },
    onScroll: (event, context) => {
      // When staticHeader is on, keep collapse value permanently at 0.
      if (staticHeader) return;
      const currentY = Math.max(event.contentOffset.y, 0);
      const previousY = context.lastY ?? currentY;
      const deltaY = currentY - previousY;
      context.lastY = currentY;

      const next = headerCollapse.value + deltaY;
      headerCollapse.value = Math.max(0, Math.min(HEADER_COLLAPSE_RANGE, next));
    },
  });

  const backPillStyle = useAnimatedStyle(() => {
    if (staticHeader) return { transform: [] };
    const offset = headerCollapse.value;
    const scale = interpolate(offset, [0, HEADER_COLLAPSE_RANGE], [1, 0.68], Extrapolation.CLAMP);
    return {
      transform: [
        {
          translateY: interpolate(offset, [0, HEADER_COLLAPSE_RANGE], [0, -8], Extrapolation.CLAMP),
        },
        { scale },
      ],
    };
  });

  const titlePillStyle = useAnimatedStyle(() => {
    if (staticHeader) return { transform: [] };
    const offset = headerCollapse.value;
    const scale = interpolate(offset, [0, HEADER_COLLAPSE_RANGE], [1, 0.7], Extrapolation.CLAMP);
    const shrink = 1 - scale;
    const keepRightEdgeOffset = isLargeScreen ? 0 : (titlePillWidth.value * shrink) / 2;
    const keepTopEdgeOffset = (HEADER_HEIGHT * shrink) / 2;
    return {
      transform: [
        { scale },
        { translateX: keepRightEdgeOffset },
        {
          translateY:
            interpolate(offset, [0, HEADER_COLLAPSE_RANGE], [0, -10], Extrapolation.CLAMP) -
            keepTopEdgeOffset,
        },
      ],
    };
  });

  const ambientStyle = useAnimatedStyle(() => {
    if (staticHeader) return { opacity: 0.95, transform: [{ scale: 1 }] };
    const offset = headerCollapse.value;
    return {
      opacity: interpolate(offset, [0, HEADER_COLLAPSE_RANGE * 0.67], [0.95, 0.5]),
      transform: [
        {
          scale: interpolate(offset, [0, HEADER_COLLAPSE_RANGE * 0.67], [1, 0.92]),
        },
      ],
    };
  });

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.background.val }}
      edges={["top", "bottom"]}
    >
      <YStack flex={1} backgroundColor="$background">
        <LinearGradient
          colors={[theme.surfaceAccent.val, theme.background.val, theme.background.val]}
          start={{ x: 0.04, y: 0 }}
          end={{ x: 0.88, y: 0.62 }}
          style={StyleSheet.absoluteFill}
        />

        <Animated.View
          pointerEvents="none"
          style={[
            styles.ambientOrb,
            {
              top: headerTop - 14,
              right: isLargeScreen ? 44 : -6,
              backgroundColor: theme.primary.val + "14",
            },
            ambientStyle,
          ]}
        />

        {noScroll ? (
          <View style={{ flex: 1 }}>{children}</View>
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
                paddingHorizontal: 16,
              },
              scrollProps?.contentContainerStyle,
            ]}
          >
            <YStack
              width="100%"
              maxWidth={isLargeScreen ? 1040 : undefined}
              alignSelf="center"
              gap={14}
            >
              {children}
            </YStack>
          </Animated.ScrollView>
        )}

        <Animated.View
          entering={FadeIn.duration(320)}
          pointerEvents="box-none"
          style={[
            styles.headerLayer,
            {
              top: headerTop,
            },
          ]}
        >
          {isLargeScreen ? (
            <XStack
              width="100%"
              maxWidth={1040}
              alignSelf="center"
              alignItems="center"
              gap={14}
              paddingHorizontal={16}
            >
              <YStack
                width={HEADER_HEIGHT}
                height={HEADER_HEIGHT}
                alignItems="center"
                justifyContent="center"
              >
                <Animated.View style={backPillStyle}>
                  <PressableScale onPress={handleBackPress} hitSlop={10}>
                    <View>
                      <GlassPill
                        style={{
                          height: HEADER_HEIGHT,
                          width: HEADER_HEIGHT,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Feather name="chevron-left" size={22} color={theme.color.val + "EE"} />
                      </GlassPill>
                    </View>
                  </PressableScale>
                </Animated.View>
              </YStack>

              <YStack flex={1} height={HEADER_HEIGHT} justifyContent="center">
                <Animated.View
                  style={[titlePillStyle, styles.titlePillFullWidth]}
                  pointerEvents="none"
                >
                  <View>
                    <GlassPill
                      onLayout={handleTitlePillLayout}
                      style={{
                        minHeight: HEADER_HEIGHT,
                        width: "100%",
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    >
                      <Text
                        color={theme.color.val}
                        fontFamily="$heading"
                        fontWeight="700"
                        fontSize={15}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                        textAlign="center"
                      >
                        {title}
                      </Text>
                    </GlassPill>
                  </View>
                </Animated.View>
              </YStack>
            </XStack>
          ) : (
            <>
              <Animated.View style={[styles.backButtonWrap, backPillStyle]}>
                <PressableScale onPress={handleBackPress} hitSlop={10}>
                  <View>
                    <GlassPill
                      style={{
                        height: HEADER_HEIGHT,
                        width: HEADER_HEIGHT,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Feather name="chevron-left" size={22} color={theme.color.val + "EE"} />
                    </GlassPill>
                  </View>
                </PressableScale>
              </Animated.View>

              <Animated.View style={styles.titleWrap} pointerEvents="none">
                <Animated.View style={titlePillStyle}>
                  <View>
                    <GlassPill
                      onLayout={handleTitlePillLayout}
                      style={{
                        minHeight: HEADER_HEIGHT,
                        maxWidth: TITLE_PILL_MAX_WIDTH,
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    >
                      <Text
                        color={theme.color.val}
                        fontFamily="$heading"
                        fontWeight="700"
                        fontSize={15}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                        textAlign="center"
                      >
                        {title}
                      </Text>
                    </GlassPill>
                  </View>
                </Animated.View>
              </Animated.View>
            </>
          )}
        </Animated.View>
      </YStack>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  ambientOrb: {
    position: "absolute",
    width: 168,
    height: 168,
    borderRadius: 999,
  },
  backButtonWrap: {
    position: "absolute",
    left: 16,
    top: 0,
  },
  glassBorder: {
    borderWidth: 1,
    zIndex: 3,
  },
  glassBackdrop: {
    zIndex: 0,
  },
  glassContent: {
    position: "relative",
    zIndex: 4,
  },
  glassShellBase: {},
  glassShellNative: {
    shadowOpacity: 0.22,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 16,
  },
  glassShellWeb: {
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  headerLayer: {
    position: "absolute",
    left: 0,
    right: 0,
    width: "100%",
    alignSelf: "center",
    height: HEADER_HEIGHT,
    zIndex: 1001,
    elevation: 1001,
  },
  titleWrap: {
    position: "absolute",
    left: 84,
    right: 16,
    top: 0,
    alignItems: "flex-end",
  },
  titlePillFullWidth: {
    width: "100%",
  },
});
