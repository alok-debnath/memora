import React, { useState, useRef } from "react";
import {
  Dimensions,
  FlatList,
  Pressable,
  Platform,
} from "react-native";
import { XStack, YStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInUp } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/hooks/useAuth";
import { FontFamily } from "@/constants/fonts";
import { router } from "expo-router";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface OnboardingStep {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  description: string;
  color: string;
}

const steps: OnboardingStep[] = [
  {
    icon: "mic",
    title: "Voice-First Capture",
    description:
      "Record your thoughts, ideas, and memories with just your voice. Memora transcribes and organizes everything automatically.",
    color: "#E8911B",
  },
  {
    icon: "cpu",
    title: "AI-Powered Intelligence",
    description:
      "Our AI extracts people, places, moods, and action items from your memories. Every note becomes rich, searchable data.",
    color: "#3B82F6",
  },
  {
    icon: "search",
    title: "Smart Semantic Search",
    description:
      "Find any memory by meaning, not just keywords. Ask natural questions and get relevant results instantly.",
    color: "#10B981",
  },
  {
    icon: "edit-3",
    title: "Conversational Editing",
    description:
      "Chat with your AI assistant to search, create, update, or analyze your memories. It's like having a personal knowledge manager.",
    color: "#8B5CF6",
  },
];

export function OnboardingScreen() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const { setOnboardingSeen } = useAuth();

  const handleNext = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (currentIndex < steps.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
      setCurrentIndex(currentIndex + 1);
    } else {
      setOnboardingSeen();
      router.replace("/(public)/(auth)/login");
    }
  };

  const handleSkip = () => {
    setOnboardingSeen();
    router.replace("/(public)/(auth)/login");
  };

  const renderItem = ({ item }: { item: OnboardingStep }) => (
    <YStack flex={1} alignItems="center" justifyContent="center" paddingHorizontal={40} width={SCREEN_WIDTH}>
      <Animated.View
        entering={FadeInUp.delay(200).duration(600)}
        style={{
          width: 140,
          height: 140,
          borderRadius: 70,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: item.color + "15",
          marginBottom: 40,
        }}
      >
        <XStack
          width={100}
          height={100}
          borderRadius={50}
          alignItems="center"
          justifyContent="center"
          backgroundColor={item.color + "25"}
        >
          <Feather name={item.icon} size={48} color={item.color} />
        </XStack>
      </Animated.View>
      <Animated.Text
        entering={FadeInUp.delay(400).duration(500)}
        style={{
          fontSize: 28,
          fontFamily: FontFamily.bold,
          textAlign: "center",
          marginBottom: 16,
          color: theme.color.val,
        }}
      >
        {item.title}
      </Animated.Text>
      <Animated.Text
        entering={FadeInUp.delay(500).duration(500)}
        style={{
          fontSize: 16,
          fontFamily: FontFamily.regular,
          textAlign: "center",
          lineHeight: 24,
          color: theme.colorMuted.val,
        }}
      >
        {item.description}
      </Animated.Text>
    </YStack>
  );

  return (
    <YStack flex={1} backgroundColor="$background">
      <XStack
        justifyContent="flex-end"
        paddingHorizontal={20}
        paddingTop={insets.top + 16}
      >
        {currentIndex < steps.length - 1 ? (
          <Pressable onPress={handleSkip} hitSlop={12}>
            <Text fontSize={15} fontFamily="$body" color="$colorMuted">
              Skip
            </Text>
          </Pressable>
        ) : (
          <YStack />
        )}
      </XStack>

      <FlatList
        ref={flatListRef}
        data={steps}
        renderItem={renderItem}
        keyExtractor={(_, i) => i.toString()}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
          setCurrentIndex(idx);
        }}
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
      />

      <YStack
        paddingHorizontal={20}
        paddingBottom={insets.bottom + 20}
        gap={24}
        alignItems="center"
      >
        <XStack gap={8} alignItems="center">
          {steps.map((_, i) => (
            <XStack
              key={i}
              height={8}
              borderRadius={4}
              backgroundColor={i === currentIndex ? "$primary" : "$borderColor"}
              width={i === currentIndex ? 24 : 8}
            />
          ))}
        </XStack>

        <Pressable onPress={handleNext}>
          <LinearGradient
            colors={["#E8911B", "#D4710F"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: 16,
              paddingHorizontal: 32,
              borderRadius: 28,
              gap: 8,
              minWidth: 200,
            }}
          >
            <Text color="white" fontSize={16} fontFamily="$body" fontWeight="600">
              {currentIndex === steps.length - 1 ? "Get Started" : "Next"}
            </Text>
            <Feather
              name={
                currentIndex === steps.length - 1 ? "check" : "arrow-right"
              }
              size={18}
              color="#FFFFFF"
            />
          </LinearGradient>
        </Pressable>
      </YStack>
    </YStack>
  );
}
