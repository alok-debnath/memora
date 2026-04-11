import React, { useCallback, useState } from "react";
import { Platform, Pressable, StyleSheet, useWindowDimensions } from "react-native";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
  type SharedValue,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, XStack, YStack } from "tamagui";

import { useAppTheme } from "@/hooks/useAppTheme";
import { useThemeStore } from "@/store/theme";
import { useAuth } from "@/hooks/useAuth";
import { FontFamily } from "@/constants/fonts";
import { brandGradients, integrationAccentColors, statAccentColors, statusAccentColors } from "@/constants/colors";
import { withAlpha } from "@/components/ui/themeHelpers";

interface OnboardingStep {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  description: string;
  color: string;
  label: string;
}

const steps: OnboardingStep[] = [
  {
    icon: "mic",
    title: "Capture in your own voice",
    description:
      "Record thoughts, ideas, and moments naturally. Memora turns them into structured notes without making you type everything out.",
    color: brandGradients.ember[1],
    label: "Voice-first",
  },
  {
    icon: "cpu",
    title: "Let AI enrich the memory",
    description:
      "People, places, moods, and actions are extracted automatically so each note becomes easier to revisit later.",
    color: statAccentColors.memories,
    label: "Auto-enriched",
  },
  {
    icon: "search",
    title: "Find meaning, not keywords",
    description:
      "Search with natural language and get the memory you actually meant instead of hunting through folders and tags.",
    color: statusAccentColors.success,
    label: "Semantic search",
  },
  {
    icon: "edit-3",
    title: "Shape it through conversation",
    description:
      "Ask Memora to draft, update, review, or analyze your memories. It behaves more like a companion than a form.",
    color: statusAccentColors.warning,
    label: "Conversational",
  },
  {
    icon: "lock",
    title: "Your memories stay yours",
    description:
      "All data is encrypted and private by default. Memora never shares, sells, or trains on your personal memories. You own everything.",
    color: integrationAccentColors.reasoning,
    label: "Private & secure",
  },
];

const ARCH_SLOTS = [
  { x: 0, y: 0, rotate: 0, scale: 1 },
  { x: -22, y: 16, rotate: -5, scale: 0.94 },
  { x: -8, y: 9, rotate: -2.25, scale: 0.9 },
  { x: 8, y: 9, rotate: 2.25, scale: 0.9 },
  { x: 22, y: 16, rotate: 5, scale: 0.94 },
] as const;
const MAX_VISIBLE_BEHIND = 4;
const SWIPE_THRESHOLD = 60;
const TIMING_CONFIG = { duration: 280, easing: Easing.out(Easing.cubic) };

function CardContent({
  item,
  index,
  isDark,
}: {
  item: OnboardingStep;
  index: number;
  isDark: boolean;
}) {
  const theme = useAppTheme();
  const cardBg = theme.surface.val;
  const cardBorder = withAlpha(theme.borderStrong.val, isDark ? "99" : "B3");

  return (
    <YStack
      borderRadius={28}
      padding={24}
      backgroundColor={cardBg}
      borderWidth={1}
      borderColor={cardBorder}
    >
      <XStack justifyContent="space-between" alignItems="center" marginBottom={24}>
        <YStack
          paddingHorizontal={12}
          paddingVertical={6}
          borderRadius={999}
          backgroundColor={item.color + "18"}
          borderWidth={1}
          borderColor={item.color + "28"}
        >
          <Text fontSize={12} fontFamily={FontFamily.medium} color={item.color}>
            {item.label}
          </Text>
        </YStack>
        <Text fontSize={12} fontFamily={FontFamily.medium} color="$colorMuted">
          {String(index + 1).padStart(2, "0")} / {String(steps.length).padStart(2, "0")}
        </Text>
      </XStack>

      <XStack marginBottom={24} justifyContent="center">
        <YStack
          width={96}
          height={96}
          borderRadius={32}
          alignItems="center"
          justifyContent="center"
          backgroundColor={item.color + "14"}
        >
          <Feather name={item.icon} size={38} color={item.color} />
        </YStack>
      </XStack>

      <Text
        fontSize={26}
        lineHeight={32}
        fontFamily="$heading"
        fontWeight="800"
        textAlign="center"
        color="$color"
      >
        {item.title}
      </Text>
      <Text
        fontSize={15}
        lineHeight={23}
        textAlign="center"
        color="$colorMuted"
        marginTop={12}
      >
        {item.description}
      </Text>
    </YStack>
  );
}

/**
 * Every card is rendered once with a stable key. Position is driven entirely
 * by shared values so there is zero React re-render on swipe.
 */
function FanCard({
  stepIndex,
  activeIndex,
  dragX,
  swipeOrigin,
  swipeDirection,
  screenWidth,
  isDark,
}: {
  stepIndex: number;
  activeIndex: SharedValue<number>;
  dragX: SharedValue<number>;
  swipeOrigin: SharedValue<number>;
  swipeDirection: SharedValue<-1 | 0 | 1>;
  screenWidth: number;
  isDark: boolean;
}) {
  const step = steps[stepIndex];

  const animStyle = useAnimatedStyle(() => {
    const depth = stepIndex - activeIndex.value;
    const currentIndex = Math.round(activeIndex.value);
    const direction = swipeDirection.value;
    const isOutgoing = direction !== 0 && stepIndex === swipeOrigin.value;

    const getSlotTransform = (slotProgress: number) => {
      "worklet";
      const lowerSlot = Math.floor(slotProgress);
      const upperSlot = Math.min(Math.ceil(slotProgress), MAX_VISIBLE_BEHIND);
      const progress = slotProgress - lowerSlot;
      const from = ARCH_SLOTS[Math.min(lowerSlot, MAX_VISIBLE_BEHIND)];
      const to = ARCH_SLOTS[upperSlot];

      return {
        translateX: interpolate(progress, [0, 1], [from.x, to.x]),
        translateY: interpolate(progress, [0, 1], [from.y, to.y]),
        rotate: interpolate(progress, [0, 1], [from.rotate, to.rotate]),
        scale: interpolate(progress, [0, 1], [from.scale, to.scale]),
      };
    };

    if (isOutgoing) {
      return {
        opacity: 1,
        zIndex: 20,
        transform: [
          { translateX: dragX.value },
          {
            rotate: `${interpolate(
              dragX.value,
              [-screenWidth, 0, screenWidth],
              [-15, 0, 15],
            )}deg`,
          },
        ],
      };
    }

    // Already dismissed — park off-screen
    if (depth < -1) {
      return {
        opacity: 0,
        zIndex: -100,
        transform: [{ translateX: -screenWidth * 2 }],
      };
    }

    // Too deep — hide
    if (depth > MAX_VISIBLE_BEHIND) {
      return {
        opacity: 0,
        zIndex: -100,
        transform: [{ translateY: 0 }],
      };
    }

    if (depth === 0) {
      return {
        opacity: 1,
        zIndex: 10,
        transform: [
          { translateX: dragX.value },
          {
            rotate: `${interpolate(
              dragX.value,
              [-screenWidth, 0, screenWidth],
              [-15, 0, 15],
            )}deg`,
          },
        ],
      };
    }

    if (depth > 0) {
      const isImmediateNext = stepIndex === currentIndex + 1 && dragX.value < 0 && direction === 0;
      const slotProgress = isImmediateNext
        ? 1 - Math.min(Math.abs(dragX.value) / (screenWidth * 0.75), 1)
        : depth;
      const { translateX, translateY, rotate, scale } = getSlotTransform(slotProgress);

      return {
        opacity: 1,
        zIndex: -depth,
        transform: [
          { translateX },
          { translateY },
          { rotate: `${rotate}deg` },
          { scale },
        ],
      };
    }

    const canRevealPrevious = stepIndex === currentIndex - 1;
    if (!canRevealPrevious) {
      return {
        opacity: 0,
        zIndex: -100,
        transform: [{ translateX: -screenWidth * 2 }],
      };
    }

    const revealProgress = direction === 1
      ? 1 + depth
      : direction === 0 && dragX.value > 0
        ? Math.min(dragX.value / (screenWidth * 0.75), 1)
        : 0;
    const previousSlotProgress = 1 - revealProgress;
    const { translateX, translateY, rotate, scale } = getSlotTransform(previousSlotProgress);

    return {
      opacity: revealProgress > 0 ? 1 : 0,
      zIndex: 0,
      transform: [
        { translateX },
        { translateY },
        { rotate: `${rotate}deg` },
        { scale },
      ],
    };
  });

  return (
    <Animated.View style={[s.cardAbsolute, animStyle]}>
      <CardContent item={step} index={stepIndex} isDark={isDark} />
    </Animated.View>
  );
}

function CardStack({
  activeIndex,
  dragX,
  swipeOrigin,
  swipeDirection,
  isDark,
}: {
  activeIndex: SharedValue<number>;
  dragX: SharedValue<number>;
  swipeOrigin: SharedValue<number>;
  swipeDirection: SharedValue<-1 | 0 | 1>;
  isDark: boolean;
}) {
  const { width } = useWindowDimensions();

  return (
    <Animated.View style={s.stackContainer}>
      {/* Render every card once — position driven by shared values */}
      {steps.map((_, i) => (
        <FanCard
          key={i}
          stepIndex={i}
          activeIndex={activeIndex}
          dragX={dragX}
          swipeOrigin={swipeOrigin}
          swipeDirection={swipeDirection}
          screenWidth={width}
          isDark={isDark}
        />
      ))}
    </Animated.View>
  );
}

export function OnboardingScreen() {
  const theme = useAppTheme();
  const { width } = useWindowDimensions();
  const [currentIndex, setCurrentIndex] = useState(0);
  const { setOnboardingSeen } = useAuth();
  const resolvedMode = useThemeStore((state) => state.resolvedMode);
  const isDark = resolvedMode === "dark";

  // Single shared value drives all card positions — no React re-render needed
  const activeIndex = useSharedValue(0);
  const dragX = useSharedValue(0);
  const swipeOrigin = useSharedValue(0);
  const swipeDirection = useSharedValue<-1 | 0 | 1>(0);

  useAnimatedReaction(
    () => Math.round(activeIndex.value),
    (next, prev) => {
      if (next === prev) return;
      runOnJS(setCurrentIndex)(next);
      if (Platform.OS !== "web") {
        runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
      }
    },
    [activeIndex],
  );

  const animateToIndex = useCallback((nextIndex: number, direction: -1 | 1) => {
    swipeOrigin.value = Math.round(activeIndex.value);
    swipeDirection.value = direction;
    activeIndex.value = withTiming(nextIndex, TIMING_CONFIG, (finished) => {
      if (!finished) return;
      dragX.value = 0;
      swipeOrigin.value = nextIndex;
      swipeDirection.value = 0;
    });
  }, [activeIndex, dragX, swipeDirection, swipeOrigin]);

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationX > 0 && activeIndex.value === 0) {
        dragX.value = e.translationX * 0.2;
        return;
      }
      if (e.translationX < 0 && activeIndex.value === steps.length - 1) {
        dragX.value = e.translationX * 0.2;
        return;
      }
      dragX.value = e.translationX;
    })
    .onEnd((e) => {
      if (e.translationX < -SWIPE_THRESHOLD && activeIndex.value < steps.length - 1) {
        dragX.value = withTiming(-width * 1.2, TIMING_CONFIG, (finished) => {
          if (!finished) return;
          const next = Math.round(activeIndex.value) + 1;
          runOnJS(animateToIndex)(next, -1);
        });
      } else if (e.translationX > SWIPE_THRESHOLD && activeIndex.value > 0) {
        dragX.value = withTiming(width * 1.2, TIMING_CONFIG, (finished) => {
          if (!finished) return;
          const prev = Math.round(activeIndex.value) - 1;
          runOnJS(animateToIndex)(prev, 1);
        });
      } else {
        dragX.value = withTiming(0, { duration: 200 });
      }
    });

  const handleNext = () => {
    if (currentIndex < steps.length - 1) {
      dragX.value = withTiming(-width * 1.2, TIMING_CONFIG, (finished) => {
        if (!finished) return;
        const next = Math.round(activeIndex.value) + 1;
        runOnJS(animateToIndex)(next, -1);
      });
      return;
    }
    setOnboardingSeen();
    router.replace("/(public)/(auth)/login");
  };

  const handleSkip = () => {
    setOnboardingSeen();
    router.replace("/(public)/(auth)/login");
  };

  const accentGlow = withAlpha(theme.primary.val, isDark ? "0F" : "1A");

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background.val }} edges={["top", "bottom"]}>
      <YStack flex={1} backgroundColor="$background">
        <LinearGradient
          colors={
            isDark
              ? ([accentGlow, theme.background.val] as const)
              : ([withAlpha(theme.surfaceAccent.val, "CC"), theme.background.val] as const)
          }
          start={{ x: 0.3, y: 0 }}
          end={{ x: 0.7, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />

        <XStack
          justifyContent="space-between"
          alignItems="center"
          paddingTop={14}
          paddingHorizontal={24}
          marginBottom={8}
        >
          <YStack>
            <Text fontSize={12} letterSpacing={2} color="$colorMuted">
              MEMORA
            </Text>
            <Text fontSize={13} color="$colorMuted">
              A calmer way to remember your life
            </Text>
          </YStack>
          {currentIndex < steps.length - 1 ? (
            <Pressable onPress={handleSkip} hitSlop={12}>
              <Text fontSize={15} fontFamily={FontFamily.medium} color="$colorMuted">
                Skip
              </Text>
            </Pressable>
          ) : (
            <YStack width={40} />
          )}
        </XStack>

        <GestureDetector gesture={pan}>
          <CardStack
            activeIndex={activeIndex}
            dragX={dragX}
            swipeOrigin={swipeOrigin}
            swipeDirection={swipeDirection}
            isDark={isDark}
          />
        </GestureDetector>

        <YStack paddingHorizontal={24} paddingBottom={20} paddingTop={10} gap={18}>
          <XStack gap={8} alignItems="center" justifyContent="center">
            {steps.map((step, i) => (
              <XStack
                key={step.title}
                height={6}
                borderRadius={999}
                width={i === currentIndex ? 24 : 6}
                backgroundColor={i === currentIndex ? "$primary" : "$borderColor"}
              />
            ))}
          </XStack>

          <Pressable onPress={handleNext}>
            <LinearGradient
              colors={brandGradients.ember}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={s.cta}
            >
              <Text color="$textInverse" fontSize={16} fontFamily={FontFamily.semiBold}>
                {currentIndex === steps.length - 1 ? "Get Started" : "Next"}
              </Text>
              <Feather
                name={currentIndex === steps.length - 1 ? "check" : "arrow-right"}
                size={18}
                color={theme.textInverse.val}
              />
            </LinearGradient>
          </Pressable>

          <Text fontSize={12} lineHeight={18} color="$colorMuted" textAlign="center">
            Your workspace is private and can be explored at your own pace.
          </Text>
        </YStack>
      </YStack>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  stackContainer: {
    flex: 1,
    justifyContent: "center",
  },
  cardAbsolute: {
    position: "absolute",
    left: 36,
    right: 36,
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 28,
    gap: 8,
    minWidth: 200,
    alignSelf: "center",
  },
});
