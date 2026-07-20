import React from "react";
import { type ScrollViewProps, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { usePathname, useRouter } from "expo-router";
import { XStack, YStack, Text } from "tamagui";

import { Feather } from "@/lib/icons";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import { useTabBarBottomPadding } from "@/hooks/useTabBarBottomPadding";
import { useAppTheme } from "@/hooks/useAppTheme";
import { SurfaceCard } from "@/components/ui/SurfaceCard";
import { PressableScale } from "@/components/ui/PressableScale";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { appShadow, withAlpha } from "@/components/ui/themeHelpers";
import { CONTENT_GAP, layout, radius, spacing } from "@/constants/uiTokens";
import { getNavigationContext } from "@/constants/appNavigation";

export type AppScreenContentWidth = "readable" | "standard" | "workspace" | "full";

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
  /** Controls the content measure without making screens own breakpoint logic. */
  contentWidth?: AppScreenContentWidth;
  headerEyebrow?: string;
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
  contentWidth = "standard",
  headerEyebrow,
}: AppScreenProps) {
  const responsive = useResponsiveLayout();
  const pathname = usePathname();
  const tabBarPadding = useTabBarBottomPadding();
  const theme = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topInset = safeTop && responsive.isCompact ? insets.top : 0;
  const bottomPadding = showBack ? insets.bottom + spacing.xl : tabBarPadding;
  const maxContentWidth =
    contentWidth === "readable"
      ? layout.readableMaxWidth
      : contentWidth === "workspace"
        ? layout.workspaceMaxWidth
        : contentWidth === "full"
          ? undefined
          : layout.standardMaxWidth;
  const innerMaxContentWidth =
    maxContentWidth === undefined
      ? undefined
      : Math.max(0, maxContentWidth - (padded ? spacing.lg * 2 : 0));
  const navigationContext = getNavigationContext(pathname);
  const desktopSubpage = Boolean(showBack && responsive.navigationMode !== "bottom");
  const resolvedHeaderEyebrow =
    headerEyebrow ?? (desktopSubpage ? navigationContext?.sectionLabel : "Memora") ?? "Workspace";
  const resolvedHeaderRight = headerRight ?? null;

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
  const useFloatingHeader = Boolean(showBack && responsive.isCompact);

  const inlineHeader = !useFloatingHeader &&
    !desktopSubpage &&
    (title || subtitle || resolvedHeaderRight) && (
      <XStack alignItems="center" justifyContent="space-between" gap={CONTENT_GAP}>
        <YStack flex={1} gap={3}>
          {title ? (
            <Text
              color={theme.color.val}
              fontSize={responsive.isExpanded ? 34 : responsive.isMedium ? 30 : 26}
              lineHeight={responsive.isExpanded ? 39 : responsive.isMedium ? 34 : 30}
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
        {resolvedHeaderRight}
      </XStack>
    );

  const desktopSubpageHeader = desktopSubpage ? (
    <YStack
      gap={spacing.sm}
      paddingTop={spacing.xs}
      paddingBottom={spacing.sm}
      borderBottomWidth={1}
      borderBottomColor={theme.borderSubtle.val}
    >
      <XStack alignItems="flex-end" justifyContent="space-between" gap={spacing.xl}>
        <YStack flex={1} minWidth={0} gap={spacing.xs}>
          <Text
            color={theme.primary.val}
            fontFamily="$utility"
            fontWeight="700"
            fontSize={10}
            lineHeight={13}
            textTransform="uppercase"
            letterSpacing={1.1}
          >
            {resolvedHeaderEyebrow}
          </Text>
          <Text
            color={theme.color.val}
            fontSize={responsive.isWide ? 38 : 33}
            lineHeight={responsive.isWide ? 43 : 38}
            fontFamily="$heading"
            fontWeight="700"
            numberOfLines={1}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text color={theme.colorMuted.val} fontSize={14} lineHeight={21} maxWidth={760}>
              {subtitle}
            </Text>
          ) : null}
        </YStack>
        {resolvedHeaderRight}
      </XStack>
    </YStack>
  ) : null;

  const pageHeader = desktopSubpageHeader ?? inlineHeader;

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
              {resolvedHeaderEyebrow}
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
          {resolvedHeaderRight}
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
        maxWidth={maxContentWidth}
        alignSelf="center"
        gap={CONTENT_GAP}
        paddingTop={contentTopPadding}
        paddingHorizontal={padded ? spacing.lg : 0}
      >
        {pageHeader}
        {hero}
      </YStack>
      <View
        style={{
          flex: 1,
          width: "100%",
          maxWidth: maxContentWidth,
          alignSelf: "center",
          marginTop: pageHeader || hero ? CONTENT_GAP : 0,
        }}
      >
        {children}
      </View>
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
            paddingBottom: bottomPadding,
            paddingHorizontal: padded ? spacing.lg : 0,
          },
          scrollProps?.contentContainerStyle,
        ]}
      >
        <YStack width="100%" maxWidth={innerMaxContentWidth} alignSelf="center" gap={CONTENT_GAP}>
          {pageHeader}
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
  density?: "compact" | "default" | "comfortable";
  emphasis?: "primary" | "supporting" | "quiet";
  fullHeight?: boolean;
};

export function SectionCard({
  children,
  title,
  eyebrow,
  action,
  padded = true,
  density = "default",
  emphasis = "supporting",
  fullHeight = false,
}: SectionCardProps) {
  const theme = useAppTheme();
  const padding =
    density === "compact" ? spacing.md : density === "comfortable" ? spacing.xl : spacing.lg;
  const gap = density === "compact" ? spacing.sm : spacing.md;

  return (
    <SurfaceCard
      variant={emphasis === "primary" ? "glass" : emphasis === "quiet" ? "solid" : "frosted"}
      padding={padded ? padding : 0}
      radius={radius.md}
      shadowed={emphasis !== "quiet"}
      style={fullHeight ? { height: "100%" } : undefined}
    >
      <YStack gap={gap} flex={fullHeight ? 1 : undefined}>
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
