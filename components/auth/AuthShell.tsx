import React from "react";
import { ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { YStack, XStack, Text } from "tamagui";
import { useIsLargeScreen } from "@/hooks/useIsLargeScreen";

type AuthShellProps = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  accentIcon?: keyof typeof Feather.glyphMap;
};

const features = [
  { icon: "mic", title: "Voice capture", description: "Speak naturally and turn moments into structured memories." },
  { icon: "search", title: "Semantic recall", description: "Search by meaning with vector-backed memory retrieval." },
  { icon: "sparkles", title: "AI memory graph", description: "Enrichment, nudges, actions, and contextual connections." },
];

export function AuthShell({ title, subtitle, children, accentIcon = "zap" }: AuthShellProps) {
  const insets = useSafeAreaInsets();
  const isLargeScreen = useIsLargeScreen();

  if (isLargeScreen) {
    return (
      <XStack flex={1} backgroundColor="$background">
        <LinearGradient colors={["#FFF4DF", "#F6E7C8", "#F9F8F6"]} style={{ flex: 1.08, padding: 40, justifyContent: "center" }}>
          <Animated.View entering={FadeInUp.duration(450)} style={{ maxWidth: 520, alignSelf: "center" }}>
            <LinearGradient colors={["#E8911B", "#D4710F"]} style={{ width: 64, height: 64, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
              <Feather name={accentIcon} size={28} color="#FFFFFF" />
            </LinearGradient>
            <Text fontSize={42} lineHeight={46} fontFamily="$heading" fontWeight="700" color="#101218" marginBottom={14}>
              Memora
            </Text>
            <Text fontSize={18} lineHeight={28} fontFamily="$body" color="#4B5563" marginBottom={28}>
              Capture, enrich, search, and revisit your life with AI.
            </Text>
            <YStack gap={16}>
              {features.map((feature) => (
                <XStack key={feature.title} gap={14} alignItems="flex-start" backgroundColor="rgba(255,255,255,0.75)" borderRadius={20} padding={16}>
                  <YStack width={40} height={40} borderRadius={12} alignItems="center" justifyContent="center" backgroundColor="rgba(232,145,27,0.12)">
                    <Feather name={feature.icon as keyof typeof Feather.glyphMap} size={18} color="#8B5A0F" />
                  </YStack>
                  <YStack flex={1}>
                    <Text fontSize={15} fontFamily="$body" fontWeight="600" color="#101218" marginBottom={2}>
                      {feature.title}
                    </Text>
                    <Text fontSize={13} lineHeight={19} fontFamily="$body" color="#6B7280">
                      {feature.description}
                    </Text>
                  </YStack>
                </XStack>
              ))}
            </YStack>
          </Animated.View>
        </LinearGradient>
        <KeyboardAvoidingView style={{ flex: 0.92 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 36 }} keyboardShouldPersistTaps="handled">
            <Animated.View entering={FadeInUp.delay(120).duration(420)} style={{ maxWidth: 460, width: "100%", alignSelf: "center" }}>
              <Text fontSize={30} lineHeight={34} fontFamily="$heading" fontWeight="700" color="$color" textAlign="center" marginBottom={8}>
                {title}
              </Text>
              <Text fontSize={15} lineHeight={22} fontFamily="$body" color="$colorMuted" textAlign="center" marginBottom={22}>
                {subtitle}
              </Text>
              {children}
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </XStack>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <YStack flex={1} backgroundColor="$background">
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingBottom: 40, paddingTop: insets.top + 28 }}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View entering={FadeInUp.duration(450)} style={{ alignItems: "center", marginBottom: 34 }}>
            <LinearGradient colors={["#E8911B", "#D4710F"]} style={{ width: 64, height: 64, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
              <Feather name={accentIcon} size={28} color="#FFFFFF" />
            </LinearGradient>
            <Text fontSize={30} lineHeight={34} fontFamily="$heading" fontWeight="700" color="$color" textAlign="center" marginBottom={8}>
              {title}
            </Text>
            <Text fontSize={15} lineHeight={22} fontFamily="$body" color="$colorMuted" textAlign="center" marginBottom={22}>
              {subtitle}
            </Text>
          </Animated.View>
          {children}
        </ScrollView>
      </YStack>
    </KeyboardAvoidingView>
  );
}
