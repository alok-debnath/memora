import React from "react";
import { ScrollView, type ScrollViewProps } from "react-native";
import { XStack, YStack, Text } from "tamagui";

import { useIsLargeScreen } from "@/hooks/useIsLargeScreen";
import { useTabBarBottomPadding } from "@/hooks/useTabBarBottomPadding";
import { SurfaceCard } from "@/components/ui/SurfaceCard";

type AppScreenProps = {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  headerRight?: React.ReactNode;
  hero?: React.ReactNode;
  padded?: boolean;
  scrollProps?: Omit<ScrollViewProps, "children">;
};

export function AppScreen({
  children,
  title,
  subtitle,
  headerRight,
  hero,
  padded = true,
  scrollProps,
}: AppScreenProps) {
  const isLargeScreen = useIsLargeScreen();
  const tabBarPadding = useTabBarBottomPadding();

  return (
    <YStack flex={1} backgroundColor="$background">
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
