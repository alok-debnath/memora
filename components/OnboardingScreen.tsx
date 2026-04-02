import React, { useRef, useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  useWindowDimensions,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, XStack, YStack } from "tamagui";

import { useAppTheme } from "@/hooks/useAppTheme";
import { useAuth } from "@/hooks/useAuth";
import { FontFamily } from "@/constants/fonts";

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
    color: "#E8911B",
    label: "Voice-first",
  },
  {
    icon: "cpu",
    title: "Let AI enrich the memory",
    description:
      "People, places, moods, and actions are extracted automatically so each note becomes easier to revisit later.",
    color: "#3B82F6",
    label: "Auto-enriched",
  },
  {
    icon: "search",
    title: "Find meaning, not keywords",
    description:
      "Search with natural language and get the memory you actually meant instead of hunting through folders and tags.",
    color: "#10B981",
    label: "Semantic search",
  },
  {
    icon: "edit-3",
    title: "Shape it through conversation",
    description:
      "Ask Memora to draft, update, review, or analyze your memories. It behaves more like a companion than a form.",
    color: "#F59E0B",
    label: "Conversational",
  },
];

function OnboardingSlide({
  item,
  index,
  width,
}: {
  item: OnboardingStep;
  index: number;
  width: number;
}) {
  return (
    <YStack width={width} flex={1} paddingHorizontal={20} justifyContent="center">
      <Animated.View entering={FadeInUp.delay(120).duration(500)}>
        <YStack
          borderRadius={30}
          padding={22}
          backgroundColor="rgba(255,255,255,0.72)"
          borderWidth={1}
          borderColor="rgba(232,145,27,0.12)"
          shadowColor="#000"
          shadowOffset={{ width: 0, height: 16 }}
          shadowOpacity={0.12}
          shadowRadius={28}
          elevation={5}
        >
          <XStack justifyContent="space-between" alignItems="center" marginBottom={20}>
            <YStack
              paddingHorizontal={12}
              paddingVertical={7}
              borderRadius={999}
              backgroundColor={item.color + "18"}
              borderWidth={1}
              borderColor={item.color + "22"}
            >
              <Text fontSize={12} fontFamily={FontFamily.medium} color={item.color}>
                {item.label}
              </Text>
            </YStack>
            <Text fontSize={12} color="$colorMuted">
              {String(index + 1).padStart(2, "0")}
            </Text>
          </XStack>

          <XStack marginBottom={22} justifyContent="center">
            <YStack
              width={118}
              height={118}
              borderRadius={38}
              alignItems="center"
              justifyContent="center"
              backgroundColor={item.color + "15"}
            >
              <YStack
                width={86}
                height={86}
                borderRadius={28}
                alignItems="center"
                justifyContent="center"
                backgroundColor={item.color + "24"}
              >
                <Feather name={item.icon} size={40} color={item.color} />
              </YStack>
            </YStack>
          </XStack>

          <Text
            fontSize={28}
            lineHeight={34}
            fontFamily="$heading"
            fontWeight="800"
            textAlign="center"
            color="$color"
          >
            {item.title}
          </Text>
          <Text
            fontSize={16}
            lineHeight={24}
            textAlign="center"
            color="$colorMuted"
            marginTop={12}
          >
            {item.description}
          </Text>
        </YStack>
      </Animated.View>
    </YStack>
  );
}

export function OnboardingScreen() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList<OnboardingStep>>(null);
  const { setOnboardingSeen } = useAuth();

  const handleNext = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (currentIndex < steps.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
      setCurrentIndex(currentIndex + 1);
      return;
    }
    setOnboardingSeen();
    router.replace("/(public)/(auth)/login");
  };

  const handleSkip = () => {
    setOnboardingSeen();
    router.replace("/(public)/(auth)/login");
  };

  return (
    <YStack flex={1} backgroundColor="$background">
      <View pointerEvents="none" style={styles.glowOne} />
      <View pointerEvents="none" style={styles.glowTwo} />
      <LinearGradient
        colors={["rgba(255,247,230,0.92)", "rgba(255,252,247,0.82)", "rgba(255,255,255,0.96)"] as const}
        style={{ flex: 1 }}
      >
        <XStack
          justifyContent="space-between"
          alignItems="center"
          paddingTop={insets.top + 14}
          paddingHorizontal={20}
          marginBottom={8}
        >
          <YStack>
            <Text fontSize={12} letterSpacing={2} color="#8A7C67">
              MEMORA
            </Text>
            <Text fontSize={13} color="#6A655C">
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

        <FlatList
          ref={flatListRef}
          data={steps}
          renderItem={({ item, index }) => (
            <OnboardingSlide item={item} index={index} width={width} />
          )}
          keyExtractor={(_, i) => i.toString()}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          style={{ flex: 1 }}
          onMomentumScrollEnd={(e) => {
            const idx = Math.round(e.nativeEvent.contentOffset.x / width);
            setCurrentIndex(idx);
          }}
          getItemLayout={(_, index) => ({
            length: width,
            offset: width * index,
            index,
          })}
          initialNumToRender={1}
          windowSize={2}
          removeClippedSubviews
        />

        <YStack
          paddingHorizontal={20}
          paddingBottom={insets.bottom + 20}
          paddingTop={10}
          gap={18}
        >
          <XStack gap={8} alignItems="center" justifyContent="center">
            {steps.map((step, i) => (
              <XStack
                key={step.title}
                height={8}
                borderRadius={999}
                width={i === currentIndex ? 28 : 8}
                backgroundColor={i === currentIndex ? "$primary" : "$borderColor"}
              />
            ))}
          </XStack>

          <Pressable onPress={handleNext}>
            <LinearGradient
              colors={["#E8911B", "#D4710F", "#B96208"] as const}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cta}
            >
              <Text color="#FFFFFF" fontSize={16} fontFamily={FontFamily.semiBold}>
                {currentIndex === steps.length - 1 ? "Get Started" : "Next"}
              </Text>
              <Feather
                name={currentIndex === steps.length - 1 ? "check" : "arrow-right"}
                size={18}
                color="#FFFFFF"
              />
            </LinearGradient>
          </Pressable>

          <Text
            fontSize={12}
            lineHeight={18}
            color={theme.colorMuted.val}
            textAlign="center"
          >
            Your workspace is private and can be explored at your own pace.
          </Text>
        </YStack>
      </LinearGradient>
    </YStack>
  );
}

const styles = {
  glowOne: {
    position: "absolute" as const,
    width: 340,
    height: 340,
    borderRadius: 340,
    top: -100,
    right: -120,
    backgroundColor: "rgba(232,145,27,0.12)",
  },
  glowTwo: {
    position: "absolute" as const,
    width: 260,
    height: 260,
    borderRadius: 260,
    bottom: 100,
    left: -100,
    backgroundColor: "rgba(245,166,35,0.10)",
  },
  cta: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 28,
    gap: 8,
    minWidth: 200,
    alignSelf: "center" as const,
    shadowColor: "#E8911B",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.24,
    shadowRadius: 18,
    elevation: 5,
  },
};
