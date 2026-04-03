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

import { useAppTheme } from "@/hooks/useAppTheme";
import { useIsLargeScreen } from "@/hooks/useIsLargeScreen";

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
        colors={[theme.accent.val + "14", theme.background.val, theme.background.val]}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={styles.glowTop} />
      <View pointerEvents="none" style={styles.glowBottom} />

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
                <YStack
                  width="100%"
                  maxWidth={isLargeScreen ? 470 : undefined}
                  alignSelf="center"
                  borderRadius={28}
                  borderWidth={1}
                  borderColor={theme.borderColor.val}
                  backgroundColor={theme.card.val}
                  shadowColor={theme.shadowColor.val}
                  shadowOffset={{ width: 0, height: 14 }}
                  shadowOpacity={Platform.OS === "web" ? 0.08 : 0.12}
                  shadowRadius={24}
                  elevation={4}
                  overflow="hidden"
                >
                  <LinearGradient
                    colors={[theme.accent.val + "12", theme.card.val, theme.card.val]}
                    style={{ padding: isLargeScreen ? 24 : 20 }}
                  >
                    <YStack gap={16}>
                      <XStack alignItems="center" gap={10}>
                        <YStack
                          width={42}
                          height={42}
                          borderRadius={14}
                          alignItems="center"
                          justifyContent="center"
                          backgroundColor={theme.primary.val + "18"}
                          borderWidth={1}
                          borderColor={theme.primary.val + "26"}
                        >
                          <Feather name={accentIcon} size={20} color={theme.primary.val} />
                        </YStack>
                        <Text fontSize={12} letterSpacing={1.6} color="$colorMuted">
                          MEMORA
                        </Text>
                      </XStack>

                      <YStack gap={6}>
                        <Text
                          fontSize={isLargeScreen ? 34 : 30}
                          lineHeight={isLargeScreen ? 38 : 34}
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
                </YStack>
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
    backgroundColor: "rgba(232,145,27,0.10)",
  },
  glowBottom: {
    position: "absolute",
    width: 280,
    height: 280,
    borderRadius: 280,
    bottom: -110,
    left: -100,
    backgroundColor: "rgba(245,166,35,0.08)",
  },
});
