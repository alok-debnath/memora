import React from "react";
import { type ScrollViewProps, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { XStack, YStack, Text } from "tamagui";

import { Feather } from "@/lib/icons";
import { useIsLargeScreen } from "@/hooks/useIsLargeScreen";
import { useTabBarBottomPadding } from "@/hooks/useTabBarBottomPadding";
import { useAppTheme } from "@/hooks/useAppTheme";
import { SurfaceCard } from "@/components/ui/SurfaceCard";
import { PressableScale } from "@/components/ui/PressableScale";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { appShadow, withAlpha } from "@/components/ui/themeHelpers";
import { CONTENT_GAP, spacing } from "@/constants/uiTokens";

type AppScreenProps = {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  headerRight?: React.ReactNode;
  hero?: React.ReactNode;
  padded?: boolean;
  scrollProps?: Omit<ScrollViewProps, "children">;
  /** Renders a back-navigation pill above the title/hero. */
  showBack?: boolean;
  /** Where to navigate when there's no back history. Defaults to "/". */
  fallbackHref?: string;
  /**
   * When true, renders children directly in a View instead of a ScrollView.
   * Use when children contain their own VirtualizedList (FlatList/SectionList) or canvas.
   */
  noScroll?: boolean;
  /**
   * Whether this screen should apply its own top safe-area inset.
   * Set to false when the screen already renders inside an ambient
   * SafeAreaView (e.g. the bottom-tabs layout), to avoid double padding.
   * Defaults to true (correct for stack-pushed screens).
   */
  safeTop?: boolean;
};

const FLOATING_HEADER_HEIGHT = 58;
const FLOATING_HEADER_TOP_MARGIN = 8;
const FLOATING_HEADER_CONTENT_GAP = 18;
const FLOATING_HEADER_TOP_PADDING =
  FLOATING_HEADER_TOP_MARGIN + FLOATING_HEADER_HEIGHT + FLOATING_HEADER_CONTENT_GAP;

export function AppScreen({
  children,
  title,
  subtitle,
  headerRight,
  hero,
  padded = true,
  scrollProps,
  showBack,
  fallbackHref = "/",
  noScroll,
  safeTop = true,
}: AppScreenProps) {
  const isLargeScreen = useIsLargeScreen();
  const tabBarPadding = useTabBarBottomPadding();
  const theme = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topInset = safeTop ? insets.top : 0;

  const handleBackPress = React.useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(fallbackHref as never);
  }, [fallbackHref, router]);

  const backButton = showBack ? (
    <PressableScale onPress={handleBackPress} hitSlop={10}>
      <XStack
        width={40}
        height={40}
        borderRadius={20}
        alignItems="center"
        justifyContent="center"
        backgroundColor={withAlpha(theme.backgroundStrong.val, "CC")}
        borderWidth={1}
        borderColor={withAlpha(theme.borderColor.val, "B8")}
        style={appShadow(theme.shadowColor.val, "xs")}
      >
        <Feather name="chevron-left" size={22} color={theme.color.val} />
      </XStack>
    </PressableScale>
  ) : null;

  // Sub-pages (showBack) get a floating header pinned above the scroll
  // content, matching the old fixed back+title capsule. Tab-root screens
  // (no back button) keep a plain inline header that scrolls with content.
  const useFloatingHeader = Boolean(showBack);

  const inlineHeader = !useFloatingHeader && (title || subtitle || headerRight) && (
    <XStack alignItems="center" justifyContent="space-between" gap={CONTENT_GAP}>
      <YStack flex={1} gap={3}>
        {title ? (
          <Text
            color={theme.color.val}
            fontSize={isLargeScreen ? 30 : 26}
            lineHeight={isLargeScreen ? 34 : 30}
            fontFamily="$heading"
            fontWeight="700"
          >
            {title}
          </Text>
        ) : null}
        {subtitle ? (
          <Text color={theme.colorMuted.val} fontSize={13} lineHeight={18} maxWidth={720}>
            {subtitle}
          </Text>
        ) : null}
      </YStack>
      {headerRight}
    </XStack>
  );

  const floatingHeader = useFloatingHeader ? (
    <>
      <LinearGradient
        pointerEvents="none"
        colors={[
          theme.background.val,
          withAlpha(theme.background.val, "F2"),
          withAlpha(theme.background.val, "B8"),
          withAlpha(theme.background.val, "00"),
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[styles.topFade, { height: topInset + 88 }]}
      />
      <View style={[styles.floatingHeaderLayer, { top: topInset + FLOATING_HEADER_TOP_MARGIN }]}>
        <XStack
          alignItems="center"
          gap={12}
          height={FLOATING_HEADER_HEIGHT}
          paddingHorizontal={padded ? spacing.lg : 0}
        >
          {backButton}
          <YStack flex={1} minWidth={0} gap={1}>
            <Text
              color={theme.colorMuted.val}
              fontFamily="$body"
              fontWeight="700"
              fontSize={10}
              lineHeight={12}
              textTransform="uppercase"
              letterSpacing={0.8}
            >
              More
            </Text>
            <Text
              color={theme.color.val}
              fontFamily="$heading"
              fontWeight="700"
              fontSize={28}
              lineHeight={32}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {title}
            </Text>
          </YStack>
          {headerRight}
        </XStack>
      </View>
    </>
  ) : null;

  const contentTopPadding = topInset + (useFloatingHeader ? FLOATING_HEADER_TOP_PADDING : 10);

  const noScrollBody = (
    <>
      {floatingHeader}
      <YStack
        width="100%"
        maxWidth={isLargeScreen ? 1100 : undefined}
        alignSelf="center"
        gap={CONTENT_GAP}
        paddingTop={contentTopPadding}
        paddingHorizontal={padded ? spacing.lg : 0}
      >
        {inlineHeader}
        {hero}
      </YStack>
      <View style={{ flex: 1, marginTop: inlineHeader || hero ? CONTENT_GAP : 0 }}>{children}</View>
    </>
  );

  const scrollBody = (
    <>
      {floatingHeader}
      <KeyboardAwareScrollViewCompat
        showsVerticalScrollIndicator={false}
        {...scrollProps}
        contentContainerStyle={[
          {
            paddingTop: contentTopPadding,
            paddingBottom: tabBarPadding,
            paddingHorizontal: padded ? spacing.lg : 0,
          },
          scrollProps?.contentContainerStyle,
        ]}
      >
        <YStack
          width="100%"
          maxWidth={isLargeScreen ? 1100 : undefined}
          alignSelf="center"
          gap={CONTENT_GAP}
        >
          {inlineHeader}
          {hero}
          {children}
        </YStack>
      </KeyboardAwareScrollViewCompat>
    </>
  );

  const body = noScroll ? noScrollBody : scrollBody;

  return (
    <YStack flex={1} backgroundColor={theme.background.val}>
      {body}
    </YStack>
  );
}

const styles = StyleSheet.create({
  topFade: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: 88,
    zIndex: 998,
    elevation: 998,
  },
  floatingHeaderLayer: {
    position: "absolute",
    left: 0,
    right: 0,
    width: "100%",
    zIndex: 1001,
    elevation: 1001,
  },
});

type SectionCardProps = {
  children: React.ReactNode;
  title?: string;
  eyebrow?: string;
  action?: React.ReactNode;
  padded?: boolean;
};

export function SectionCard({ children, title, eyebrow, action, padded = true }: SectionCardProps) {
  const theme = useAppTheme();

  return (
    <SurfaceCard variant="frosted" padding={padded ? 14 : 0} radius={16}>
      <YStack gap={12}>
        {(title || eyebrow || action) && (
          <XStack alignItems="center" justifyContent="space-between" gap={12}>
            <YStack flex={1} gap={4}>
              {eyebrow ? (
                <Text
                  color={theme.primary.val}
                  fontSize={11}
                  letterSpacing={1.2}
                  textTransform="uppercase"
                  fontWeight="700"
                >
                  {eyebrow}
                </Text>
              ) : null}
              {title ? (
                <Text color={theme.color.val} fontSize={16} fontFamily="$heading" fontWeight="700">
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
