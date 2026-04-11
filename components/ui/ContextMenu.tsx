/**
 * ContextMenu
 *
 * iOS-style long-press (or tap) context menu overlay.
 * Measures the trigger's position, floats a preview card to center,
 * and shows a menu list below it — all inside a native Modal with blur backdrop.
 *
 * Usage:
 *   <ContextMenu items={[...]} onPress={onPress}>
 *     <MyCard />
 *   </ContextMenu>
 *
 *   // Custom preview in the overlay:
 *   <ContextMenu preview={<MyCard showActions={false} />} items={[...]} onPress={onPress}>
 *     <MyCard showActions />
 *   </ContextMenu>
 *
 *   // Trigger on tap instead of long press:
 *   <ContextMenu openOn="press" items={[...]}>
 *     <MyCard />
 *   </ContextMenu>
 */

import React, { useState, useRef, useCallback, useImperativeHandle, useMemo } from "react";
import {
  Modal,
  Pressable,
  Platform,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { Feather } from "@expo/vector-icons";
import { XStack, YStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useThemeStore } from "@/store/theme";
import { withAlpha } from "./themeHelpers";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ContextMenuHandle {
  /** Imperatively open the menu (same as user tapping with openOn="press"). */
  open: () => void;
}

export interface ContextMenuItemDef {
  label: string;
  icon: string;
  iconColor?: string;
  destructive?: boolean;
  onPress: () => void;
}

export interface ContextMenuProps {
  children: React.ReactNode;
  preview?: React.ReactNode;
  items: (ContextMenuItemDef | null | undefined | false)[];
  onPress?: () => void;
  openOn?: "longPress" | "press";
  /** Minimum width of the floating preview card (defaults to trigger width). */
  previewMinWidth?: number;
  /** When true, the floating preview gets a fixed outer card frame. */
  previewFrame?: boolean;
}

const PREVIEW_RADIUS = 18;
const PREVIEW_BORDER_WIDTH = 1;

function PreviewSurface({
  maxHeight,
  framed,
  backgroundColor,
  borderColor,
  children,
}: {
  maxHeight: number;
  framed: boolean;
  backgroundColor: string;
  borderColor: string;
  children: React.ReactNode;
}) {
  return (
    <View
      style={[
        {
          maxHeight,
          borderRadius: PREVIEW_RADIUS,
          overflow: "hidden",
          backgroundColor,
        },
        framed
          ? {
              borderWidth: PREVIEW_BORDER_WIDTH,
              borderColor,
            }
          : null,
      ]}
    >
      {children}
    </View>
  );
}

// ─── Menu item ────────────────────────────────────────────────────────────────

function MenuItem({
  item,
  closeMenu,
}: {
  item: ContextMenuItemDef;
  closeMenu: () => void;
}) {
  const theme = useAppTheme();
  return (
    <Pressable
      onPress={() => {
        closeMenu();
        item.onPress();
      }}
    >
      {({ pressed }) => (
        <XStack
          alignItems="center"
          justifyContent="space-between"
          paddingHorizontal={16}
          paddingVertical={14}
          backgroundColor={pressed ? "$secondary" : "$card"}
        >
          <Text
            fontSize={15}
            fontFamily="$body"
            fontWeight="500"
            color={item.destructive ? theme.destructive.val : "$color"}
          >
            {item.label}
          </Text>
          <Feather
            name={item.icon as any}
            size={18}
            color={
              item.destructive
                ? theme.destructive.val
                : (item.iconColor ?? theme.color.val)
            }
          />
        </XStack>
      )}
    </Pressable>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export const ContextMenu = React.forwardRef<ContextMenuHandle, ContextMenuProps>(function ContextMenu({
  children,
  preview,
  items,
  onPress,
  openOn = "longPress",
  previewMinWidth,
  previewFrame = false,
}: ContextMenuProps, ref) {
  const theme = useAppTheme();
  const { resolvedMode } = useThemeStore();
  const cardRef = useRef<View>(null);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const [menuVisible, setMenuVisible] = useState(false);

  // Pre-measured position stored synchronously on pressIn.
  // This is the key fix: measure() is async, so we can't call it inside openMenu
  // (which fires on longPress while finger is still held) — by then the callback
  // would resolve after release. Pre-measuring on pressIn ensures the position is
  // already available when longPress fires.
  const storedPos = useRef({ x: 0, y: 0, width: 0, height: 0 });

  const progress = useSharedValue(0);
  const triggerScale = useSharedValue(1);
  const cardX = useSharedValue(0);
  const cardY = useSharedValue(0);
  const cardW = useSharedValue(0);
  const cardH = useSharedValue(0);
  const winW = useSharedValue(windowWidth);
  const winH = useSharedValue(windowHeight);

  const handlePressIn = useCallback(() => {
    triggerScale.value = withTiming(0.96, { duration: 120 });
    // Kick off measure immediately — will be ready long before longPress threshold
    cardRef.current?.measure((_, __, width, height, pageX, pageY) => {
      storedPos.current = { x: pageX, y: pageY, width, height };
    });
  }, []);

  const handlePressOut = useCallback(() => {
    triggerScale.value = withTiming(1, { duration: 120 });
  }, []);

  const doOpen = useCallback(
    (x: number, y: number, width: number, height: number) => {
      cardX.value = x;
      cardY.value = y;
      cardW.value = width;
      cardH.value = height;
      winW.value = windowWidth;
      winH.value = windowHeight;
      setMenuVisible(true);
      progress.value = withSpring(1, { damping: 32, stiffness: 320 });
    },
    [windowWidth, windowHeight],
  );

  // Long-press path: pre-measured on pressIn (350 ms of lead time), use synchronously
  // so the overlay appears while the finger is still held down.
  const openMenuOnLongPress = useCallback(() => {
    if (Platform.OS === "web") return;
    triggerScale.value = withTiming(1, { duration: 80 });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const { x, y, width, height } = storedPos.current;
    doOpen(x, y, width, height);
  }, [doOpen]);

  // Press path: user has already released by the time onPress fires, so async
  // measure is fine and gives the correct page coordinates.
  const openMenuOnPress = useCallback(() => {
    if (Platform.OS === "web") return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    cardRef.current?.measure((_, __, width, height, pageX, pageY) => {
      doOpen(pageX, pageY, width, height);
    });
  }, [doOpen]);

  const closeMenu = useCallback(() => {
    progress.value = withTiming(0, { duration: 200 }, () => {
      runOnJS(setMenuVisible)(false);
    });
  }, []);

  useImperativeHandle(ref, () => ({ open: openMenuOnPress }), [openMenuOnPress]);

  // ── Animated styles ───────────────────────────────────────────────────────

  const triggerScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: triggerScale.value }],
  }));

  const minW = previewMinWidth ?? 0;
  const animatedCardStyle = useAnimatedStyle(() => {
    "worklet";
    const effectiveW = cardW.value < minW ? minW : cardW.value;
    const targetLeft = (winW.value - effectiveW) / 2;
    const targetTop = winH.value * 0.36 - cardH.value / 2;
    return {
      position: "absolute" as const,
      width: effectiveW,
      left: cardX.value + (targetLeft - cardX.value) * progress.value,
      top: cardY.value + (targetTop - cardY.value) * progress.value,
      transform: [{ scale: 1 + progress.value * 0.03 }],
    };
  });

  const animatedBgStyle = useAnimatedStyle(() => {
    "worklet";
    return { opacity: progress.value };
  });

  const animatedMenuStyle = useAnimatedStyle(() => {
    "worklet";
    return {
      opacity: progress.value,
      transform: [{ translateY: (1 - progress.value) * 16 }],
    };
  });

  // ── Resolved values ───────────────────────────────────────────────────────

  const validItems = useMemo(
    () => items.filter(Boolean) as ContextMenuItemDef[],
    [items],
  );
  const overlayPreview = preview ?? children;
  const previewMaxHeight = useMemo(
    () => Math.max(
      180,
      Math.min(
        windowHeight * (validItems.length > 0 ? 0.38 : 0.48),
        windowHeight - 220,
      ),
    ),
    [validItems.length, windowHeight],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <View ref={cardRef} collapsable={false} style={{ opacity: menuVisible ? 0 : 1 }}>
        {/*
          Plain Pressable (NOT AnimatedPressable) — AnimatedPressable can cause
          longPress to fire on release in some RN versions. Scale lives in the
          wrapping Animated.View so they don't interfere.
        */}
        <Animated.View style={triggerScaleStyle}>
          <Pressable
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            onPress={openOn === "press" ? openMenuOnPress : onPress}
            onLongPress={openMenuOnLongPress}
            delayLongPress={350}
          >
            {children}
          </Pressable>
        </Animated.View>
      </View>

      {Platform.OS !== "web" && (
        <Modal
          visible={menuVisible}
          transparent
          animationType="none"
          statusBarTranslucent
          onRequestClose={closeMenu}
        >
          <Animated.View style={[StyleSheet.absoluteFill, animatedBgStyle]}>
            <BlurView
              intensity={resolvedMode === "dark" ? 80 : 60}
              tint={resolvedMode === "dark" ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor:
                    resolvedMode === "dark"
                      ? withAlpha(theme.shadowColor.val, "8C")
                      : withAlpha(theme.shadowColor.val, "4D"),
                },
              ]}
              pointerEvents="none"
            />
            <Pressable style={StyleSheet.absoluteFill} onPress={closeMenu} />

            <Animated.View style={animatedCardStyle}>
              <PreviewSurface
                maxHeight={previewMaxHeight}
                framed={previewFrame}
                backgroundColor={theme.card.val}
                borderColor={theme.borderColor.val}
              >
                <ScrollView
                  style={{ maxHeight: previewMaxHeight }}
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                  directionalLockEnabled
                  contentContainerStyle={{ flexGrow: 1 }}
                >
                  {overlayPreview}
                </ScrollView>
              </PreviewSurface>

              {validItems.length > 0 && (
                <Animated.View
                  style={[animatedMenuStyle, { marginTop: 12 }]}
                  pointerEvents="box-none"
                >
                  <YStack
                    borderRadius={14}
                    overflow="hidden"
                    borderWidth={StyleSheet.hairlineWidth}
                    borderColor="$borderColor"
                  >
                    {validItems.map((item, i) => (
                      <React.Fragment key={i}>
                        <MenuItem item={item} closeMenu={closeMenu} />
                        {i < validItems.length - 1 && (
                          <YStack height={1} backgroundColor="$borderColor" />
                        )}
                      </React.Fragment>
                    ))}
                  </YStack>
                </Animated.View>
              )}
            </Animated.View>
          </Animated.View>
        </Modal>
      )}
    </>
  );
});

const styles = StyleSheet.create({});
