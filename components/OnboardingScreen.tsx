import React, { useCallback, useRef, useState } from "react";
import { Platform, useWindowDimensions, type ListRenderItemInfo } from "react-native";
import { Feather, type FeatherIconName } from "@/lib/icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Animated, {
  Extrapolation,
  FadeIn,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, XStack, YStack } from "tamagui";

import { AppButton } from "@/components/ui/AppButton";
import { PressableScale } from "@/components/ui/PressableScale";
import { SurfaceCard } from "@/components/ui/SurfaceCard";
import { withAlpha } from "@/components/ui/themeHelpers";
import { spacing, radius } from "@/constants/uiTokens";
import { useAuth } from "@/hooks/useAuth";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";

type IntroSlide = {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  icon: FeatherIconName;
  previewTitle: string;
  previewSubtitle: string;
  details: Array<{
    icon: FeatherIconName;
    label: string;
  }>;
};

const SLIDES: IntroSlide[] = [
  {
    id: "capture",
    eyebrow: "Capture",
    title: "Save notes, voice, files, and reminders from one place.",
    body: "Use quick capture or chat naturally. Memora turns the input into a memory you can edit later.",
    icon: "plus",
    previewTitle: "Quick capture",
    previewSubtitle: "Memory, reminder, or chat",
    details: [
      { icon: "type", label: "Text and voice entries" },
      { icon: "message-circle", label: "AI chat commands" },
      { icon: "paperclip", label: "Drive files when connected" },
    ],
  },
  {
    id: "organize",
    eyebrow: "Structure",
    title: "Let the app keep the useful context around each memory.",
    body: "AI can extract topics, people, places, links, and action items so entries stay useful after capture.",
    icon: "layers",
    previewTitle: "Auto context",
    previewSubtitle: "Generated from each entry",
    details: [
      { icon: "tag", label: "Topics and tags" },
      { icon: "users", label: "People and places" },
      { icon: "check-circle", label: "Actions and links" },
    ],
  },
  {
    id: "recall",
    eyebrow: "Recall",
    title: "Search by meaning, timeline, topic, or connection.",
    body: "Find memories with natural language, browse the timeline, or explore related topics in the graph.",
    icon: "search",
    previewTitle: "Find anything",
    previewSubtitle: "Search and explore",
    details: [
      { icon: "search", label: "Semantic and deep search" },
      { icon: "clock", label: "Timeline and topics" },
      { icon: "share-2", label: "Knowledge graph" },
    ],
  },
  {
    id: "follow-through",
    eyebrow: "Follow through",
    title: "Turn memories into reminders, reviews, and shared moments.",
    body: "Schedule follow-ups, review important memories with spaced repetition, and share a memory when needed.",
    icon: "bell",
    previewTitle: "Next actions",
    previewSubtitle: "Due dates, review, sharing",
    details: [
      { icon: "bell", label: "Reminders and recurring dates" },
      { icon: "calendar", label: "Calendar sync when connected" },
      { icon: "refresh-cw", label: "Spaced review queue" },
      { icon: "share-2", label: "Share links" },
    ],
  },
];

function BrandHeader({ onSkip, showSkip }: { onSkip: () => void; showSkip: boolean }) {
  const theme = useAppTheme();

  return (
    <XStack alignItems="center" justifyContent="space-between" gap={spacing.md}>
      <XStack alignItems="center" gap={10}>
        <YStack
          width={38}
          height={38}
          borderRadius={radius.sm}
          alignItems="center"
          justifyContent="center"
          backgroundColor={theme.surfaceAccent.val}
          borderWidth={1}
          borderColor={withAlpha(theme.primary.val, "24")}
        >
          <Feather name="archive" size={17} color={theme.primary.val} />
        </YStack>
        <YStack gap={1}>
          <Text color={theme.color.val} fontFamily="$heading" fontSize={18} fontWeight="800">
            Memora
          </Text>
          <Text color={theme.colorMuted.val} fontSize={12}>
            Private memory workspace
          </Text>
        </YStack>
      </XStack>

      {showSkip ? (
        <PressableScale onPress={onSkip} hitSlop={10}>
          <Text color={theme.colorMuted.val} fontSize={14} fontWeight="700">
            Skip
          </Text>
        </PressableScale>
      ) : (
        <YStack width={36} />
      )}
    </XStack>
  );
}

function FeaturePreview({ item }: { item: IntroSlide }) {
  const theme = useAppTheme();

  return (
    <SurfaceCard tone="default" variant="solid" shadowed={false} radius={radius.lg} padding={0}>
      <YStack overflow="hidden" borderRadius={radius.lg}>
        <XStack
          alignItems="center"
          justifyContent="space-between"
          padding={spacing.lg}
          borderBottomWidth={1}
          borderColor={theme.borderColor.val}
        >
          <XStack alignItems="center" gap={spacing.sm}>
            <YStack
              width={36}
              height={36}
              borderRadius={radius.sm}
              alignItems="center"
              justifyContent="center"
              backgroundColor={theme.surfaceAccent.val}
            >
              <Feather name={item.icon} size={17} color={theme.primary.val} />
            </YStack>
            <YStack gap={2}>
              <Text color={theme.color.val} fontSize={14} fontWeight="700">
                {item.previewTitle}
              </Text>
              <Text color={theme.colorMuted.val} fontSize={12}>
                {item.previewSubtitle}
              </Text>
            </YStack>
          </XStack>
          <XStack alignItems="center" gap={5}>
            <Feather name="lock" size={12} color={theme.colorMuted.val} />
            <Text color={theme.colorMuted.val} fontSize={12} fontWeight="700">
              Private
            </Text>
          </XStack>
        </XStack>

        <YStack padding={spacing.lg} gap={spacing.sm}>
          {item.details.map((detail) => (
            <XStack
              key={detail.label}
              alignItems="center"
              gap={spacing.sm}
              paddingVertical={spacing.sm}
            >
              <Feather name={detail.icon} size={15} color={theme.primary.val} />
              <Text color={theme.color.val} fontSize={14} flex={1}>
                {detail.label}
              </Text>
              <YStack
                width={52}
                height={6}
                borderRadius={999}
                backgroundColor={theme.secondary.val}
              />
            </XStack>
          ))}
        </YStack>
      </YStack>
    </SurfaceCard>
  );
}

function SlideCard({
  item,
  index,
  width,
  scrollX,
}: {
  item: IntroSlide;
  index: number;
  width: number;
  scrollX: SharedValue<number>;
}) {
  const theme = useAppTheme();
  const { isExpanded: isLargeScreen } = useResponsiveLayout();

  const cardStyle = useAnimatedStyle(() => {
    const input = [(index - 1) * width, index * width, (index + 1) * width];
    return {
      opacity: interpolate(scrollX.value, input, [0.35, 1, 0.35], Extrapolation.CLAMP),
      transform: [
        {
          translateY: interpolate(scrollX.value, input, [14, 0, 14], Extrapolation.CLAMP),
        },
        {
          scale: interpolate(scrollX.value, input, [0.96, 1, 0.96], Extrapolation.CLAMP),
        },
      ],
    };
  });

  return (
    <YStack width={width} paddingHorizontal={spacing.lg} justifyContent="center">
      <Animated.View style={cardStyle}>
        <YStack
          width="100%"
          maxWidth={isLargeScreen ? 720 : 520}
          alignSelf="center"
          gap={spacing.lg}
        >
          <YStack gap={spacing.md}>
            <XStack alignItems="center" gap={7}>
              <Feather name={item.icon} size={13} color={theme.primary.val} />
              <Text
                color={theme.primary.val}
                fontSize={11}
                fontWeight="800"
                textTransform="uppercase"
                letterSpacing={0.9}
              >
                {item.eyebrow}
              </Text>
            </XStack>
            <Text
              color={theme.color.val}
              fontFamily="$heading"
              fontSize={isLargeScreen ? 42 : 33}
              lineHeight={isLargeScreen ? 47 : 38}
              fontWeight="800"
            >
              {item.title}
            </Text>
            <Text color={theme.colorMuted.val} fontSize={16} lineHeight={24}>
              {item.body}
            </Text>
          </YStack>

          <FeaturePreview item={item} />
        </YStack>
      </Animated.View>
    </YStack>
  );
}

function ProgressDots({ currentIndex }: { currentIndex: number }) {
  const theme = useAppTheme();

  return (
    <XStack alignItems="center" justifyContent="center" gap={spacing.sm}>
      {SLIDES.map((slide, index) => {
        const isActive = index === currentIndex;
        return (
          <YStack
            key={slide.id}
            width={isActive ? 24 : 7}
            height={7}
            borderRadius={999}
            backgroundColor={isActive ? theme.primary.val : withAlpha(theme.colorMuted.val, "42")}
          />
        );
      })}
    </XStack>
  );
}

export function OnboardingScreen() {
  const theme = useAppTheme();
  const { isExpanded: isLargeScreen } = useResponsiveLayout();
  const { width } = useWindowDimensions();
  const listRef = useRef<Animated.FlatList<IntroSlide>>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const { setOnboardingSeen } = useAuth();
  const scrollX = useSharedValue(0);

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

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollX.value = event.contentOffset.x;
  });

  const handleMomentumEnd = useCallback(
    (event: { nativeEvent: { contentOffset: { x: number } } }) => {
      const nextIndex = Math.round(event.nativeEvent.contentOffset.x / Math.max(width, 1));
      if (nextIndex === currentIndex || nextIndex < 0 || nextIndex >= SLIDES.length) {
        return;
      }
      setCurrentIndex(nextIndex);
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      }
    },
    [currentIndex, width],
  );

  const renderSlide = useCallback(
    ({ item, index }: ListRenderItemInfo<IntroSlide>) => (
      <SlideCard item={item} index={index} width={width} scrollX={scrollX} />
    ),
    [scrollX, width],
  );

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.background.val }}
      edges={["top", "bottom"]}
    >
      <YStack flex={1} backgroundColor={theme.background.val}>
        <Animated.View entering={FadeIn.duration(220)}>
          <YStack
            width="100%"
            maxWidth={isLargeScreen ? 900 : undefined}
            alignSelf="center"
            paddingHorizontal={spacing.lg}
            paddingTop={spacing.md}
            paddingBottom={spacing.sm}
          >
            <BrandHeader onSkip={completeOnboarding} showSkip={currentIndex < SLIDES.length - 1} />
          </YStack>
        </Animated.View>

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
          onMomentumScrollEnd={handleMomentumEnd}
          scrollEventThrottle={16}
          decelerationRate="fast"
          initialNumToRender={SLIDES.length}
          windowSize={SLIDES.length}
          maxToRenderPerBatch={SLIDES.length}
          removeClippedSubviews={false}
        />

        <YStack
          width="100%"
          maxWidth={isLargeScreen ? 520 : undefined}
          alignSelf="center"
          paddingHorizontal={spacing.lg}
          paddingTop={spacing.sm}
          paddingBottom={spacing.xl}
          gap={spacing.lg}
        >
          <ProgressDots currentIndex={currentIndex} />

          <AppButton
            title={currentIndex === SLIDES.length - 1 ? "Continue to sign in" : "Next"}
            onPress={handleNext}
            icon={currentIndex === SLIDES.length - 1 ? "log-in" : "arrow-right"}
            size="lg"
            variant="primary"
            fullWidth
          />
        </YStack>
      </YStack>
    </SafeAreaView>
  );
}
