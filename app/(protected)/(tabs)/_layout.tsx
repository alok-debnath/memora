import { BlurView } from "expo-blur";
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { usePathname } from "expo-router";
import { Tabs, TabList, TabTrigger, TabSlot, useTabTrigger } from "expo-router/ui";
import { Feather } from "@/lib/icons";
import React, { useCallback, useEffect, useId, useMemo, useRef } from "react";
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

import { useBackdropBlurHost } from "@/components/ui/BackdropBlurProvider";
import { ProgressiveBlurFade } from "@/components/ui/ProgressiveBlurFade";
import { appShadow, withAlpha } from "@/components/ui/themeHelpers";
import { FontFamily } from "@/constants/fonts";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import { useThemeStore } from "@/store/theme";
import { useUIStore } from "@/store/ui";
import { COMMAND_ENTRY, PRIMARY_NAVIGATION } from "@/constants/appNavigation";
import { bottomNavigationLayout } from "@/constants/navigationLayout";
import { alphaGradients } from "@/constants/themePalettes";

// ─── Navigation items ─────────────────────────────────────────────────────────

type NavItemName = "index" | "timeline" | "diary" | "more";
const NAV_ITEMS = PRIMARY_NAVIGATION.map((item) => ({
  name: item.tabName as NavItemName,
  title: item.label,
  icon: item.icon,
  detail: item.detail,
}));

// ─── Bar geometry ─────────────────────────────────────────────────────────────

const BAR_W = 340;
const BAR_H = bottomNavigationLayout.barHeight;
const BAR_R = 999; // Large value -> OS clamps to true pill (height/2 each side)
const BAR_SIDE_PAD = 10; // Inner horizontal padding — pushes icons inward from edges
const CONTENT_W = BAR_W - BAR_SIDE_PAD * 2; // Usable width inside side padding
const SLOT_W = CONTENT_W / 5; // Slot width for each of 5 visual positions
const IND_PAD_Y = 8;
const IND_OVERLAP = 2;
const IND_W = SLOT_W + IND_OVERLAP * 2;
const IND_H = BAR_H - IND_PAD_Y * 2;
const IND_Y = IND_PAD_Y;
const FADE_H = bottomNavigationLayout.fadeHeight;
// Extra height the fading blur extends above the reserved strip, so the mask
// gradient has enough travel to read as a progressive defocus, not a hard edge.
const FADE_RAMP_OVERSHOOT = 48;
const BAR_BOTTOM_MARGIN = bottomNavigationLayout.bottomMargin;

// Maps state.index (0–3) → visual slot (0, 1, 3, 4) → indicator translateX
// The active capsule is centered on the slot.
const IND_X = [0, 1, 3, 4].map((slot) => BAR_SIDE_PAD + slot * SLOT_W + SLOT_W / 2 - IND_W / 2);

// Navigation keeps its original spring language. These values are intentionally
// local because they define the physical character of this one control.
const ANIM = {
  indicator: {
    damping: 30,
    stiffness: 270,
    mass: 0.8,
    overshootClamping: true,
  },
  focus: { damping: 22, stiffness: 280, overshootClamping: true },
  tabPressIn: { damping: 18, stiffness: 500, overshootClamping: true },
  tabPressOut: { damping: 18, stiffness: 320, overshootClamping: true },
  commandPressIn: { damping: 18, stiffness: 460, overshootClamping: true },
  commandPressOut: { damping: 20, stiffness: 340, overshootClamping: true },
  entrance: { damping: 28, stiffness: 220, overshootClamping: true },
} as const;

// ─── TabItem ──────────────────────────────────────────────────────────────────

type TabItemProps = {
  name: NavItemName;
  icon: React.ComponentProps<typeof Feather>["name"];
  title: string;
  isFocused: boolean;
  onSelect: (name: NavItemName) => void;
  primaryColor: string;
  mutedColor: string;
};

type NavTrigger = {
  name: NavItemName;
  isFocused: boolean;
  onPress: () => void;
};

type NavController = {
  activeName: NavItemName;
  selectTab: (name: NavItemName) => void;
  triggers: NavTrigger[];
};

type FloatingTabBarProps = {
  activeName: NavItemName;
  onSelectTab: (name: NavItemName) => void;
  onPressCommand: () => void;
  androidBlurTarget?: React.RefObject<View | null>;
  /** Blur the pill surface itself. Off = translucent tint only. */
  blurEnabled?: boolean;
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
  blurEnabled: boolean;
};

const TabItem = React.memo(function TabItem({
  name,
  icon,
  title,
  isFocused,
  onSelect,
  primaryColor,
  mutedColor,
}: TabItemProps) {
  const scale = useSharedValue(1);
  const labelOpacity = useSharedValue(isFocused ? 1 : 0);
  const labelY = useSharedValue(isFocused ? 0 : 5);
  const iconY = useSharedValue(isFocused ? -1 : 6);

  const handlePress = useCallback(() => {
    onSelect(name);
  }, [name, onSelect]);

  useEffect(() => {
    labelOpacity.value = withTiming(isFocused ? 1 : 0, { duration: 150 });
    labelY.value = withSpring(isFocused ? 0 : 5, ANIM.focus);
    iconY.value = withSpring(isFocused ? -1 : 6, ANIM.focus);
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
      onPress={handlePress}
      onPressIn={() => {
        scale.value = withSpring(0.96, ANIM.tabPressIn);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, ANIM.tabPressOut);
      }}
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
      accessibilityLabel={title}
      hitSlop={6}
      style={styles.tabItem}
    >
      <Animated.View style={[styles.tabInner, pressStyle]}>
        <Animated.View style={iconStyle}>
          <Feather name={icon} size={19} color={isFocused ? primaryColor : mutedColor} />
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
});

// ─── CommandButton ────────────────────────────────────────────────────────────

const CommandButton = React.memo(function CommandButton({
  onPress,
  primaryColor,
}: {
  onPress: () => void;
  primaryColor: string;
}) {
  const theme = useAppTheme();
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <View style={styles.commandSlot}>
      <Pressable
        onPress={onPress}
        onPressIn={() => {
          scale.value = withSpring(0.94, ANIM.commandPressIn);
        }}
        onPressOut={() => {
          scale.value = withSpring(1, ANIM.commandPressOut);
        }}
        accessibilityRole="button"
        accessibilityLabel={COMMAND_ENTRY.accessibilityLabel}
        hitSlop={8}
      >
        <Animated.View
          style={[
            styles.commandButton,
            {
              backgroundColor: primaryColor,
              borderColor: withAlpha(theme.textInverse.val, "24"),
            },
            appShadow(theme.shadowColor.val, "sm"),
            animStyle,
          ]}
        >
          <Feather name={COMMAND_ENTRY.icon} size={21} color={theme.textInverse.val} />
        </Animated.View>
      </Pressable>
    </View>
  );
});

// Maps route name → display index (0–3), ignoring hidden __fab route
const ROUTE_DISPLAY_INDEX: Record<string, number> = {
  index: 0,
  timeline: 1,
  diary: 2,
  more: 3,
};

const TabBarSurface = React.memo(function TabBarSurface({
  glassColor,
  overlayColor,
  androidFallbackColor,
  blurIntensity,
  isAndroid,
  isDark,
  useLiquidGlass,
  androidBlurTarget,
  blurEnabled,
}: TabBarSurfaceProps) {
  if (Platform.OS === "web") {
    return (
      <View
        style={[
          StyleSheet.absoluteFill,
          // @ts-ignore – web-only CSS property
          {
            backgroundColor: glassColor,
            backdropFilter: blurEnabled ? "blur(28px)" : undefined,
          },
        ]}
      />
    );
  }

  // Blur off: translucency only. Used when the pill sits inside the fading blur
  // strip, where a second blur pass would just double-cost the same pixels.
  if (!blurEnabled) {
    return (
      <>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: glassColor }]} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: overlayColor }]} />
      </>
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
});

function useIsNativeLiquidGlassEnabled() {
  return Platform.OS === "ios" && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
}

// ─── FloatingTabBar ───────────────────────────────────────────────────────────

function FloatingTabBar({
  activeName,
  onSelectTab,
  onPressCommand,
  androidBlurTarget,
  blurEnabled = false,
}: FloatingTabBarProps) {
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  const resolvedMode = useThemeStore((s) => s.resolvedMode);
  const isDark = resolvedMode === "dark";
  const isAndroid = Platform.OS === "android";
  const useLiquidGlass = useIsNativeLiquidGlassEnabled() && blurEnabled;

  const primaryColor = theme.primary.val;
  const mutedColor = theme.colorMuted.val;

  const displayIndex = ROUTE_DISPLAY_INDEX[activeName] ?? 0;

  // Sliding active indicator
  const indicatorX = useSharedValue(IND_X[displayIndex] ?? IND_X[0]);
  const capsuleScaleX = useSharedValue(1);
  const capsuleScaleY = useSharedValue(1);

  useEffect(() => {
    indicatorX.value = withSpring(IND_X[displayIndex] ?? IND_X[0], ANIM.indicator);
    capsuleScaleX.value = withSequence(
      withTiming(1.2, { duration: 90 }),
      withSpring(1, { damping: 18, stiffness: 250, overshootClamping: false }),
    );
    capsuleScaleY.value = withSequence(
      withTiming(0.84, { duration: 90 }),
      withSpring(1, { damping: 18, stiffness: 250, overshootClamping: false }),
    );
  }, [displayIndex]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: indicatorX.value },
      { scaleX: capsuleScaleX.value },
      { scaleY: capsuleScaleY.value },
    ],
  }));

  // Entrance: slide up from below on mount
  const barY = useSharedValue(100);
  const barOpacity = useSharedValue(0);

  useEffect(() => {
    barY.value = withSpring(0, ANIM.entrance);
    barOpacity.value = useLiquidGlass ? 1 : withTiming(1, { duration: 280 });
  }, [barOpacity, barY, useLiquidGlass]);

  const barEntranceStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: barY.value }],
    opacity: barOpacity.value,
  }));

  // Without a blur pass the surface has nothing to defocus behind it, so the
  // pill leans on opacity instead to stay legible over scrolling content.
  const surfaceAlpha = blurEnabled ? "86" : "C4";
  const glassColor = isDark
    ? withAlpha(theme.backgroundStrong.val, surfaceAlpha)
    : withAlpha(theme.surfaceElevated.val, surfaceAlpha);
  const overlayColor = withAlpha(theme.background.val, blurEnabled ? "18" : "10");
  const borderColor = isDark
    ? withAlpha(theme.borderColor.val, "5C")
    : withAlpha(theme.borderColor.val, "5C");
  const indicatorBg = isDark ? withAlpha(primaryColor, "1F") : withAlpha(primaryColor, "18");
  const indicatorBorder = isDark ? withAlpha(primaryColor, "2E") : withAlpha(primaryColor, "24");
  const blurIntensity = isDark ? 18 : 16;
  // Same alpha as glassColor so the real blur stays visible on Android in both
  // modes — a near-opaque fallback here used to mask the blur entirely in light mode.
  const androidFallbackColor = isDark
    ? withAlpha(theme.backgroundStrong.val, "82")
    : withAlpha(theme.surfaceElevated.val, "82");

  // Transparent wrapper tells React Navigation how much vertical space to reserve,
  // so screen content doesn't hide behind the floating pill.
  // alignItems: center handles horizontal centering — no position:absolute tricks needed.
  const bottomInset =
    (Platform.OS === "android"
      ? Math.max(insets.bottom, bottomNavigationLayout.androidInsetFloor)
      : insets.bottom + bottomNavigationLayout.insetGap) + BAR_BOTTOM_MARGIN;
  const containerHeight = BAR_H + bottomInset + FADE_H;

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
      }}
    >
      {/* Gradient-masked blur so content dissolves (and defocuses) behind the bar */}
      <ProgressiveBlurFade
        intensity={isDark ? 55 : 48}
        tintAlpha={isDark ? "F5" : "F0"}
        blurTarget={androidBlurTarget}
        // Ramp starts above the reserved strip so the blur has room to build;
        // purely visual, the layout reserve stays BAR_H + inset + FADE_H.
        style={{ top: -FADE_RAMP_OVERSHOOT }}
      />
      {/* The band the pill lives in: the pill, its side gutters, and the
          safe-area strip below. The transparent gradient below is what actually
          swallows touches here — a plain View gets flattened away on Android and
          stops being a touch target, so the hit box has to sit on a real native
          view (this is why the pre-blur code blocked with a LinearGradient).
          The fade ramp above this band stays pass-through. */}
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: BAR_H + bottomInset,
          alignItems: "center",
          justifyContent: "flex-start",
        }}
      >
        <LinearGradient
          colors={alphaGradients.invisible}
          style={StyleSheet.absoluteFill}
          pointerEvents="auto"
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
              useLiquidGlass={useLiquidGlass && blurEnabled}
              androidBlurTarget={androidBlurTarget}
              blurEnabled={blurEnabled}
            />

            {/* Border highlight */}
            {!useLiquidGlass ? (
              <View style={[StyleSheet.absoluteFill, styles.border, { borderColor }]} />
            ) : null}

            {/* Sliding active capsule */}
            <Animated.View
              style={[
                styles.indicator,
                { backgroundColor: indicatorBg, borderColor: indicatorBorder, top: IND_Y },
                indicatorStyle,
              ]}
            />

            {/* Tab items row */}
            <View style={styles.row}>
              {/* Home, Timeline */}
              {NAV_ITEMS.slice(0, 2).map((item) => {
                return (
                  <TabItem
                    key={item.name}
                    name={item.name}
                    icon={item.icon}
                    title={item.title}
                    isFocused={activeName === item.name}
                    onSelect={onSelectTab}
                    primaryColor={primaryColor}
                    mutedColor={mutedColor}
                  />
                );
              })}

              {/* Center command button */}
              <CommandButton onPress={onPressCommand} primaryColor={primaryColor} />

              {/* Journal, More */}
              {NAV_ITEMS.slice(2).map((item) => {
                return (
                  <TabItem
                    key={item.name}
                    name={item.name}
                    icon={item.icon}
                    title={item.title}
                    isFocused={activeName === item.name}
                    onSelect={onSelectTab}
                    primaryColor={primaryColor}
                    mutedColor={mutedColor}
                  />
                );
              })}
            </View>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

function isTabRootPath(pathname: string) {
  return (
    pathname === "/" ||
    pathname === "/index" ||
    pathname === "/timeline" ||
    pathname === "/diary" ||
    pathname === "/more"
  );
}

type MobileTabBarOverlayProps = {
  activeName: NavItemName;
  onSelectTab: (name: NavItemName) => void;
  onPressCommand: () => void;
  blurEnabled?: boolean;
};

function MobileTabBarOverlay({
  activeName,
  onSelectTab,
  onPressCommand,
  blurEnabled = false,
}: MobileTabBarOverlayProps) {
  const host = useBackdropBlurHost();
  const overlayId = useId();

  const overlayNode = useMemo(
    () => (
      <FloatingTabBar
        activeName={activeName}
        onSelectTab={onSelectTab}
        onPressCommand={onPressCommand}
        androidBlurTarget={host?.blurTargetRef}
        blurEnabled={blurEnabled}
      />
    ),
    [activeName, blurEnabled, host?.blurTargetRef, onPressCommand, onSelectTab],
  );

  useEffect(() => {
    if (!host) return;
    host.setOverlay(overlayId, overlayNode);
    return () => host.removeOverlay(overlayId);
  }, [host, overlayId, overlayNode]);

  if (host) return null;
  return overlayNode;
}

function useNavController(): NavController {
  const index = useTabTrigger({ name: "index" });
  const timeline = useTabTrigger({ name: "timeline" });
  const diary = useTabTrigger({ name: "diary" });
  const more = useTabTrigger({ name: "more" });
  const switchTabRef = useRef<Record<NavItemName, () => void>>({
    index: () => undefined,
    timeline: () => undefined,
    diary: () => undefined,
    more: () => undefined,
  });

  switchTabRef.current = {
    index: () => index.switchTab("index", {}),
    timeline: () => timeline.switchTab("timeline", {}),
    diary: () => diary.switchTab("diary", {}),
    more: () => more.switchTab("more", {}),
  };

  const activeName = useMemo<NavItemName>(() => {
    if (timeline.trigger?.isFocused) return "timeline";
    if (diary.trigger?.isFocused) return "diary";
    if (more.trigger?.isFocused) return "more";
    return "index";
  }, [diary.trigger?.isFocused, more.trigger?.isFocused, timeline.trigger?.isFocused]);

  const selectTab = useCallback((name: NavItemName) => {
    if (Platform.OS !== "web") {
      void Haptics.selectionAsync();
    }

    switchTabRef.current[name]();
  }, []);

  const triggers = useMemo(
    () => [
      {
        name: "index" as const,
        isFocused: index.trigger?.isFocused ?? false,
        onPress: () => selectTab("index"),
      },
      {
        name: "timeline" as const,
        isFocused: timeline.trigger?.isFocused ?? false,
        onPress: () => selectTab("timeline"),
      },
      {
        name: "diary" as const,
        isFocused: diary.trigger?.isFocused ?? false,
        onPress: () => selectTab("diary"),
      },
      {
        name: "more" as const,
        isFocused: more.trigger?.isFocused ?? false,
        onPress: () => selectTab("more"),
      },
    ],
    [
      diary.trigger?.isFocused,
      index.trigger?.isFocused,
      more.trigger?.isFocused,
      selectTab,
      timeline.trigger?.isFocused,
    ],
  );

  return useMemo(
    () => ({
      activeName,
      selectTab,
      triggers,
    }),
    [activeName, selectTab, triggers],
  );
}

// ─── Custom floating pill layout (mobile + web) ───────────────────────────────

function MobileTabLayout() {
  const theme = useAppTheme();
  const openCommand = useUIStore((s) => s.openCommand);
  const pathname = usePathname();
  const showTabBar = isTabRootPath(pathname);
  const { activeName, selectTab } = useNavController();

  const handlePressCommand = React.useCallback(() => {
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    openCommand();
  }, [openCommand]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background.val }} edges={["top"]}>
      <TabSlot style={{ flex: 1, backgroundColor: theme.background.val }} />
      {showTabBar ? (
        <MobileTabBarOverlay
          activeName={activeName}
          onSelectTab={selectTab}
          onPressCommand={handlePressCommand}
        />
      ) : null}
    </SafeAreaView>
  );
}

// ─── Root export ──────────────────────────────────────────────────────────────
// The Tabs instance owns route state. The protected layout owns medium/wide
// navigation so tab and secondary routes share one stable application shell.

export default function TabLayout() {
  const { navigationMode } = useResponsiveLayout();

  return (
    <Tabs>
      <TabList style={styles.hiddenTabList}>
        {NAV_ITEMS.map((item) => (
          <TabTrigger
            key={item.name}
            name={item.name}
            href={item.name === "index" ? "/" : item.name === "diary" ? "/diary" : `/${item.name}`}
          />
        ))}
        {/* __fab.tsx exists for file-system routing but is not a nav tab */}
        <TabTrigger name="__fab" href="/__fab" />
      </TabList>
      {navigationMode === "bottom" ? <MobileTabLayout /> : <TabSlot style={{ flex: 1 }} />}
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
    borderWidth: 1,
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
  commandSlot: {
    width: SLOT_W,
    height: BAR_H,
    justifyContent: "center",
    alignItems: "center",
  },
  commandButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
});
