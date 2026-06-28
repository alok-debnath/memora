import React, {
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  BackHandler,
  Pressable,
  Platform,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
import * as Haptics from "expo-haptics";
import Animated, {
  type AnimatedStyle,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { Feather } from "@/lib/icons";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useThemeStore } from "@/store/theme";
import { Text, XStack, YStack } from "tamagui";
import { useBackdropBlurHost } from "./BackdropBlurProvider";
import { withAlpha } from "./themeHelpers";
import {
  ContextMenuHandle,
  type ContextMenuItemDef,
  type ContextMenuProps,
} from "./ContextMenu.shared";
import type { AppTheme } from "@/hooks/useAppTheme";

const PREVIEW_RADIUS = 18;
const PREVIEW_BORDER_WIDTH = 1;
const MENU_STACK_GAP = 10;
const MENU_MIN_WIDTH = 232;
const MENU_MAX_WIDTH = 304;
const PREVIEW_MIN_WIDTH = 280;
const PREVIEW_DEFAULT_WIDTH = 320;
const PREVIEW_MAX_WIDTH = 380;
const BLUR_INTENSITY_LIGHT = 36;
const BLUR_INTENSITY_DARK = 44;
const SCREEN_MARGIN = 12;
const PREVIEW_SCREEN_MARGIN = 20;

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type LayoutMetrics = {
  effectiveWidth: number;
  previewWidth: number;
  menuWidth: number;
  previewMaxHeight: number;
  targetLeft: number;
  targetTop: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

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

function MenuItem({ item, closeMenu }: { item: ContextMenuItemDef; closeMenu: () => void }) {
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
          minHeight={52}
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
            name={item.icon}
            size={18}
            color={item.destructive ? theme.destructive.val : (item.iconColor ?? theme.color.val)}
          />
        </XStack>
      )}
    </Pressable>
  );
}

const ContextMenuOverlay = React.memo(function ContextMenuOverlay({
  animatedBackdropStyle,
  animatedCardStyle,
  animatedMenuStyle,
  blurTargetRef,
  closeMenu,
  overlayPreview,
  previewWidth,
  menuWidth,
  previewFrame,
  previewMaxHeight,
  resolvedMode,
  theme,
  validItems,
}: {
  animatedBackdropStyle: AnimatedStyle<ViewStyle>;
  animatedCardStyle: AnimatedStyle<ViewStyle>;
  animatedMenuStyle: AnimatedStyle<ViewStyle>;
  blurTargetRef?: React.RefObject<View | null>;
  closeMenu: () => void;
  overlayPreview: React.ReactNode | null;
  previewWidth: number;
  menuWidth: number;
  previewFrame: boolean;
  previewMaxHeight: number;
  resolvedMode: "light" | "dark";
  theme: AppTheme;
  validItems: ContextMenuItemDef[];
}) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, animatedBackdropStyle]}>
        <BlurView
          intensity={resolvedMode === "dark" ? BLUR_INTENSITY_DARK : BLUR_INTENSITY_LIGHT}
          tint={resolvedMode === "dark" ? "dark" : "light"}
          blurMethod={Platform.OS === "android" ? "dimezisBlurViewSdk31Plus" : undefined}
          blurTarget={Platform.OS === "android" ? blurTargetRef : undefined}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor:
                resolvedMode === "dark"
                  ? withAlpha(theme.shadowColor.val, "4D")
                  : withAlpha(theme.shadowColor.val, "24"),
            },
          ]}
          pointerEvents="none"
        />
        <Pressable style={StyleSheet.absoluteFill} onPress={closeMenu} />

        <Animated.View style={animatedCardStyle}>
          {overlayPreview ? (
            <View style={{ width: previewWidth, alignSelf: "center" }}>
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
            </View>
          ) : null}

          {validItems.length > 0 && (
            <Animated.View
              style={[
                animatedMenuStyle,
                {
                  marginTop: overlayPreview ? MENU_STACK_GAP : 0,
                  width: menuWidth,
                  alignSelf: "center",
                },
              ]}
              pointerEvents="box-none"
            >
              <YStack
                borderRadius={14}
                overflow="hidden"
                borderWidth={StyleSheet.hairlineWidth}
                borderColor="$borderColor"
                backgroundColor="$card"
                style={{
                  shadowColor: theme.shadowColor.val,
                  shadowOpacity: resolvedMode === "dark" ? 0.2 : 0.12,
                  shadowRadius: 16,
                  shadowOffset: { width: 0, height: 10 },
                  elevation: 8,
                }}
              >
                {validItems.map((item, index) => (
                  <React.Fragment key={`${item.label}-${index}`}>
                    <MenuItem item={item} closeMenu={closeMenu} />
                    {index < validItems.length - 1 && (
                      <YStack height={1} backgroundColor="$borderColor" />
                    )}
                  </React.Fragment>
                ))}
              </YStack>
            </Animated.View>
          )}
        </Animated.View>
      </Animated.View>
    </View>
  );
});

export const ContextMenu = React.forwardRef<ContextMenuHandle, ContextMenuProps>(
  function ContextMenu(
    {
      children,
      preview,
      items,
      onPress,
      openOn = "longPress",
      previewMinWidth,
      previewFrame = false,
    }: ContextMenuProps,
    ref,
  ) {
    const theme = useAppTheme();
    const { resolvedMode } = useThemeStore();
    const host = useBackdropBlurHost();
    const overlayId = useId();
    const cardRef = useRef<View>(null);
    const { width: windowWidth, height: windowHeight } = useWindowDimensions();
    const [menuVisible, setMenuVisible] = useState(false);
    const [anchorRect, setAnchorRect] = useState<Rect | null>(null);

    const storedPos = useRef<Rect>({ x: 0, y: 0, width: 0, height: 0 });

    const cardProgress = useSharedValue(0);
    const backdropProgress = useSharedValue(0);
    const triggerScale = useSharedValue(1);
    const cardX = useSharedValue(0);
    const cardY = useSharedValue(0);
    const cardW = useSharedValue(0);
    const cardH = useSharedValue(0);
    const winW = useSharedValue(windowWidth);
    const winH = useSharedValue(windowHeight);

    const measureTrigger = useCallback((callback: (rect: Rect) => void) => {
      cardRef.current?.measureInWindow((x, y, width, height) => {
        const rect = { x, y, width, height };
        storedPos.current = rect;
        callback(rect);
      });
    }, []);

    const handlePressIn = useCallback(() => {
      triggerScale.value = withTiming(0.96, { duration: 120 });
      measureTrigger(() => {});
    }, [measureTrigger, triggerScale]);

    const handlePressOut = useCallback(() => {
      triggerScale.value = withTiming(1, { duration: 120 });
    }, []);

    const doOpen = useCallback(
      (rect: Rect) => {
        cardX.value = rect.x;
        cardY.value = rect.y;
        cardW.value = rect.width;
        cardH.value = rect.height;
        winW.value = windowWidth;
        winH.value = windowHeight;
        setAnchorRect(rect);
        setMenuVisible(true);
        backdropProgress.value = withTiming(1, { duration: 240 });
        cardProgress.value = withSpring(1, {
          damping: 36,
          stiffness: 260,
          mass: 0.9,
        });
      },
      [backdropProgress, cardProgress, windowHeight, windowWidth],
    );

    const openMenuOnLongPress = useCallback(() => {
      triggerScale.value = withTiming(1, { duration: 80 });
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      doOpen(storedPos.current);
    }, [doOpen, triggerScale]);

    const openMenuOnPress = useCallback(() => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      measureTrigger(doOpen);
    }, [doOpen, measureTrigger]);

    const closeMenu = useCallback(() => {
      backdropProgress.value = withTiming(0, { duration: 220 });
      cardProgress.value = withTiming(0, { duration: 180 }, () => {
        runOnJS(setMenuVisible)(false);
        runOnJS(setAnchorRect)(null);
      });
    }, [backdropProgress, cardProgress]);

    useImperativeHandle(ref, () => ({ open: openMenuOnPress, close: closeMenu }), [
      closeMenu,
      openMenuOnPress,
    ]);

    const triggerScaleStyle = useAnimatedStyle(() => ({
      transform: [{ scale: triggerScale.value }],
    }));

    const overlayPreview = preview ?? (openOn === "longPress" ? children : null);
    const hasPreview = !!overlayPreview;
    const validItems = useMemo(() => items.filter(Boolean) as ContextMenuItemDef[], [items]);
    const layoutMetrics = useMemo<LayoutMetrics>(() => {
      const rect = anchorRect ?? storedPos.current;
      const safeMenuWidth = Math.min(
        windowWidth - SCREEN_MARGIN * 2,
        Math.max(MENU_MIN_WIDTH, Math.min(MENU_MAX_WIDTH, windowWidth - 48)),
      );
      const safePreviewWidth = Math.min(
        windowWidth - PREVIEW_SCREEN_MARGIN * 2,
        Math.min(
          PREVIEW_MAX_WIDTH,
          Math.max(previewMinWidth ?? PREVIEW_DEFAULT_WIDTH, PREVIEW_MIN_WIDTH, rect.width || 0),
        ),
      );
      const effectiveWidth = hasPreview ? Math.max(safePreviewWidth, safeMenuWidth) : safeMenuWidth;
      const triggerCenterX = rect.x + rect.width / 2;

      const unclampedLeft = hasPreview
        ? triggerCenterX - effectiveWidth / 2
        : triggerCenterX - safeMenuWidth / 2;
      const targetLeft = clamp(
        unclampedLeft,
        SCREEN_MARGIN,
        windowWidth - SCREEN_MARGIN - effectiveWidth,
      );

      if (!hasPreview) {
        const estimatedMenuHeight = Math.max(56, validItems.length * 53);
        const spaceBelow = windowHeight - (rect.y + rect.height) - SCREEN_MARGIN;
        const targetTop =
          spaceBelow >= estimatedMenuHeight + 8
            ? rect.y + rect.height + 8
            : Math.max(SCREEN_MARGIN, rect.y - estimatedMenuHeight - 8);

        return {
          effectiveWidth,
          previewWidth: safePreviewWidth,
          menuWidth: safeMenuWidth,
          previewMaxHeight: 0,
          targetLeft,
          targetTop,
        };
      }

      const spaceAbove = rect.y - SCREEN_MARGIN;
      const spaceBelow = windowHeight - (rect.y + rect.height) - SCREEN_MARGIN;
      const previewMaxHeight = Math.max(
        180,
        Math.min(
          windowHeight * (validItems.length > 0 ? 0.38 : 0.5),
          Math.max(spaceAbove, spaceBelow) - 16,
        ),
      );
      const estimatedMenuHeight =
        validItems.length > 0 ? validItems.length * 53 + MENU_STACK_GAP : 0;
      const stackHeight = previewMaxHeight + estimatedMenuHeight;
      const preferredTop = rect.y + rect.height / 2 - stackHeight * 0.38;
      const targetTop = clamp(
        preferredTop,
        SCREEN_MARGIN,
        Math.max(SCREEN_MARGIN, windowHeight - SCREEN_MARGIN - stackHeight),
      );

      return {
        effectiveWidth,
        previewWidth: safePreviewWidth,
        menuWidth: safeMenuWidth,
        previewMaxHeight,
        targetLeft,
        targetTop,
      };
    }, [anchorRect, hasPreview, previewMinWidth, validItems.length, windowHeight, windowWidth]);

    const animatedCardStyle = useAnimatedStyle(() => {
      "worklet";

      return {
        position: "absolute" as const,
        width: layoutMetrics.effectiveWidth,
        left: cardX.value + (layoutMetrics.targetLeft - cardX.value) * cardProgress.value,
        top: cardY.value + (layoutMetrics.targetTop - cardY.value) * cardProgress.value,
        opacity: 0.82 + cardProgress.value * 0.18,
        transform: [
          { translateY: (1 - cardProgress.value) * 8 },
          { scale: 0.985 + cardProgress.value * 0.015 },
        ],
      };
    }, [layoutMetrics.effectiveWidth, layoutMetrics.targetLeft, layoutMetrics.targetTop]);

    const animatedBgStyle = useAnimatedStyle(() => ({
      opacity: backdropProgress.value,
    }));

    const animatedMenuStyle = useAnimatedStyle(() => ({
      opacity: cardProgress.value,
      transform: [{ translateY: (1 - cardProgress.value) * 10 }],
    }));

    useEffect(() => {
      if (!menuVisible || Platform.OS !== "android") return;

      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        closeMenu();
        return true;
      });

      return () => sub.remove();
    }, [closeMenu, menuVisible]);

    const overlayNode = useMemo(() => {
      if (!menuVisible) return null;

      return (
        <ContextMenuOverlay
          animatedBackdropStyle={animatedBgStyle}
          animatedCardStyle={animatedCardStyle}
          animatedMenuStyle={animatedMenuStyle}
          blurTargetRef={host?.blurTargetRef}
          closeMenu={closeMenu}
          overlayPreview={overlayPreview}
          previewWidth={layoutMetrics.previewWidth}
          menuWidth={layoutMetrics.menuWidth}
          previewFrame={previewFrame}
          previewMaxHeight={layoutMetrics.previewMaxHeight}
          resolvedMode={resolvedMode}
          theme={theme}
          validItems={validItems}
        />
      );
    }, [
      animatedBgStyle,
      animatedCardStyle,
      animatedMenuStyle,
      layoutMetrics.menuWidth,
      layoutMetrics.previewMaxHeight,
      layoutMetrics.previewWidth,
      closeMenu,
      host?.blurTargetRef,
      menuVisible,
      overlayPreview,
      previewFrame,
      resolvedMode,
      theme,
      validItems,
    ]);

    useEffect(() => {
      if (!host) return;
      if (!overlayNode) {
        host.removeOverlay(overlayId);
        return;
      }
      host.setOverlay(overlayId, overlayNode);
      return () => host.removeOverlay(overlayId);
    }, [host, overlayId, overlayNode]);

    return (
      <>
        <View
          ref={cardRef}
          collapsable={false}
          style={{ opacity: menuVisible && openOn === "longPress" && !preview ? 0 : 1 }}
        >
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
      </>
    );
  },
);

export type { ContextMenuHandle, ContextMenuItemDef, ContextMenuProps } from "./ContextMenu.shared";
