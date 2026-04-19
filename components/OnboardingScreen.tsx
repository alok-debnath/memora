import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  type ListRenderItemInfo,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  runOnJS,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, XStack, YStack } from "tamagui";

import { AppButton } from "@/components/ui/AppButton";
import { withAlpha } from "@/components/ui/themeHelpers";
import {
  brandGradients,
  integrationAccentColors,
  onboardingBackdropColors,
  statAccentColors,
} from "@/constants/colors";
import { FontFamily } from "@/constants/fonts";
import { useAuth } from "@/hooks/useAuth";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useIsLargeScreen } from "@/hooks/useIsLargeScreen";
import { useThemeStore } from "@/store/theme";

type IntroSlide = {
  id: string;
  kicker: string;
  title: string;
  body: string;
  icon: keyof typeof Feather.glyphMap;
  accent: string;
  bg: string;
};

const SLIDES: IntroSlide[] = [
  {
    id: "capture",
    kicker: "Capture quickly",
    title: "Save moments in seconds",
    body: "Speak or type and keep moving. Memora turns quick thoughts into clean entries you can return to.",
    icon: "mic",
    accent: brandGradients.ember[1],
    bg: onboardingBackdropColors.capture,
  },
  {
    id: "organize",
    kicker: "Auto organized",
    title: "AI adds context instantly",
    body: "People, places, moods, and actions are extracted automatically so each memory stays structured.",
    icon: "cpu",
    accent: statAccentColors.memories,
    bg: onboardingBackdropColors.organize,
  },
  {
    id: "recall",
    kicker: "Recall faster",
    title: "Find what you meant",
    body: "Use natural language to jump to the right memory instead of searching folder by folder.",
    icon: "search",
    accent: brandGradients.golden[0],
    bg: onboardingBackdropColors.recall,
  },
  {
    id: "private",
    kicker: "Privacy first",
    title: "Private by default",
    body: "Your data is used to run Memora, not sold as advertising data. See our Privacy Policy for details.",
    icon: "lock",
    accent: integrationAccentColors.reasoning,
    bg: onboardingBackdropColors.private,
  },
];

const TOP_GLOW_COLORS = SLIDES.map((slide) => withAlpha(slide.accent, "78"));
const BOTTOM_GLOW_COLORS = SLIDES.map((slide) => withAlpha(slide.accent, "4D"));

function SlideCard({
  item,
  index,
  width,
  scrollX,
  floatTick,
}: {
  item: IntroSlide;
  index: number;
  width: number;
  scrollX: SharedValue<number>;
  floatTick: SharedValue<number>;
}) {
  const theme = useAppTheme();

  const textStyle = useAnimatedStyle(() => {
    const input = [(index - 1) * width, index * width, (index + 1) * width];
    return {
      opacity: interpolate(scrollX.value, input, [0.2, 1, 0.2], Extrapolation.CLAMP),
      transform: [
        {
          translateY: interpolate(scrollX.value, input, [18, 0, 18], Extrapolation.CLAMP),
        },
      ],
    };
  });

  const visualStyle = useAnimatedStyle(() => {
    const input = [(index - 1) * width, index * width, (index + 1) * width];
    return {
      transform: [
        {
          translateX: interpolate(scrollX.value, input, [-28, 0, 28], Extrapolation.CLAMP),
        },
        {
          scale: interpolate(scrollX.value, input, [0.86, 1, 0.86], Extrapolation.CLAMP),
        },
      ],
      opacity: interpolate(scrollX.value, input, [0.3, 1, 0.3], Extrapolation.CLAMP),
    };
  });

  const iconOrbStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(floatTick.value, [0, 1], [8, -8]),
      },
      {
        rotate: `${interpolate(floatTick.value, [0, 1], [-5, 5])}deg`,
      },
    ],
  }));

  return (
    <YStack width={width} paddingHorizontal={22} justifyContent="center" alignItems="center">
      <YStack width="100%" maxWidth={620} gap={22}>
        <Animated.View style={visualStyle} shouldRasterizeIOS renderToHardwareTextureAndroid>
          <YStack
            height={250}
            borderRadius={36}
            alignItems="center"
            justifyContent="center"
            overflow="hidden"
            borderWidth={1}
            borderColor={withAlpha(item.accent, "4D")}
            backgroundColor={withAlpha(theme.surfaceElevated.val, "E8")}
          >
            <LinearGradient
              colors={[
                withAlpha(item.accent, "46"),
                withAlpha(item.accent, "1C"),
                withAlpha(theme.surfaceElevated.val, "AA"),
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <YStack
              position="absolute"
              width={196}
              height={196}
              borderRadius={999}
              borderWidth={1}
              borderColor={withAlpha(item.accent, "2C")}
            />
            <YStack
              position="absolute"
              width={140}
              height={140}
              borderRadius={999}
              borderWidth={1}
              borderColor={withAlpha(item.accent, "56")}
            />

            <Animated.View style={iconOrbStyle}>
              <YStack
                width={98}
                height={98}
                borderRadius={26}
                alignItems="center"
                justifyContent="center"
                backgroundColor={withAlpha(item.accent, "2C")}
                borderWidth={1}
                borderColor={withAlpha(item.accent, "70")}
              >
                <Feather name={item.icon} size={40} color={item.accent} />
              </YStack>
            </Animated.View>
          </YStack>
        </Animated.View>

        <Animated.View style={textStyle} shouldRasterizeIOS renderToHardwareTextureAndroid>
          <YStack
            borderRadius={32}
            paddingHorizontal={24}
            paddingVertical={25}
            borderWidth={1}
            borderColor={withAlpha(theme.borderStrong.val, "A3")}
            backgroundColor={withAlpha(theme.surface.val, "F5")}
            gap={12}
          >
            <YStack
              alignSelf="flex-start"
              paddingHorizontal={12}
              paddingVertical={6}
              borderRadius={999}
              borderWidth={1}
              borderColor={withAlpha(item.accent, "46")}
              backgroundColor={withAlpha(item.accent, "1A")}
            >
              <Text fontSize={12} color={item.accent} fontFamily={FontFamily.semiBold}>
                {item.kicker}
              </Text>
            </YStack>
            <Text
              fontSize={36}
              lineHeight={40}
              color="$color"
              fontFamily="$heading"
              fontWeight="800"
            >
              {item.title}
            </Text>
            <Text fontSize={16} lineHeight={24} color="$colorMuted">
              {item.body}
            </Text>
          </YStack>
        </Animated.View>
      </YStack>
    </YStack>
  );
}

export function OnboardingScreen() {
  const theme = useAppTheme();
  const isLargeScreen = useIsLargeScreen();
  const resolvedMode = useThemeStore((state) => state.resolvedMode);
  const isDark = resolvedMode === "dark";
  const { width } = useWindowDimensions();
  const listRef = useRef<Animated.FlatList<IntroSlide>>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const { setOnboardingSeen } = useAuth();

  const scrollX = useSharedValue(0);
  const floatTick = useSharedValue(0);
  const progressTrackWidth = useSharedValue(1);

  useEffect(() => {
    floatTick.value = withRepeat(withTiming(1, { duration: 3600 }), -1, true);
  }, [floatTick]);

  useAnimatedReaction(
    () => Math.round(scrollX.value / Math.max(width, 1)),
    (next, prev) => {
      if (next === prev || next < 0 || next >= SLIDES.length) return;
      runOnJS(setCurrentIndex)(next);
      if (Platform.OS !== "web") {
        runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
      }
    },
    [width],
  );

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollX.value = event.contentOffset.x;
  });

  const completeOnboarding = useCallback(() => {
    setOnboardingSeen();
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    }
    router.replace("/(public)/(auth)/login");
  }, [setOnboardingSeen]);

  const handleNext = useCallback(() => {
    if (currentIndex >= SLIDES.length - 1) {
      completeOnboarding();
      return;
    }

    listRef.current?.scrollToOffset({
      offset: (currentIndex + 1) * width,
      animated: true,
    });
  }, [completeOnboarding, currentIndex, width]);

  const backgroundStyle = useAnimatedStyle(() => {
    const inputRange = SLIDES.map((_, i) => i * width);
    return {
      backgroundColor: interpolateColor(
        scrollX.value,
        inputRange,
        SLIDES.map((slide) => slide.bg),
      ),
    };
  });

  const topBlobStyle = useAnimatedStyle(() => {
    const input = SLIDES.map((_, i) => i * width);
    return {
      backgroundColor: interpolateColor(scrollX.value, input, TOP_GLOW_COLORS),
      transform: [
        {
          translateX:
            interpolate(scrollX.value, input, [0, -12, 16, 4], Extrapolation.CLAMP) +
            interpolate(floatTick.value, [0, 1], [-8, 8]),
        },
        {
          translateY: interpolate(floatTick.value, [0, 1], [10, -10]),
        },
        {
          scale: interpolate(floatTick.value, [0, 1], [0.96, 1.05]),
        },
      ],
    };
  });

  const bottomBlobStyle = useAnimatedStyle(() => {
    const input = SLIDES.map((_, i) => i * width);
    return {
      backgroundColor: interpolateColor(scrollX.value, input, BOTTOM_GLOW_COLORS),
      transform: [
        {
          translateX:
            interpolate(scrollX.value, input, [6, 18, -8, -14], Extrapolation.CLAMP) +
            interpolate(floatTick.value, [0, 1], [9, -9]),
        },
        {
          translateY: interpolate(floatTick.value, [0, 1], [-6, 8]),
        },
      ],
    };
  });

  const railFillStyle = useAnimatedStyle(() => {
    const max = Math.max((SLIDES.length - 1) * width, 1);
    const progress = interpolate(scrollX.value, [0, max], [0, 1], Extrapolation.CLAMP);
    return {
      transform: [
        {
          translateX: -progressTrackWidth.value * (1 - progress),
        },
      ],
    };
  });

  const renderSlide = useCallback(
    ({ item, index }: ListRenderItemInfo<IntroSlide>) => (
      <SlideCard item={item} index={index} width={width} scrollX={scrollX} floatTick={floatTick} />
    ),
    [floatTick, scrollX, width],
  );

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.background.val }}
      edges={["top", "bottom"]}
    >
      <YStack flex={1} backgroundColor="$background">
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFillObject, backgroundStyle]}
        />
        <LinearGradient
          pointerEvents="none"
          colors={
            isDark
              ? [withAlpha(theme.background.val, "00"), withAlpha(theme.background.val, "E0")]
              : [withAlpha(theme.background.val, "22"), withAlpha(theme.background.val, "D8")]
          }
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 0.95 }}
          style={StyleSheet.absoluteFill}
        />
        <Animated.View
          pointerEvents="none"
          style={[s.topGlow, topBlobStyle]}
          shouldRasterizeIOS
          renderToHardwareTextureAndroid
        />
        <Animated.View
          pointerEvents="none"
          style={[s.bottomGlow, bottomBlobStyle]}
          shouldRasterizeIOS
          renderToHardwareTextureAndroid
        />

        <XStack
          alignItems="center"
          justifyContent="space-between"
          paddingHorizontal={24}
          paddingTop={12}
          paddingBottom={6}
        >
          <YStack>
            <XStack alignItems="center" gap={8}>
              <YStack
                width={28}
                height={28}
                borderRadius={9}
                alignItems="center"
                justifyContent="center"
                borderWidth={1}
                borderColor={withAlpha(theme.textInverse.val, "55")}
                backgroundColor={withAlpha(theme.textInverse.val, "12")}
              >
                <Feather name="sunrise" size={14} color={theme.textInverse.val} />
              </YStack>
              <Text fontSize={12} letterSpacing={2} color="$textInverse">
                MEMORA
              </Text>
            </XStack>
            <Text fontSize={13} color={withAlpha(theme.textInverse.val, "BE")} marginTop={6}>
              Capture your life without friction
            </Text>
          </YStack>
          {currentIndex < SLIDES.length - 1 ? (
            <Pressable onPress={completeOnboarding} hitSlop={12}>
              <YStack
                borderWidth={1}
                borderColor={withAlpha(theme.textInverse.val, "47")}
                backgroundColor={withAlpha(theme.textInverse.val, "12")}
                borderRadius={999}
                paddingHorizontal={14}
                paddingVertical={8}
              >
                <Text color="$textInverse" fontFamily={FontFamily.medium} fontSize={14}>
                  Skip
                </Text>
              </YStack>
            </Pressable>
          ) : (
            <YStack width={60} />
          )}
        </XStack>

        <Animated.FlatList
          ref={listRef}
          data={SLIDES}
          horizontal
          pagingEnabled
          bounces={false}
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.id}
          renderItem={renderSlide}
          onScroll={onScroll}
          scrollEventThrottle={16}
          decelerationRate="fast"
          initialNumToRender={SLIDES.length}
          windowSize={SLIDES.length}
          maxToRenderPerBatch={SLIDES.length}
          removeClippedSubviews={false}
        />

        <YStack
          width="100%"
          alignSelf="center"
          maxWidth={isLargeScreen ? 620 : undefined}
          paddingHorizontal={24}
          paddingTop={8}
          paddingBottom={20}
          gap={16}
        >
          <YStack
            borderRadius={999}
            height={8}
            overflow="hidden"
            backgroundColor={withAlpha(theme.textInverse.val, "33")}
            borderWidth={1}
            borderColor={withAlpha(theme.textInverse.val, "38")}
            onLayout={(e) => {
              progressTrackWidth.value = e.nativeEvent.layout.width;
            }}
          >
            <Animated.View style={[s.railFill, railFillStyle]}>
              <LinearGradient
                colors={[
                  withAlpha(theme.textInverse.val, "F5"),
                  withAlpha(theme.textInverse.val, "AF"),
                ]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
          </YStack>

          <XStack alignItems="center" justifyContent="space-between">
            <Text
              color={withAlpha(theme.textInverse.val, "CC")}
              fontSize={12}
              fontFamily={FontFamily.medium}
            >
              {String(currentIndex + 1).padStart(2, "0")} / {String(SLIDES.length).padStart(2, "0")}
            </Text>
            <Text color={withAlpha(theme.textInverse.val, "CC")} fontSize={12}>
              Swipe to explore
            </Text>
          </XStack>

          <AppButton
            title={currentIndex === SLIDES.length - 1 ? "Get Started" : "Next"}
            onPress={handleNext}
            icon={currentIndex === SLIDES.length - 1 ? "check" : "arrow-right"}
            size="lg"
            variant="gradient"
            fullWidth
          />

          <Text textAlign="center" color={withAlpha(theme.textInverse.val, "C4")} fontSize={12}>
            Private by default. See Privacy Policy for details.
          </Text>
        </YStack>
      </YStack>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  railFill: {
    width: "100%",
    height: "100%",
    borderRadius: 999,
  },
  topGlow: {
    position: "absolute",
    width: 340,
    height: 340,
    borderRadius: 340,
    top: -130,
    right: -110,
    backgroundColor: withAlpha(brandGradients.ember[2], "52"),
  },
  bottomGlow: {
    position: "absolute",
    width: 320,
    height: 320,
    borderRadius: 320,
    bottom: -120,
    left: -110,
    backgroundColor: withAlpha(integrationAccentColors.reasoning, "47"),
  },
});
