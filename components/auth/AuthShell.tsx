import React from "react";
import { StyleSheet } from "react-native";
import { Feather, type FeatherIconName } from "@/lib/icons";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, XStack, YStack } from "tamagui";

import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
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

  return (
    <YStack flex={1} backgroundColor={theme.background.val}>
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
      <LinearGradient
        pointerEvents="none"
        colors={[
          withAlpha(theme.primary.val, "16"),
          withAlpha(theme.primary.val, "06"),
          withAlpha(theme.background.val, "00"),
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.topBand}
      />
      <LinearGradient
        pointerEvents="none"
        colors={[
          withAlpha(theme.background.val, "00"),
          withAlpha(theme.warning.val, "08"),
          withAlpha(theme.warning.val, "12"),
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.bottomBand}
      />

      <SafeAreaView style={{ flex: 1, backgroundColor: "transparent" }} edges={["top", "bottom"]}>
        <KeyboardAwareScrollViewCompat
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
                            color={theme.primary.val}
                            fontWeight="700"
                          >
                            MEMORA
                          </Text>
                          <Text fontSize={12} color={theme.colorMuted.val}>
                            Memory studio
                          </Text>
                        </YStack>
                      </XStack>

                      <Text
                        fontSize={40}
                        lineHeight={44}
                        fontFamily="$heading"
                        fontWeight="800"
                        color={theme.color.val}
                      >
                        Calm memory, modern workspace.
                      </Text>
                      <Text fontSize={15} lineHeight={23} color={theme.colorMuted.val}>
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
                            <Text fontSize={14} fontWeight="700" color={theme.color.val}>
                              {point.label}
                            </Text>
                            <Text fontSize={12} color={theme.colorMuted.val}>
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
                        <Text
                          fontSize={11}
                          letterSpacing={1.8}
                          color={theme.primary.val}
                          fontWeight="700"
                        >
                          ACCESS
                        </Text>
                        <Text fontSize={12} color={theme.colorMuted.val}>
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
                        color={theme.color.val}
                      >
                        {title}
                      </Text>
                      {subtitle ? (
                        <Text fontSize={15} lineHeight={23} color={theme.colorMuted.val}>
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
                            color={theme.primary.val}
                            fontWeight="700"
                          >
                            MEMORA
                          </Text>
                          <Text fontSize={12} color={theme.colorMuted.val}>
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
                        <Text fontSize={11} color={theme.colorMuted.val} fontWeight="600">
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
                        color={theme.color.val}
                      >
                        {title}
                      </Text>
                      {subtitle ? (
                        <Text fontSize={15} lineHeight={22} color={theme.colorMuted.val}>
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
        </KeyboardAwareScrollViewCompat>
      </SafeAreaView>
    </YStack>
  );
}

const styles = StyleSheet.create({
  topBand: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 160,
  },
  bottomBand: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 180,
  },
});
