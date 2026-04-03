import React from "react";
import { LinearGradient } from "expo-linear-gradient";
import { ScrollView, type ScrollViewProps, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { XStack, YStack, Text } from "tamagui";

import { useAppTheme } from "@/hooks/useAppTheme";
import { useIsLargeScreen } from "@/hooks/useIsLargeScreen";

type AppScreenProps = {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  headerRight?: React.ReactNode;
  padded?: boolean;
  scrollProps?: Omit<ScrollViewProps, "children">;
};

export function AppScreen({
  children,
  title,
  subtitle,
  headerRight,
  padded = true,
  scrollProps,
}: AppScreenProps) {
  const theme = useAppTheme();
  const isLargeScreen = useIsLargeScreen();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background.val }} edges={["top", "bottom"]}>
      <YStack flex={1} backgroundColor="$background">
        <LinearGradient
          colors={[
            theme.accent.val + "C0",
            theme.background.val,
            theme.background.val,
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.9, y: 0.55 }}
          style={{ position: "absolute", top: 0, left: 0, right: 0, height: 260 }}
        />
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 40,
            right: -32,
            width: 180,
            height: 180,
            borderRadius: 999,
            backgroundColor: theme.primary.val + "12",
            transform: [{ rotate: "-12deg" }],
          }}
        />
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          {...scrollProps}
          contentContainerStyle={[
            {
              paddingTop: 8,
              paddingBottom: 144,
              paddingHorizontal: padded ? 18 : 0,
            },
            scrollProps?.contentContainerStyle,
          ]}
        >
          <YStack
            width="100%"
            maxWidth={isLargeScreen ? 1100 : undefined}
            alignSelf="center"
            gap={20}
          >
            {(title || subtitle || headerRight) && (
              <XStack alignItems="flex-start" justifyContent="space-between" gap={16}>
                <YStack flex={1} gap={6}>
                  {title ? (
                    <Text
                      color="$color"
                      fontSize={isLargeScreen ? 34 : 28}
                      lineHeight={isLargeScreen ? 38 : 32}
                      fontFamily="$heading"
                      fontWeight="700"
                    >
                      {title}
                    </Text>
                  ) : null}
                  {subtitle ? (
                    <Text color="$colorMuted" fontSize={14} lineHeight={21} maxWidth={720}>
                      {subtitle}
                    </Text>
                  ) : null}
                </YStack>
                {headerRight}
              </XStack>
            )}
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

export function SectionCard({
  children,
  title,
  eyebrow,
  action,
  padded = true,
}: SectionCardProps) {
  return (
    <YStack
      backgroundColor="$card"
      borderColor="$borderColor"
      borderWidth={1}
      borderRadius={28}
      padding={padded ? 18 : 0}
      gap={16}
      shadowColor="$shadowColor"
      shadowOffset={{ width: 0, height: 12 }}
      shadowOpacity={0.08}
      shadowRadius={28}
    >
      {(title || eyebrow || action) && (
        <XStack alignItems="center" justifyContent="space-between" gap={16}>
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
              <Text color="$color" fontSize={18} fontFamily="$heading" fontWeight="700">
                {title}
              </Text>
            ) : null}
          </YStack>
          {action}
        </XStack>
      )}
      {children}
    </YStack>
  );
}
