import React from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInUp } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, XStack, YStack } from "tamagui";

import { SurfaceCard } from "@/components/ui/SurfaceCard";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useIsLargeScreen } from "@/hooks/useIsLargeScreen";
import { withAlpha } from "@/components/ui/themeHelpers";

type AuthShellProps = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  accentIcon?: keyof typeof Feather.glyphMap;
};

export function AuthShell({
  title,
  subtitle,
  children,
  accentIcon = "zap",
}: AuthShellProps) {
  const theme = useAppTheme();
  const isLargeScreen = useIsLargeScreen();

  return (
    <YStack flex={1} backgroundColor="$background">
      <LinearGradient
        colors={[theme.surfaceAccent.val, theme.background.val, theme.background.val]}
        style={StyleSheet.absoluteFill}
      />
      <View
        pointerEvents="none"
        style={[styles.glowTop, { backgroundColor: withAlpha(theme.primary.val, "12") }]}
      />
      <View
        pointerEvents="none"
        style={[styles.glowBottom, { backgroundColor: withAlpha(theme.warning.val, "10") }]}
      />

      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background.val }} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : Platform.OS === "android" ? "height" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              flexGrow: 1,
              paddingTop: 16,
              paddingBottom: 20,
              paddingHorizontal: isLargeScreen ? 24 : 18,
            }}
          >
            <YStack flex={1} justifyContent="center">
              <Animated.View entering={FadeInUp.duration(320)}>
                <SurfaceCard
                  tone="elevated"
                  padding={0}
                  style={{
                    width: "100%",
                    maxWidth: isLargeScreen ? 480 : undefined,
                    alignSelf: "center",
                    overflow: "hidden",
                  }}
                >
                  <LinearGradient
                    colors={[
                      theme.surfaceAccent.val,
                      theme.surfaceElevated.val,
                      theme.surface.val,
                    ]}
                    style={{ padding: isLargeScreen ? 26 : 20 }}
                  >
                    <YStack gap={18}>
                      <XStack alignItems="center" gap={10}>
                        <YStack
                          width={46}
                          height={46}
                          borderRadius={16}
                          alignItems="center"
                          justifyContent="center"
                          backgroundColor={withAlpha(theme.primary.val, "16")}
                          borderWidth={1}
                          borderColor={withAlpha(theme.primary.val, "28")}
                        >
                          <Feather name={accentIcon} size={21} color={theme.primary.val} />
                        </YStack>
                        <YStack gap={2}>
                          <Text fontSize={11} letterSpacing={1.8} color="$primary" fontWeight="700">
                            MEMORA
                          </Text>
                          <Text fontSize={12} color="$colorMuted">
                            Warm memory studio
                          </Text>
                        </YStack>
                      </XStack>

                      <YStack gap={8}>
                        <Text
                          fontSize={isLargeScreen ? 36 : 31}
                          lineHeight={isLargeScreen ? 40 : 35}
                          fontFamily="$heading"
                          fontWeight="800"
                          color="$color"
                        >
                          {title}
                        </Text>
                        {subtitle ? (
                          <Text fontSize={15} lineHeight={22} color="$colorMuted">
                            {subtitle}
                          </Text>
                        ) : null}
                      </YStack>

                      {children}
                    </YStack>
                  </LinearGradient>
                </SurfaceCard>
              </Animated.View>
            </YStack>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </YStack>
  );
}

const styles = StyleSheet.create({
  glowTop: {
    position: "absolute",
    width: 360,
    height: 360,
    borderRadius: 360,
    top: -130,
    right: -140,
  },
  glowBottom: {
    position: "absolute",
    width: 280,
    height: 280,
    borderRadius: 280,
    bottom: -110,
    left: -100,
  },
});
