import React from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { Feather, type FeatherIconName } from "@/lib/icons";
import { Text, XStack, YStack } from "tamagui";

import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { SurfaceCard } from "@/components/ui/SurfaceCard";
import { withAlpha } from "@/components/ui/themeHelpers";
import { spacing, radius } from "@/constants/uiTokens";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";

type AuthShellProps = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  accentIcon?: FeatherIconName;
};

const INDEX_ROWS: Array<{ label: string; value: string }> = [
  { label: "Capture", value: "Voice, text, links" },
  { label: "Recall", value: "Search by meaning" },
  { label: "Review", value: "Prompts that stay quiet" },
];

function BrandMark({ icon }: { icon: FeatherIconName }) {
  const theme = useAppTheme();

  return (
    <XStack alignItems="center" gap={10}>
      <YStack
        width={40}
        height={40}
        borderRadius={radius.sm}
        alignItems="center"
        justifyContent="center"
        backgroundColor={theme.surfaceAccent.val}
        borderWidth={1}
        borderColor={withAlpha(theme.primary.val, "24")}
      >
        <Feather name={icon} size={18} color={theme.primary.val} />
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
  );
}

function MemoryIndexRail() {
  const theme = useAppTheme();

  return (
    <Animated.View entering={FadeIn.duration(220)}>
      <YStack gap={spacing.lg} paddingRight={spacing.xl}>
        <BrandMark icon="archive" />

        <YStack gap={spacing.md} paddingTop={spacing.xl}>
          <Text
            color={theme.color.val}
            fontFamily="$heading"
            fontSize={30}
            lineHeight={34}
            fontWeight="800"
            maxWidth={330}
          >
            Get back to the memory, not the interface.
          </Text>
          <Text color={theme.colorMuted.val} fontSize={14} lineHeight={21} maxWidth={330}>
            A quieter entry point for capturing and revisiting what matters.
          </Text>
        </YStack>

        <YStack
          borderLeftWidth={1}
          borderColor={theme.borderColor.val}
          paddingLeft={spacing.lg}
          gap={spacing.md}
          marginTop={spacing.sm}
        >
          {INDEX_ROWS.map((row) => (
            <YStack key={row.label} gap={2}>
              <Text
                color={theme.primary.val}
                fontSize={11}
                fontWeight="700"
                textTransform="uppercase"
                letterSpacing={0.8}
              >
                {row.label}
              </Text>
              <Text color={theme.color.val} fontSize={14} fontWeight="600">
                {row.value}
              </Text>
            </YStack>
          ))}
        </YStack>
      </YStack>
    </Animated.View>
  );
}

export function AuthShell({ title, subtitle, children, accentIcon = "zap" }: AuthShellProps) {
  const theme = useAppTheme();
  const { isExpanded: isLargeScreen } = useResponsiveLayout();

  return (
    <YStack flex={1} backgroundColor={theme.background.val}>
      <SafeAreaView style={{ flex: 1, backgroundColor: "transparent" }} edges={["top", "bottom"]}>
        <KeyboardAwareScrollViewCompat
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            paddingHorizontal: isLargeScreen ? spacing.xxl : spacing.lg,
            paddingVertical: isLargeScreen ? spacing.xxl : spacing.xl,
          }}
        >
          <XStack
            width="100%"
            maxWidth={isLargeScreen ? 980 : 520}
            alignSelf="center"
            alignItems="center"
            justifyContent="center"
            gap={spacing.xxl}
          >
            {isLargeScreen ? (
              <YStack flex={0.78} minWidth={280}>
                <MemoryIndexRail />
              </YStack>
            ) : null}

            <Animated.View
              entering={FadeInDown.duration(260).springify().damping(22).stiffness(220)}
              style={{ flex: isLargeScreen ? 1 : undefined, width: "100%" }}
            >
              <SurfaceCard
                tone="elevated"
                variant="solid"
                shadowed={false}
                padding={isLargeScreen ? spacing.xl : spacing.lg}
                radius={radius.lg}
                style={{ width: "100%" }}
              >
                <YStack gap={spacing.lg}>
                  {isLargeScreen ? null : <BrandMark icon="archive" />}

                  <XStack alignItems="center" justifyContent="space-between" gap={spacing.md}>
                    <YStack flex={1} gap={spacing.sm}>
                      <XStack alignItems="center" gap={6}>
                        <Feather name="lock" size={12} color={theme.colorMuted.val} />
                        <Text
                          color={theme.colorMuted.val}
                          fontSize={11}
                          fontWeight="700"
                          textTransform="uppercase"
                          letterSpacing={0.8}
                        >
                          Secure access
                        </Text>
                      </XStack>
                      <Text
                        color={theme.color.val}
                        fontFamily="$heading"
                        fontSize={isLargeScreen ? 34 : 30}
                        lineHeight={isLargeScreen ? 38 : 34}
                        fontWeight="800"
                      >
                        {title}
                      </Text>
                      {subtitle ? (
                        <Text color={theme.colorMuted.val} fontSize={14} lineHeight={21}>
                          {subtitle}
                        </Text>
                      ) : null}
                    </YStack>
                    <YStack
                      width={44}
                      height={44}
                      borderRadius={radius.md}
                      alignItems="center"
                      justifyContent="center"
                      backgroundColor={theme.surfaceAccent.val}
                      borderWidth={1}
                      borderColor={withAlpha(theme.primary.val, "24")}
                    >
                      <Feather name={accentIcon} size={19} color={theme.primary.val} />
                    </YStack>
                  </XStack>

                  {children}
                </YStack>
              </SurfaceCard>
            </Animated.View>
          </XStack>
        </KeyboardAwareScrollViewCompat>
      </SafeAreaView>
    </YStack>
  );
}
