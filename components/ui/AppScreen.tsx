import React from "react";
import { LinearGradient } from "expo-linear-gradient";
import { ScrollView, type ScrollViewProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { XStack, YStack, Text } from "tamagui";

import { useAppTheme } from "@/hooks/useAppTheme";
import { useIsLargeScreen } from "@/hooks/useIsLargeScreen";
import { useTabBarBottomPadding } from "@/hooks/useTabBarBottomPadding";
import { SurfaceCard } from "@/components/ui/SurfaceCard";
import { withAlpha } from "@/components/ui/themeHelpers";

type AppScreenProps = {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  headerRight?: React.ReactNode;
  hero?: React.ReactNode;
  padded?: boolean;
  chrome?: "standard" | "glass";
  scrollProps?: Omit<ScrollViewProps, "children">;
};

export function AppScreen({
  children,
  title,
  subtitle,
  headerRight,
  hero,
  padded = true,
  chrome = "glass",
  scrollProps,
}: AppScreenProps) {
  const theme = useAppTheme();
  const isLargeScreen = useIsLargeScreen();
  const tabBarPadding = useTabBarBottomPadding();

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.background.val }}
      edges={["top", "bottom"]}
    >
      <YStack flex={1} backgroundColor="$background">
        <LinearGradient
          colors={[
            withAlpha(theme.surfaceElevated.val, chrome === "glass" ? "A8" : "84"),
            withAlpha(theme.surfaceAccent.val, "28"),
            theme.background.val,
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.82, y: 0.62 }}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 180,
          }}
        />
        <LinearGradient
          pointerEvents="none"
          colors={[
            withAlpha(theme.borderColor.val, "00"),
            withAlpha(theme.borderStrong.val, "68"),
            withAlpha(theme.borderColor.val, "00"),
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 1,
            opacity: 0.55,
          }}
        />
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          {...scrollProps}
          contentContainerStyle={[
            {
              paddingTop: 10,
              paddingBottom: tabBarPadding,
              paddingHorizontal: padded ? 16 : 0,
            },
            scrollProps?.contentContainerStyle,
          ]}
        >
          <YStack
            width="100%"
            maxWidth={isLargeScreen ? 1100 : undefined}
            alignSelf="center"
            gap={14}
          >
            {(title || subtitle || headerRight) && (
              <XStack alignItems="center" justifyContent="space-between" gap={14}>
                <YStack flex={1} gap={3}>
                  {title ? (
                    <Text
                      color="$color"
                      fontSize={isLargeScreen ? 30 : 26}
                      lineHeight={isLargeScreen ? 34 : 30}
                      fontFamily="$heading"
                      fontWeight="700"
                    >
                      {title}
                    </Text>
                  ) : null}
                  {subtitle ? (
                    <Text color="$colorMuted" fontSize={13} lineHeight={18} maxWidth={720}>
                      {subtitle}
                    </Text>
                  ) : null}
                </YStack>
                {headerRight}
              </XStack>
            )}
            {hero}
            {children}
          </YStack>
        </ScrollView>
      </YStack>
    </SafeAreaView>
  );
}

type SectionCardProps = {
  children: React.ReactNode;
  title?: string;
  eyebrow?: string;
  action?: React.ReactNode;
  padded?: boolean;
};

export function SectionCard({ children, title, eyebrow, action, padded = true }: SectionCardProps) {
  return (
    <SurfaceCard variant="frosted" padding={padded ? 14 : 0} radius={16}>
      <YStack gap={12}>
        {(title || eyebrow || action) && (
          <XStack alignItems="center" justifyContent="space-between" gap={12}>
            <YStack flex={1} gap={4}>
              {eyebrow ? (
                <Text
                  color="$primary"
                  fontSize={11}
                  letterSpacing={1.2}
                  textTransform="uppercase"
                  fontWeight="700"
                >
                  {eyebrow}
                </Text>
              ) : null}
              {title ? (
                <Text color="$color" fontSize={16} fontFamily="$heading" fontWeight="700">
                  {title}
                </Text>
              ) : null}
            </YStack>
            {action}
          </XStack>
        )}
        {children}
      </YStack>
    </SurfaceCard>
  );
}
