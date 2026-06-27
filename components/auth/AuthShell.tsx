import React, { useEffect } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from "react-native";
import { Feather, type FeatherIconName } from "@/lib/icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, XStack, YStack } from "tamagui";

import { SurfaceCard } from "@/components/ui/SurfaceCard";
import { withAlpha } from "@/components/ui/themeHelpers";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useIsLargeScreen } from "@/hooks/useIsLargeScreen";

type AuthShellProps = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  accentIcon?: FeatherIconName;
};

const VALUE_POINTS: Array<{ icon: FeatherIconName; label: string; detail: string }> = [
  {
    icon: "mic",
    label: "Capture Fast",
    detail: "Voice or text entries in seconds.",
  },
  {
    icon: "search",
    label: "Recall Clearly",
    detail: "Find memories with natural language.",
  },
  {
    icon: "shield",
    label: "Private by Default",
    detail: "Built with privacy-first defaults.",
  },
];

export function AuthShell({ title, subtitle, children, accentIcon = "zap" }: AuthShellProps) {
  const theme = useAppTheme();
  const isLargeScreen = useIsLargeScreen();

  const drift = useSharedValue(0);

  useEffect(() => {
    drift.value = withRepeat(withTiming(1, { duration: 5200 }), -1, true);
  }, [drift]);

  const topGlowStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(drift.value, [0, 1], [-12, 12]) },
      { translateY: interpolate(drift.value, [0, 1], [8, -8]) },
      { scale: interpolate(drift.value, [0, 1], [0.95, 1.06]) },
    ],
  }));

  const bottomGlowStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(drift.value, [0, 1], [10, -10]) },
      { translateY: interpolate(drift.value, [0, 1], [-6, 8]) },
      { scale: interpolate(drift.value, [0, 1], [1.04, 0.96]) },
    ],
  }));

  return (
    <YStack flex={1} backgroundColor="$background">
      <LinearGradient
        colors={[
          withAlpha(theme.surfaceAccent.val, "F2"),
          withAlpha(theme.background.val, "EE"),
          theme.background.val,
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View
        pointerEvents="none"
        shouldRasterizeIOS
        renderToHardwareTextureAndroid
        style={[
          styles.glowTop,
          topGlowStyle,
          { backgroundColor: withAlpha(theme.primary.val, "1A") },
        ]}
      />
      <Animated.View
        pointerEvents="none"
        shouldRasterizeIOS
        renderToHardwareTextureAndroid
        style={[
          styles.glowBottom,
          bottomGlowStyle,
          { backgroundColor: withAlpha(theme.warning.val, "14") },
        ]}
      />

      <SafeAreaView style={{ flex: 1, backgroundColor: "transparent" }} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={
            Platform.OS === "ios" ? "padding" : Platform.OS === "android" ? "height" : undefined
          }
          keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: "center",
              paddingTop: 20,
              paddingBottom: 24,
              paddingHorizontal: isLargeScreen ? 28 : 18,
            }}
          >
            {isLargeScreen ? (
              <XStack width="100%" maxWidth={1080} alignSelf="center" gap={18} alignItems="stretch">
                <SurfaceCard
                  tone="elevated"
                  padding={0}
                  style={{
                    flex: 0.95,
                    borderRadius: 34,
                    overflow: "hidden",
                  }}
                >
                  <LinearGradient
                    colors={[
                      theme.surfaceElevated.val,
                      withAlpha(theme.primary.val, "12"),
                      theme.surface.val,
                    ]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{ flex: 1, padding: 28 }}
                  >
                    <YStack flex={1} justifyContent="space-between" gap={22}>
                      <YStack gap={10}>
                        <XStack alignItems="center" gap={10}>
                          <YStack
                            width={42}
                            height={42}
                            borderRadius={14}
                            alignItems="center"
                            justifyContent="center"
                            backgroundColor={withAlpha(theme.primary.val, "20")}
                            borderWidth={1}
                            borderColor={withAlpha(theme.primary.val, "38")}
                          >
                            <Feather name="sunrise" size={18} color={theme.primary.val} />
                          </YStack>
                          <YStack gap={2}>
                            <Text
                              fontSize={11}
                              letterSpacing={1.8}
                              color="$primary"
                              fontWeight="700"
                            >
                              MEMORA
                            </Text>
                            <Text fontSize={12} color="$colorMuted">
                              Memory studio
                            </Text>
                          </YStack>
                        </XStack>

                        <Text
                          fontSize={40}
                          lineHeight={44}
                          fontFamily="$heading"
                          fontWeight="800"
                          color="$color"
                        >
                          Calm memory, modern workspace.
                        </Text>
                        <Text fontSize={15} lineHeight={23} color="$colorMuted">
                          Capture, revisit, and refine your memories with a focused workflow.
                        </Text>
                      </YStack>

                      <YStack gap={10}>
                        {VALUE_POINTS.map((point) => (
                          <XStack
                            key={point.label}
                            alignItems="center"
                            gap={12}
                            borderWidth={1}
                            borderColor={withAlpha(theme.borderStrong.val, "7A")}
                            backgroundColor={withAlpha(theme.surface.val, "CC")}
                            borderRadius={18}
                            paddingHorizontal={14}
                            paddingVertical={12}
                          >
                            <YStack
                              width={34}
                              height={34}
                              borderRadius={11}
                              alignItems="center"
                              justifyContent="center"
                              backgroundColor={withAlpha(theme.primary.val, "18")}
                            >
                              <Feather name={point.icon} size={15} color={theme.primary.val} />
                            </YStack>
                            <YStack flex={1}>
                              <Text fontSize={14} fontWeight="700" color="$color">
                                {point.label}
                              </Text>
                              <Text fontSize={12} color="$colorMuted">
                                {point.detail}
                              </Text>
                            </YStack>
                          </XStack>
                        ))}
                      </YStack>
                    </YStack>
                  </LinearGradient>
                </SurfaceCard>

                <SurfaceCard
                  tone="elevated"
                  padding={0}
                  style={{
                    flex: 1.05,
                    borderRadius: 34,
                    overflow: "hidden",
                    minHeight: 620,
                  }}
                >
                  <LinearGradient
                    colors={[
                      withAlpha(theme.surfaceAccent.val, "E8"),
                      theme.surfaceElevated.val,
                      theme.surface.val,
                    ]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{ flex: 1, padding: 28 }}
                  >
                    <YStack flex={1} gap={18}>
                      <XStack alignItems="center" gap={10}>
                        <YStack
                          width={48}
                          height={48}
                          borderRadius={16}
                          alignItems="center"
                          justifyContent="center"
                          backgroundColor={withAlpha(theme.primary.val, "18")}
                          borderWidth={1}
                          borderColor={withAlpha(theme.primary.val, "32")}
                        >
                          <Feather name={accentIcon} size={22} color={theme.primary.val} />
                        </YStack>
                        <YStack gap={2}>
                          <Text fontSize={11} letterSpacing={1.8} color="$primary" fontWeight="700">
                            ACCESS
                          </Text>
                          <Text fontSize={12} color="$colorMuted">
                            Secure sign in
                          </Text>
                        </YStack>
                      </XStack>

                      <YStack gap={8}>
                        <Text
                          fontSize={40}
                          lineHeight={44}
                          fontFamily="$heading"
                          fontWeight="800"
                          color="$color"
                        >
                          {title}
                        </Text>
                        {subtitle ? (
                          <Text fontSize={15} lineHeight={23} color="$colorMuted">
                            {subtitle}
                          </Text>
                        ) : null}
                      </YStack>

                      <YStack gap={12} flex={1}>
                        {children}
                      </YStack>
                    </YStack>
                  </LinearGradient>
                </SurfaceCard>
              </XStack>
            ) : (
              <YStack flex={1} justifyContent="center">
                <SurfaceCard
                  tone="elevated"
                  padding={0}
                  style={{
                    width: "100%",
                    maxWidth: 520,
                    alignSelf: "center",
                    overflow: "hidden",
                    borderRadius: 32,
                  }}
                >
                  <LinearGradient
                    colors={[
                      withAlpha(theme.surfaceAccent.val, "E8"),
                      theme.surfaceElevated.val,
                      theme.surface.val,
                    ]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{ padding: 22 }}
                  >
                    <YStack gap={18}>
                      <XStack alignItems="center" justifyContent="space-between">
                        <XStack alignItems="center" gap={10}>
                          <YStack
                            width={42}
                            height={42}
                            borderRadius={14}
                            alignItems="center"
                            justifyContent="center"
                            backgroundColor={withAlpha(theme.primary.val, "18")}
                            borderWidth={1}
                            borderColor={withAlpha(theme.primary.val, "32")}
                          >
                            <Feather name={accentIcon} size={19} color={theme.primary.val} />
                          </YStack>
                          <YStack gap={2}>
                            <Text
                              fontSize={11}
                              letterSpacing={1.8}
                              color="$primary"
                              fontWeight="700"
                            >
                              MEMORA
                            </Text>
                            <Text fontSize={12} color="$colorMuted">
                              Secure access
                            </Text>
                          </YStack>
                        </XStack>
                        <YStack
                          borderRadius={999}
                          borderWidth={1}
                          borderColor={withAlpha(theme.borderStrong.val, "75")}
                          backgroundColor={withAlpha(theme.surface.val, "A8")}
                          paddingHorizontal={10}
                          paddingVertical={5}
                        >
                          <Text fontSize={11} color="$colorMuted" fontWeight="600">
                            Private
                          </Text>
                        </YStack>
                      </XStack>

                      <YStack gap={8}>
                        <Text
                          fontSize={34}
                          lineHeight={38}
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
              </YStack>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </YStack>
  );
}

const styles = StyleSheet.create({
  glowTop: {
    position: "absolute",
    width: 420,
    height: 420,
    borderRadius: 420,
    top: -180,
    right: -170,
  },
  glowBottom: {
    position: "absolute",
    width: 340,
    height: 340,
    borderRadius: 340,
    bottom: -150,
    left: -120,
  },
});
