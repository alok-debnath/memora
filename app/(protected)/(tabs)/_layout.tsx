import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Tabs, useRouter, usePathname, Slot } from "expo-router";
import { Feather } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import React, { useEffect, useRef } from "react";
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

// ─── LiquidGlassTabBar ────────────────────────────────────────────────────────

function LiquidGlassTabBar({
  state,
  navigation,
  onPressAdd,
}: BottomTabBarProps & { onPressAdd: () => void }) {
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  const resolvedMode = useThemeStore((s) => s.resolvedMode);
  const isDark = resolvedMode === "dark";
  const isWeb = Platform.OS === "web";

  const primaryColor = theme.primary.val;
  const mutedColor = theme.colorMuted.val;

  // Active route name (stable key, immune to __fab shifting raw indices)
  const activeRouteName = state.routes[state.index]?.name ?? "";
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
    barOpacity.value = withTiming(1, { duration: 280 });
    isMounted.current = true;
  }, []);

  // Single animated style merges entrance + pulse transforms so they don't clobber each other
  const barEntranceStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: barY.value }, { scale: barScale.value }],
    opacity: barOpacity.value,
  }));

  const glassColor = isDark ? theme.backgroundStrong.val + "D9" : theme.backgroundStrong.val + "D1";
  const overlayColor = isDark ? theme.background.val + "47" : theme.background.val + "61";
  const borderColor = isDark ? theme.borderColor.val + "5C" : theme.borderColor.val + "47";
  const indicatorBg = primaryColor + "22"; // ~13% opacity tint

  const handleTabPress = (routeName: string) => {
    if (Platform.OS !== "web") {
      Haptics.selectionAsync();
    }
    const route = state.routes.find((r) => r.name === routeName);
    if (!route) return;
    const event = navigation.emit({
      type: "tabPress",
      target: route.key,
      canPreventDefault: true,
    });
    if (activeRouteName !== routeName && !event.defaultPrevented) {
      navigation.navigate(routeName);
    }
  };

  // Transparent wrapper tells React Navigation how much vertical space to reserve,
  // so screen content doesn't hide behind the floating pill.
  // alignItems: center handles horizontal centering — no position:absolute tricks needed.
  const bottomInset =
    (Platform.OS === "android" ? Math.max(insets.bottom, 8) : insets.bottom + 8) +
    BAR_BOTTOM_MARGIN;
  const containerHeight = BAR_H + bottomInset + FADE_H;
  const fadeColors = React.useMemo(() => {
    // Multi-stop ease-in curve to eliminate banding
    const c = isDark ? "0,0,0" : "255,255,255";
    return [
      `rgba(${c},0)`,
      `rgba(${c},0.05)`,
      `rgba(${c},0.13)`,
      `rgba(${c},0.25)`,
      `rgba(${c},0.42)`,
      `rgba(${c},0.60)`,
      `rgba(${c},0.75)`,
      `rgba(${c},0.85)`,
    ] as string[];
  }, [isDark]);

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
        style={[styles.outerContainer, { shadowColor: theme.shadowColor.val }, barEntranceStyle]}
      >
        <View style={styles.innerContainer}>
          {/* Glass background */}
          {isWeb ? (
            // Web: CSS backdrop-filter blur
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
          ) : Platform.OS === "ios" ? (
            // iOS: BlurView renders beautifully
            <>
              <BlurView
                style={StyleSheet.absoluteFill}
                intensity={isDark ? 90 : 78}
                tint={isDark ? "dark" : "light"}
              />
              <View style={[StyleSheet.absoluteFill, { backgroundColor: overlayColor }]} />
            </>
          ) : (
            // Android: BlurView is unreliable — use high-opacity solid background
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor: theme.backgroundStrong.val + "F7",
                },
              ]}
            />
          )}

          {/* Border highlight */}
          <View style={[StyleSheet.absoluteFill, styles.border, { borderColor }]} />

          {/* Sliding active indicator pill */}
          <Animated.View
            style={[styles.indicator, { backgroundColor: indicatorBg, top: IND_Y }, indicatorStyle]}
          />

          {/* Tab items row */}
          <View style={styles.row}>
            {/* Home, Diary */}
            {NAV_ITEMS.slice(0, 2).map((item) => (
              <TabItem
                key={item.name}
                icon={item.icon}
                title={item.title}
                isFocused={activeRouteName === item.name}
                onPress={() => handleTabPress(item.name)}
                primaryColor={primaryColor}
                mutedColor={mutedColor}
              />
            ))}

            {/* Center + button */}
            <PlusButton onPress={onPressAdd} primaryColor={primaryColor} />

            {/* Review, More */}
            {NAV_ITEMS.slice(2).map((item) => (
              <TabItem
                key={item.name}
                icon={item.icon}
                title={item.title}
                isFocused={activeRouteName === item.name}
                onPress={() => handleTabPress(item.name)}
                primaryColor={primaryColor}
                mutedColor={mutedColor}
              />
            ))}
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

// ─── Custom floating pill layout (mobile + web) ───────────────────────────────

function CustomTabLayout() {
  const theme = useAppTheme();
  const openCommand = useUIStore((s) => s.openCommand);

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: theme.background.val },
          // Prevent React Navigation from rendering its own opaque tab bar background
          tabBarStyle: {
            position: "absolute",
            backgroundColor: "transparent",
            borderTopWidth: 0,
            elevation: 0,
            shadowOpacity: 0,
            shadowRadius: 0,
            height: 0,
          },
        }}
        tabBar={(props) => (
          <LiquidGlassTabBar
            {...props}
            onPressAdd={() => {
              if (Platform.OS !== "web") {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              }
              openCommand();
            }}
          />
        )}
      >
        {NAV_ITEMS.map((item) => (
          <Tabs.Screen key={item.name} name={item.name} options={{ title: item.title }} />
        ))}
        {/* __fab.tsx exists for file-system routing but is not a nav tab */}
        <Tabs.Screen name="__fab" options={{ href: null }} />
      </Tabs>
    </>
  );
}

// ─── Desktop sidebar layout ───────────────────────────────────────────────────

function DesktopSidebarLayout() {
  const theme = useAppTheme();
  const router = useRouter();
  const pathname = usePathname();
  const openCommand = useUIStore((s) => s.openCommand);

  const isActive = (name: string) => {
    if (name === "index") return pathname === "/" || pathname === "/index";
    return pathname === `/${name}` || pathname.startsWith(`/${name}/`);
  };

  const navigateTo = (name: string) => {
    const path = name === "index" ? "/" : `/${name}`;
    (router.navigate as (href: string) => void)(path);
  };

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
              const active = isActive(item.name);
              return (
                <Pressable
                  key={item.name}
                  onPress={() => navigateTo(item.name)}
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
            <Slot />
          </YStack>
        </YStack>
      </XStack>
    </SafeAreaView>
  );
}

// ─── Root export ──────────────────────────────────────────────────────────────

export default function TabLayout() {
  const isLargeScreen = useIsLargeScreen();

  if (isLargeScreen) return <DesktopSidebarLayout />;
  return <CustomTabLayout />;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Outer shell: shadow only (no overflow:hidden — that breaks shadow on Android)
  outerContainer: {
    width: BAR_W,
    height: BAR_H,
    borderRadius: BAR_R,
    backgroundColor: "transparent",
    // iOS / web shadow
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    // Android elevation
    elevation: 0,
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
