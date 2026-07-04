import React from "react";
import { type ScrollViewProps, StyleSheet, View } from "react-native";

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
import { appShadow, withAlpha } from "@/components/ui/themeHelpers";

const HEADER_HEIGHT = 58;
const HEADER_TOP_MARGIN = 8;
const CONTENT_TOP_GAP = 18;
const HEADER_COLLAPSE_RANGE = 180;

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

  const headerCapsuleStyle = useAnimatedStyle(() => {
    if (staticHeader) return { transform: [] };
    const offset = headerCollapse.value;
    const scale = interpolate(offset, [0, HEADER_COLLAPSE_RANGE], [1, 0.94], Extrapolation.CLAMP);
    return {
      transform: [
        { scale },
        {
          translateY: interpolate(offset, [0, HEADER_COLLAPSE_RANGE], [0, -6], Extrapolation.CLAMP),
        },
      ],
    };
  });

  const ambientStyle = useAnimatedStyle(() => {
    if (staticHeader) return { opacity: 0.95 };
    const offset = headerCollapse.value;
    return {
      opacity: interpolate(offset, [0, HEADER_COLLAPSE_RANGE * 0.67], [0.95, 0.5]),
    };
  });

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.background.val }}
      edges={["top", "bottom"]}
    >
      <YStack flex={1} backgroundColor="$background">
        <LinearGradient
          colors={[
            withAlpha(theme.surfaceElevated.val, "A8"),
            withAlpha(theme.surfaceAccent.val, "30"),
            theme.background.val,
          ]}
          start={{ x: 0.04, y: 0 }}
          end={{ x: 0.88, y: 0.62 }}
          style={StyleSheet.absoluteFill}
        />

        <Animated.View
          pointerEvents="none"
          style={[
            styles.ambientBand,
            {
              top: headerTop + HEADER_HEIGHT + 14,
              backgroundColor: withAlpha(theme.borderStrong.val, "18"),
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

        <LinearGradient
          pointerEvents="none"
          colors={[
            theme.background.val,
            withAlpha(theme.background.val, "F2"),
            withAlpha(theme.background.val, "B8"),
            withAlpha(theme.background.val, "00"),
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.topFade}
        />

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
          <Animated.View
            style={[
              styles.nativeHeaderWrap,
              isLargeScreen ? styles.nativeHeaderWrapLarge : null,
              headerCapsuleStyle,
            ]}
          >
            <XStack alignItems="center" gap={12} height={HEADER_HEIGHT}>
              <PressableScale onPress={handleBackPress} hitSlop={10}>
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
                  color="$colorMuted"
                  fontFamily="$body"
                  fontWeight="700"
                  fontSize={10}
                  lineHeight={12}
                  textTransform="uppercase"
                  letterSpacing={0.8}
                >
                  More
                </Text>
                <Text
                  color="$color"
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
            </XStack>
          </Animated.View>
        </Animated.View>
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
  topFade: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: 88,
    zIndex: 998,
    elevation: 998,
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
  nativeHeaderWrap: {
    position: "absolute",
    left: 16,
    right: 16,
    top: 0,
    height: HEADER_HEIGHT,
    justifyContent: "center",
  },
  nativeHeaderWrapLarge: {
    alignSelf: "center",
    left: undefined,
    right: undefined,
    width: "100%",
    maxWidth: 1040,
    paddingHorizontal: 16,
  },
});
