import { BlurView } from "expo-blur";
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { usePathname } from "expo-router";
import { Tabs, TabList, TabTrigger, TabSlot, useTabTrigger } from "expo-router/ui";
import { Feather } from "@/lib/icons";
import React, { useEffect, useId, useMemo, useRef } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
  useSharedValue,
} from "react-native-reanimated";
import { XStack, YStack, Text } from "tamagui";

import { AppButton } from "@/components/ui/AppButton";
import { useBackdropBlurHost } from "@/components/ui/BackdropBlurProvider";
import { appShadow, withAlpha } from "@/components/ui/themeHelpers";
import { FontFamily } from "@/constants/fonts";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useIsLargeScreen } from "@/hooks/useIsLargeScreen";
import { useThemeStore } from "@/store/theme";
import { useUIStore } from "@/store/ui";

// ─── Navigation items ─────────────────────────────────────────────────────────

const NAV_ITEMS = [
  {
    name: "index" as const,
    title: "Home",
    icon: "home" as const,
  },
  {
    name: "diary" as const,
    title: "Diary",
    icon: "book-open" as const,
  },
  {
    name: "review" as const,
    title: "Review",
    icon: "refresh-cw" as const,
  },
  {
    name: "more" as const,
    title: "More",
    icon: "more-horizontal" as const,
  },
] as const;

type NavItemName = (typeof NAV_ITEMS)[number]["name"];

// ─── Bar geometry ─────────────────────────────────────────────────────────────

const BAR_W = 340;
const BAR_H = 60;
const BAR_R = 999; // Large value → OS clamps to true pill (height/2 each side)
const BAR_SIDE_PAD = 10; // Inner horizontal padding — pushes icons inward from edges
const CONTENT_W = BAR_W - BAR_SIDE_PAD * 2; // Usable width inside side padding
const SLOT_W = CONTENT_W / 5; // Slot width for each of 5 visual positions
const IND_PAD_Y = 8; // Vertical inset from bar edge
const IND_OVERLAP = 2; // How far the pill bleeds into neighboring slots (liquid glass)
const IND_W = SLOT_W + IND_OVERLAP * 2; // Pill wider than its slot
const IND_H = BAR_H - IND_PAD_Y * 2;
const IND_Y = IND_PAD_Y;
const FADE_H = 80; // Height of the fade gradient above the bar
const BAR_BOTTOM_MARGIN = 14; // How far the pill floats above the safe-area bottom

// Maps state.index (0–3) → visual slot (0, 1, 3, 4) → indicator translateX
// Pill is centered on the slot but wider, so offset = side_pad + slot_center - half_pill
const IND_X = [0, 1, 3, 4].map((slot) => BAR_SIDE_PAD + slot * SLOT_W + SLOT_W / 2 - IND_W / 2);
// = [8, 76, 212, 280]

// ─── Animation config (tweak here) ───────────────────────────────────────────
// Higher damping = less oscillation. overshootClamping: true = no bounce at all.

const ANIM = {
  // Indicator pill sliding between tabs
  indicator: {
    damping: 30,
    stiffness: 270,
    mass: 0.8,
    overshootClamping: true,
  },
  // Icon lift / label slide on focus change
  focus: { damping: 22, stiffness: 280, overshootClamping: true },
  // Tab item scale on press-in / press-out
  tabPressIn: { damping: 18, stiffness: 500, overshootClamping: true },
  tabPressOut: { damping: 18, stiffness: 320, overshootClamping: true },
  // Plus button press
  plusPressIn: { damping: 18, stiffness: 460, overshootClamping: true },
  plusPressOut: { damping: 20, stiffness: 340, overshootClamping: true },
  // Bar entrance on mount
  entrance: { damping: 28, stiffness: 220, overshootClamping: true },
} as const;

// ─── TabItem ──────────────────────────────────────────────────────────────────

type TabItemProps = {
  icon: React.ComponentProps<typeof Feather>["name"];
  title: string;
  isFocused: boolean;
  onPress: () => void;
  primaryColor: string;
  mutedColor: string;
};

type NavTrigger = {
  name: NavItemName;
  isFocused: boolean;
  onPress: () => void;
};

type FloatingTabBarProps = {
  triggers: NavTrigger[];
  onPressAdd: () => void;
  androidBlurTarget?: React.RefObject<View | null>;
};

type TabBarSurfaceProps = {
  glassColor: string;
  overlayColor: string;
  androidFallbackColor: string;
  blurIntensity: number;
  isAndroid: boolean;
  isDark: boolean;
  useLiquidGlass: boolean;
  androidBlurTarget?: React.RefObject<View | null>;
};

function TabItem({ icon, title, isFocused, onPress, primaryColor, mutedColor }: TabItemProps) {
  const scale = useSharedValue(1);
  const labelOpacity = useSharedValue(isFocused ? 1 : 0);
  const labelY = useSharedValue(isFocused ? 0 : 5);
  const iconY = useSharedValue(isFocused ? 0 : 6);

  useEffect(() => {
    labelOpacity.value = withTiming(isFocused ? 1 : 0, { duration: 150 });
    labelY.value = withSpring(isFocused ? 0 : 5, ANIM.focus);
    iconY.value = withSpring(isFocused ? 0 : 6, ANIM.focus);
  }, [isFocused]);

  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    opacity: labelOpacity.value,
    transform: [{ translateY: labelY.value }],
  }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: iconY.value }],
  }));

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        scale.value = withSpring(0.92, ANIM.tabPressIn);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, ANIM.tabPressOut);
      }}
      style={styles.tabItem}
    >
      <Animated.View style={[styles.tabInner, pressStyle]}>
        <Animated.View style={iconStyle}>
          <Feather
            name={icon}
            size={isFocused ? 18 : 17}
            color={isFocused ? primaryColor : mutedColor}
          />
        </Animated.View>
        <Animated.Text
          style={[
            styles.tabLabel,
            { color: primaryColor, fontFamily: FontFamily.semiBold },
            labelStyle,
          ]}
          numberOfLines={1}
        >
          {title}
        </Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

// ─── PlusButton ───────────────────────────────────────────────────────────────

function PlusButton({ onPress, primaryColor }: { onPress: () => void; primaryColor: string }) {
  const theme = useAppTheme();
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <View style={styles.plusSlot}>
      <Pressable
        onPress={onPress}
        onPressIn={() => {
          scale.value = withSpring(0.94, ANIM.plusPressIn);
        }}
        onPressOut={() => {
          scale.value = withSpring(1, ANIM.plusPressOut);
        }}
      >
        <Animated.View style={[styles.plusButton, { backgroundColor: primaryColor }, animStyle]}>
          <Feather name="plus" size={22} color={theme.textInverse.val} />
        </Animated.View>
      </Pressable>
    </View>
  );
}

// Maps route name → display index (0–3), ignoring hidden __fab route
const ROUTE_DISPLAY_INDEX: Record<string, number> = {
  index: 0,
  diary: 1,
  review: 2,
  more: 3,
};

function TabBarSurface({
  glassColor,
  overlayColor,
  androidFallbackColor,
  blurIntensity,
  isAndroid,
  isDark,
  useLiquidGlass,
  androidBlurTarget,
}: TabBarSurfaceProps) {
  const theme = useAppTheme();

  if (Platform.OS === "web") {
    return (
      <View
        style={[
          StyleSheet.absoluteFill,
          // @ts-ignore – web-only CSS property
          {
            backgroundColor: glassColor,
            backdropFilter: "blur(28px)",
          },
        ]}
      />
    );
  }

  if (useLiquidGlass) {
    return (
      <GlassView
        style={StyleSheet.absoluteFill}
        glassEffectStyle={{ style: "regular", animate: true, animationDuration: 0.28 }}
        colorScheme={isDark ? "dark" : "light"}
        isInteractive={false}
      />
    );
  }

  return (
    <>
      <BlurView
        style={StyleSheet.absoluteFill}
        intensity={blurIntensity}
        tint={isDark ? "dark" : "light"}
        blurMethod={isAndroid && androidBlurTarget ? "dimezisBlurViewSdk31Plus" : undefined}
        blurTarget={isAndroid ? androidBlurTarget : undefined}
        blurReductionFactor={isAndroid && androidBlurTarget ? 3.5 : undefined}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: glassColor }]} />
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: isAndroid ? androidFallbackColor : overlayColor,
          },
        ]}
      />
    </>
  );
}

function useIsNativeLiquidGlassEnabled() {
  return Platform.OS === "ios" && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
}

// ─── FloatingTabBar ───────────────────────────────────────────────────────────

function FloatingTabBar({ triggers, onPressAdd, androidBlurTarget }: FloatingTabBarProps) {
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  const resolvedMode = useThemeStore((s) => s.resolvedMode);
  const isDark = resolvedMode === "dark";
  const isAndroid = Platform.OS === "android";
  const useLiquidGlass = useIsNativeLiquidGlassEnabled();

  const primaryColor = theme.primary.val;
  const mutedColor = theme.colorMuted.val;

  const activeRouteName = triggers.find((t) => t.isFocused)?.name ?? "index";
  const displayIndex = ROUTE_DISPLAY_INDEX[activeRouteName] ?? 0;

  // Sliding active indicator
  const indicatorX = useSharedValue(IND_X[displayIndex] ?? IND_X[0]);
  const pillScaleX = useSharedValue(1);
  const pillScaleY = useSharedValue(1);

  useEffect(() => {
    indicatorX.value = withSpring(IND_X[displayIndex] ?? IND_X[0], ANIM.indicator);
    // Squish on launch → stretch on arrival (liquid glass morphing)
    pillScaleX.value = withSequence(
      withTiming(1.28, { duration: 90 }),
      withSpring(1, { damping: 16, stiffness: 260, overshootClamping: false }),
    );
    pillScaleY.value = withSequence(
      withTiming(0.78, { duration: 90 }),
      withSpring(1, { damping: 16, stiffness: 260, overshootClamping: false }),
    );
    // Container micro-pulse: skip on mount, transform-only so it runs on UI thread
    if (isMounted.current) {
      barScale.value = withSequence(
        withTiming(0.986, { duration: 65 }),
        withSpring(1, {
          damping: 14,
          stiffness: 320,
          overshootClamping: false,
        }),
      );
    }
  }, [displayIndex]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: indicatorX.value },
      { scaleX: pillScaleX.value },
      { scaleY: pillScaleY.value },
    ],
  }));

  // Entrance: slide up from below on mount
  const barY = useSharedValue(100);
  const barOpacity = useSharedValue(0);
  // Subtle container pulse on tab change (UI-thread only — no JS bridge cost)
  const barScale = useSharedValue(1);
  const isMounted = useRef(false);

  useEffect(() => {
    barY.value = withSpring(0, ANIM.entrance);
    barOpacity.value = useLiquidGlass ? 1 : withTiming(1, { duration: 280 });
    isMounted.current = true;
  }, [barOpacity, barY, useLiquidGlass]);

  // Single animated style merges entrance + pulse transforms so they don't clobber each other
  const barEntranceStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: barY.value }, { scale: barScale.value }],
    opacity: barOpacity.value,
  }));

  const glassColor = isDark
    ? withAlpha(theme.backgroundStrong.val, "52")
    : withAlpha(theme.card.val, "40");
  const overlayColor = isDark
    ? withAlpha(theme.background.val, "1C")
    : withAlpha(theme.background.val, "16");
  const borderColor = isDark
    ? withAlpha(theme.borderColor.val, "70")
    : withAlpha(theme.borderColor.val, "52");
  const indicatorBg = isDark ? withAlpha(primaryColor, "2E") : withAlpha(primaryColor, "24");
  const blurIntensity = isDark ? 16 : 14;
  const androidFallbackColor = isDark
    ? withAlpha(theme.backgroundStrong.val, "47")
    : withAlpha(theme.card.val, "3D");

  const handleTabPress = (trigger: NavTrigger) => {
    if (Platform.OS !== "web") {
      void Haptics.selectionAsync();
    }
    trigger.onPress();
  };

  // Transparent wrapper tells React Navigation how much vertical space to reserve,
  // so screen content doesn't hide behind the floating pill.
  // alignItems: center handles horizontal centering — no position:absolute tricks needed.
  const bottomInset =
    (Platform.OS === "android" ? Math.max(insets.bottom, 8) : insets.bottom + 8) +
    BAR_BOTTOM_MARGIN;
  const containerHeight = BAR_H + bottomInset + FADE_H;
  const fadeColors = React.useMemo(() => {
    // Multi-stop ease-in curve to eliminate banding while staying theme-derived
    const bg = theme.background.val;
    return [
      withAlpha(bg, "00"),
      withAlpha(bg, "0D"),
      withAlpha(bg, "21"),
      withAlpha(bg, "40"),
      withAlpha(bg, "6B"),
      withAlpha(bg, "99"),
      withAlpha(bg, "BF"),
      withAlpha(bg, "D9"),
    ] as string[];
  }, [theme.background.val]);

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: containerHeight,
        width: "100%",
        alignItems: "center",
        justifyContent: "flex-end",
        paddingBottom: bottomInset,
      }}
    >
      {/* Fade gradient so content dissolves behind the bar */}
      <LinearGradient
        colors={fadeColors as [string, string, ...string[]]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <Animated.View
        style={[
          styles.outerContainer,
          appShadow(theme.shadowColor.val, isDark ? "lg" : "md"),
          barEntranceStyle,
        ]}
      >
        <View style={styles.innerContainer}>
          <TabBarSurface
            glassColor={glassColor}
            overlayColor={overlayColor}
            androidFallbackColor={androidFallbackColor}
            blurIntensity={blurIntensity}
            isAndroid={isAndroid}
            isDark={isDark}
            useLiquidGlass={useLiquidGlass}
            androidBlurTarget={androidBlurTarget}
          />

          {/* Border highlight */}
          {!useLiquidGlass ? (
            <View style={[StyleSheet.absoluteFill, styles.border, { borderColor }]} />
          ) : null}

          {/* Sliding active indicator pill */}
          <Animated.View
            style={[styles.indicator, { backgroundColor: indicatorBg, top: IND_Y }, indicatorStyle]}
          />

          {/* Tab items row */}
          <View style={styles.row}>
            {/* Home, Diary */}
            {NAV_ITEMS.slice(0, 2).map((item) => {
              const trigger = triggers.find((t) => t.name === item.name)!;
              return (
                <TabItem
                  key={item.name}
                  icon={item.icon}
                  title={item.title}
                  isFocused={trigger.isFocused}
                  onPress={() => handleTabPress(trigger)}
                  primaryColor={primaryColor}
                  mutedColor={mutedColor}
                />
              );
            })}

            {/* Center + button */}
            <PlusButton onPress={onPressAdd} primaryColor={primaryColor} />

            {/* Review, More */}
            {NAV_ITEMS.slice(2).map((item) => {
              const trigger = triggers.find((t) => t.name === item.name)!;
              return (
                <TabItem
                  key={item.name}
                  icon={item.icon}
                  title={item.title}
                  isFocused={trigger.isFocused}
                  onPress={() => handleTabPress(trigger)}
                  primaryColor={primaryColor}
                  mutedColor={mutedColor}
                />
              );
            })}
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

function isTabRootPath(pathname: string) {
  return (
    pathname === "/" ||
    pathname === "/index" ||
    pathname === "/diary" ||
    pathname === "/review" ||
    pathname === "/more"
  );
}

type MobileTabBarOverlayProps = {
  triggers: NavTrigger[];
  onPressAdd: () => void;
};

function MobileTabBarOverlay({ triggers, onPressAdd }: MobileTabBarOverlayProps) {
  const host = useBackdropBlurHost();
  const overlayId = useId();

  const overlayNode = useMemo(
    () => (
      <FloatingTabBar
        triggers={triggers}
        onPressAdd={onPressAdd}
        androidBlurTarget={host?.blurTargetRef}
      />
    ),
    [triggers, host?.blurTargetRef, onPressAdd],
  );

  useEffect(() => {
    if (!host) return;
    host.setOverlay(overlayId, overlayNode);
    return () => host.removeOverlay(overlayId);
  }, [host, overlayId, overlayNode]);

  if (host) return null;
  return overlayNode;
}

function useNavTriggers(): NavTrigger[] {
  const index = useTabTrigger({ name: "index" });
  const diary = useTabTrigger({ name: "diary" });
  const review = useTabTrigger({ name: "review" });
  const more = useTabTrigger({ name: "more" });

  return useMemo(
    () => [
      {
        name: "index" as const,
        isFocused: index.trigger?.isFocused ?? false,
        onPress: () => index.switchTab("index", {}),
      },
      {
        name: "diary" as const,
        isFocused: diary.trigger?.isFocused ?? false,
        onPress: () => diary.switchTab("diary", {}),
      },
      {
        name: "review" as const,
        isFocused: review.trigger?.isFocused ?? false,
        onPress: () => review.switchTab("review", {}),
      },
      {
        name: "more" as const,
        isFocused: more.trigger?.isFocused ?? false,
        onPress: () => more.switchTab("more", {}),
      },
    ],
    [index, diary, review, more],
  );
}

// ─── Custom floating pill layout (mobile + web) ───────────────────────────────

function MobileTabLayout() {
  const theme = useAppTheme();
  const openCommand = useUIStore((s) => s.openCommand);
  const pathname = usePathname();
  const showTabBar = isTabRootPath(pathname);
  const triggers = useNavTriggers();

  const handlePressAdd = React.useCallback(() => {
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    openCommand();
  }, [openCommand]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background.val }} edges={["top"]}>
      <TabSlot style={{ flex: 1, backgroundColor: theme.background.val }} />
      {showTabBar ? <MobileTabBarOverlay triggers={triggers} onPressAdd={handlePressAdd} /> : null}
    </SafeAreaView>
  );
}

// ─── Desktop sidebar layout ───────────────────────────────────────────────────

function DesktopSidebarLayout() {
  const theme = useAppTheme();
  const openCommand = useUIStore((s) => s.openCommand);
  const triggers = useNavTriggers();

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.background.val }}
      edges={["top", "bottom"]}
    >
      <XStack flex={1} backgroundColor="$background">
        <YStack
          width={292}
          borderRightWidth={1}
          borderRightColor="$borderColor"
          backgroundColor="$background"
          paddingHorizontal={20}
          paddingTop={18}
          paddingBottom={20}
        >
          <YStack
            borderRadius={28}
            padding={18}
            marginBottom={18}
            backgroundColor="$card"
            borderWidth={1}
            borderColor="$borderColor"
            gap={16}
          >
            <XStack alignItems="center" gap={12}>
              <YStack
                width={40}
                height={40}
                borderRadius={14}
                backgroundColor={theme.primary.val + "18"}
                alignItems="center"
                justifyContent="center"
              >
                <Feather name="layers" size={20} color={theme.primary.val} />
              </YStack>
              <YStack flex={1}>
                <Text fontSize={22} fontFamily="$heading" fontWeight="700" color="$color">
                  Memora
                </Text>
                <Text fontSize={12} color="$colorMuted">
                  Memory studio
                </Text>
              </YStack>
            </XStack>
            <YStack
              borderRadius={18}
              padding={14}
              backgroundColor={theme.primary.val + "10"}
              gap={8}
            >
              <Text
                fontSize={11}
                letterSpacing={1}
                textTransform="uppercase"
                color="$primary"
                fontWeight="700"
              >
                Quick Capture
              </Text>
              <Text fontSize={13} lineHeight={19} color="$colorMuted">
                Capture notes, voice snippets, reminders, and AI chat from one command surface.
              </Text>
            </YStack>
          </YStack>

          <YStack gap={8}>
            {NAV_ITEMS.map((item) => {
              const trigger = triggers.find((t) => t.name === item.name)!;
              const active = trigger.isFocused;
              return (
                <Pressable
                  key={item.name}
                  onPress={trigger.onPress}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingVertical: 14,
                    paddingHorizontal: 14,
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: active ? theme.primary.val + "22" : "transparent",
                    backgroundColor: active ? theme.primary.val + "12" : "transparent",
                  }}
                >
                  <YStack
                    width={36}
                    height={36}
                    borderRadius={12}
                    alignItems="center"
                    justifyContent="center"
                    backgroundColor={active ? theme.primary.val + "18" : theme.secondary.val}
                  >
                    <Feather
                      name={item.icon}
                      size={18}
                      color={active ? theme.primary.val : theme.colorMuted.val}
                    />
                  </YStack>
                  <YStack flex={1} gap={2}>
                    <Text
                      fontSize={15}
                      fontFamily="$body"
                      fontWeight={active ? "700" : "500"}
                      color={active ? "$primary" : "$color"}
                    >
                      {item.title}
                    </Text>
                    <Text fontSize={12} color="$colorMuted">
                      {item.title === "Home"
                        ? "Live memories and reminders"
                        : item.title === "Diary"
                          ? "Structured daily reflection"
                          : item.title === "Review"
                            ? "Spaced repetition queue"
                            : "Secondary pages and settings"}
                    </Text>
                  </YStack>
                </Pressable>
              );
            })}
          </YStack>

          <YStack flex={1} />

          <AppButton
            title="New Memory"
            onPress={openCommand}
            icon="plus"
            variant="gradient"
            fullWidth
          />
        </YStack>

        <YStack flex={1} padding={14}>
          <YStack
            flex={1}
            borderRadius={32}
            overflow="hidden"
            borderWidth={1}
            borderColor="$borderColor"
            backgroundColor="$background"
          >
            <TabSlot style={{ flex: 1, backgroundColor: theme.background.val }} />
          </YStack>
        </YStack>
      </XStack>
    </SafeAreaView>
  );
}

// ─── Root export ──────────────────────────────────────────────────────────────
// Single <Tabs> instance shared by both the mobile floating pill bar and the
// desktop sidebar, so route focus/switching always goes through one engine.

export default function TabLayout() {
  const isLargeScreen = useIsLargeScreen();

  return (
    <Tabs>
      <TabList style={styles.hiddenTabList}>
        {NAV_ITEMS.map((item) => (
          <TabTrigger
            key={item.name}
            name={item.name}
            href={item.name === "index" ? "/" : `/${item.name}`}
          />
        ))}
        {/* __fab.tsx exists for file-system routing but is not a nav tab */}
        <TabTrigger name="__fab" href="/__fab" />
      </TabList>
      {isLargeScreen ? <DesktopSidebarLayout /> : <MobileTabLayout />}
    </Tabs>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Route table only — the floating pill bar renders the real buttons.
  hiddenTabList: {
    display: "none",
  },
  // Outer shell: shadow only (no overflow:hidden — that breaks shadow on Android)
  outerContainer: {
    width: BAR_W,
    height: BAR_H,
    borderRadius: BAR_R,
    backgroundColor: "transparent",
  },
  // Inner shell: clips glass blur + border to pill shape
  innerContainer: {
    flex: 1,
    borderRadius: BAR_R,
    overflow: "hidden",
  },
  border: {
    borderRadius: BAR_R,
    borderWidth: 1,
  },
  row: {
    flex: 1,
    flexDirection: "row",
    paddingHorizontal: BAR_SIDE_PAD,
  },
  indicator: {
    position: "absolute",
    width: IND_W,
    height: IND_H,
    borderRadius: 999,
    left: 0,
  },
  tabItem: {
    width: SLOT_W,
    height: BAR_H,
    justifyContent: "center",
    alignItems: "center",
  },
  tabInner: {
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
  },
  tabLabel: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.1,
  },
  plusSlot: {
    width: SLOT_W,
    height: BAR_H,
    justifyContent: "center",
    alignItems: "center",
  },
  plusButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
});
