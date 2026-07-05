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
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  type AnimatedStyle,
  makeMutable,
  measure,
  runOnJS,
  runOnUI,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@/lib/icons";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useThemeStore } from "@/store/theme";
import { useUIStore } from "@/store/ui";
import { Text, XStack, YStack } from "tamagui";
import { useTopOverlayHost } from "./BackdropBlurProvider";
import { appShadow, withAlpha } from "./themeHelpers";
import {
  ContextMenuHandle,
  type ContextMenuItemDef,
  type ContextMenuProps,
  useContextMenuSheetId,
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
const BOTTOM_FLOAT_MARGIN = 24;
const LONG_PRESS_MIN_DURATION = 350;
const TAP_MOVE_TOLERANCE = 8;
const TRIGGER_PRESS_SCALE = 0.96;
const CARD_SPRING = { damping: 36, stiffness: 260, mass: 0.9 } as const;

/**
 * Shared across every ContextMenu trigger on screen. Each trigger's gesture
 * runs on its own native GestureDetector recognizer, which does not defer to
 * whatever is visually stacked on top of it the way a plain Pressable would —
 * so without this guard, dismissing one menu via the backdrop could land a
 * second tap on an unrelated trigger underneath it. Every gesture callback
 * below no-ops while this is nonzero.
 *
 * This only covers other ContextMenu triggers; app sheets/modals are a
 * separate concern handled per-instance via `anySheetOpen` + `.enabled()`.
 */
const activeMenuCount = makeMutable(0);

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
  containerTop: number;
  containerBottom: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Owns the entrance/exit animation state for the overlay card.
 *
 * The spring that grows the card from the trigger's position to its
 * bottom-anchored resting spot depends on the card's real rendered height
 * (`stackHeight`, from `onContentLayout`). The overlay portal fully unmounts
 * on close and remounts fresh on every open, so `onContentLayout` is
 * guaranteed to fire at least once per open before the user perceives
 * anything — `cardReady` keeps the card invisible until that first
 * measurement lands, so the spring never starts from a stale/zero height.
 */
function useMenuOpenAnimation() {
  const cardProgress = useSharedValue(0);
  const backdropProgress = useSharedValue(0);
  const cardReady = useSharedValue(0);
  const stackHeight = useSharedValue(0);
  const pendingStart = useRef(false);

  const open = useCallback(() => {
    cardReady.value = 0;
    cardProgress.value = 0;
    pendingStart.current = true;
    backdropProgress.value = withTiming(1, { duration: 240 });
  }, [backdropProgress, cardProgress, cardReady]);

  const close = useCallback(
    (onClosed: () => void) => {
      pendingStart.current = false;
      backdropProgress.value = withTiming(0, { duration: 220 });
      cardProgress.value = withTiming(0, { duration: 180 }, (finished) => {
        if (finished) runOnJS(onClosed)();
      });
    },
    [backdropProgress, cardProgress],
  );

  const onContentLayout = useCallback(
    (height: number) => {
      stackHeight.value = height;
      if (pendingStart.current) {
        pendingStart.current = false;
        cardReady.value = 1;
        cardProgress.value = withSpring(1, CARD_SPRING);
      }
    },
    [cardProgress, cardReady, stackHeight],
  );

  return { cardProgress, backdropProgress, cardReady, stackHeight, open, close, onContentLayout };
}

/**
 * Owns the trigger's native handle + UI-thread measurement. `measure()`
 * reads the trigger's on-screen position synchronously on the UI thread
 * (no JS bridge round trip), so a still-scrolling parent list can't hand
 * back a stale rect the way `measureInWindow`'s async callback could.
 */
function useTriggerMeasurement() {
  const animatedRef = useAnimatedRef<Animated.View>();
  const cardX = useSharedValue(0);
  const cardY = useSharedValue(0);

  const commitMeasurement = useCallback((): Rect | null => {
    "worklet";
    const m = measure(animatedRef);
    if (!m) return null;
    cardX.value = m.pageX;
    cardY.value = m.pageY;
    return { x: m.pageX, y: m.pageY, width: m.width, height: m.height };
  }, [animatedRef, cardX, cardY]);

  return { animatedRef, cardX, cardY, commitMeasurement };
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
  onCardLayout,
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
  onCardLayout: (height: number) => void;
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
          blurMethod={
            Platform.OS === "android" && blurTargetRef ? "dimezisBlurViewSdk31Plus" : undefined
          }
          blurTarget={Platform.OS === "android" && blurTargetRef ? blurTargetRef : undefined}
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

        <Animated.View style={animatedCardStyle} pointerEvents="box-none">
          <View onLayout={(e) => onCardLayout(e.nativeEvent.layout.height)}>
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
                  style={appShadow(theme.shadowColor.val, resolvedMode === "dark" ? "lg" : "md")}
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
          </View>
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
    // Any sheet stacked ABOVE this trigger's own sheet (or, for triggers
    // outside any sheet, any sheet at all) fully disables the gesture
    // recognizer below — a sheet's own backdrop can't be trusted to block a
    // GestureDetector-based recognizer the way it blocks a plain Pressable,
    // so the recognizer itself must never turn on while something covers it.
    // Compared by stack position (not just "any sheet open") because a
    // trigger's own enclosing sheet is itself on the stack — e.g. a
    // SearchResultsCard menu inside the chat sheet must stay enabled while
    // the chat sheet is the only one open.
    const ownSheetId = useContextMenuSheetId();
    const sheetStack = useUIStore((state) => state.sheetStack);
    const anySheetOpen = useMemo(() => {
      if (ownSheetId == null) return sheetStack.length > 0;
      const index = sheetStack.indexOf(ownSheetId);
      return index === -1 || index < sheetStack.length - 1;
    }, [ownSheetId, sheetStack]);
    const host = useTopOverlayHost();
    const overlayId = useId();
    const { width: windowWidth, height: windowHeight } = useWindowDimensions();
    const insets = useSafeAreaInsets();

    const [phase, setPhase] = useState<"closed" | "open">("closed");
    const [anchorRect, setAnchorRect] = useState<Rect | null>(null);

    const triggerScale = useSharedValue(1);
    const pressBeginX = useSharedValue(0);
    const pressBeginY = useSharedValue(0);
    const { animatedRef, cardX, cardY, commitMeasurement } = useTriggerMeasurement();
    const openAnim = useMenuOpenAnimation();

    const activateOpen = useCallback(
      (rect: Rect, hapticStyle: Haptics.ImpactFeedbackStyle) => {
        activeMenuCount.value = 1;
        void Haptics.impactAsync(hapticStyle);
        setAnchorRect(rect);
        setPhase("open");
        openAnim.open();
      },
      [openAnim],
    );

    const closeMenu = useCallback(() => {
      activeMenuCount.value = 0;
      openAnim.close(() => {
        setPhase("closed");
        setAnchorRect(null);
      });
    }, [openAnim]);

    useEffect(() => {
      return () => {
        if (phase === "open") activeMenuCount.value = 0;
      };
    }, [phase]);

    useImperativeHandle(
      ref,
      () => ({
        open: () => {
          if (anySheetOpen) return;
          runOnUI(() => {
            "worklet";
            if (activeMenuCount.value > 0) return;
            const rect = commitMeasurement();
            if (rect) runOnJS(activateOpen)(rect, Haptics.ImpactFeedbackStyle.Medium);
          })();
        },
        close: closeMenu,
      }),
      [activateOpen, anySheetOpen, closeMenu, commitMeasurement],
    );

    const composedGesture = useMemo(() => {
      // Single recognizer, not a Tap+LongPress race: a release before
      // minDuration fails the gesture without ever reaching ACTIVE, and
      // RNGH only calls `onEnd` for transitions *out of* ACTIVE — a quick
      // tap never fires it. `onFinalize` fires unconditionally regardless
      // of prior state, so that's the one true "gesture is fully done"
      // signal; its `success` flag still distinguishes a completed long
      // press (already handled in onStart) from a quick tap or a
      // scroll/drag that aborted it.
      return Gesture.LongPress()
        .minDuration(LONG_PRESS_MIN_DURATION)
        .maxDistance(24)
        .enabled(!anySheetOpen)
        .onBegin((event) => {
          if (activeMenuCount.value > 0) return;
          pressBeginX.value = event.x;
          pressBeginY.value = event.y;
          triggerScale.value = withTiming(TRIGGER_PRESS_SCALE, { duration: 120 });
        })
        .onStart(() => {
          if (activeMenuCount.value > 0) return;
          triggerScale.value = withTiming(1, { duration: 80 });
          const rect = commitMeasurement();
          if (rect) runOnJS(activateOpen)(rect, Haptics.ImpactFeedbackStyle.Heavy);
        })
        .onFinalize((event, success) => {
          triggerScale.value = withTiming(1, { duration: 120 });
          if (success || activeMenuCount.value > 0) return;

          const dx = event.x - pressBeginX.value;
          const dy = event.y - pressBeginY.value;
          const movedTooFar = dx * dx + dy * dy > TAP_MOVE_TOLERANCE * TAP_MOVE_TOLERANCE;
          if (movedTooFar) return;

          if (openOn === "press") {
            const rect = commitMeasurement();
            if (rect) runOnJS(activateOpen)(rect, Haptics.ImpactFeedbackStyle.Medium);
          } else if (onPress) {
            runOnJS(onPress)();
          }
        });
    }, [
      activateOpen,
      anySheetOpen,
      commitMeasurement,
      onPress,
      openOn,
      pressBeginX,
      pressBeginY,
      triggerScale,
    ]);

    const triggerScaleStyle = useAnimatedStyle(() => ({
      transform: [{ scale: triggerScale.value }],
    }));

    const overlayPreview = preview ?? (openOn === "longPress" ? children : null);
    const hasPreview = !!overlayPreview;
    const validItems = useMemo(() => items.filter(Boolean) as ContextMenuItemDef[], [items]);
    const layoutMetrics = useMemo<LayoutMetrics>(() => {
      const rect = anchorRect ?? { x: 0, y: 0, width: 0, height: 0 };
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

      const containerBottom = BOTTOM_FLOAT_MARGIN + insets.bottom;
      const containerTop = SCREEN_MARGIN;

      if (!hasPreview) {
        return {
          effectiveWidth,
          previewWidth: safePreviewWidth,
          menuWidth: safeMenuWidth,
          previewMaxHeight: 0,
          targetLeft,
          containerTop,
          containerBottom,
        };
      }

      const estimatedMenuHeight =
        validItems.length > 0 ? validItems.length * 53 + MENU_STACK_GAP : 0;
      const availableHeight = windowHeight - containerTop - containerBottom;
      const previewMaxHeight = Math.max(
        180,
        Math.min(windowHeight * 0.45, availableHeight - estimatedMenuHeight),
      );

      return {
        effectiveWidth,
        previewWidth: safePreviewWidth,
        menuWidth: safeMenuWidth,
        previewMaxHeight,
        targetLeft,
        containerTop,
        containerBottom,
      };
    }, [
      anchorRect,
      hasPreview,
      insets.bottom,
      previewMinWidth,
      validItems.length,
      windowHeight,
      windowWidth,
    ]);

    const animatedCardStyle = useAnimatedStyle(() => {
      "worklet";

      const finalContentTop =
        windowHeight - layoutMetrics.containerBottom - openAnim.stackHeight.value;
      const originOffsetY = cardY.value - finalContentTop;
      const progress = openAnim.cardProgress.value;

      return {
        position: "absolute" as const,
        width: layoutMetrics.effectiveWidth,
        left: cardX.value + (layoutMetrics.targetLeft - cardX.value) * progress,
        top: layoutMetrics.containerTop,
        bottom: layoutMetrics.containerBottom,
        justifyContent: "flex-end" as const,
        opacity: openAnim.cardReady.value * (0.82 + progress * 0.18),
        transform: [
          { translateY: originOffsetY * (1 - progress) },
          { scale: 0.985 + progress * 0.015 },
        ],
      };
    }, [
      layoutMetrics.effectiveWidth,
      layoutMetrics.targetLeft,
      layoutMetrics.containerTop,
      layoutMetrics.containerBottom,
      windowHeight,
    ]);

    const animatedBgStyle = useAnimatedStyle(() => ({
      opacity: openAnim.backdropProgress.value,
    }));

    const animatedMenuStyle = useAnimatedStyle(() => ({
      opacity: openAnim.cardProgress.value,
      transform: [{ translateY: (1 - openAnim.cardProgress.value) * 10 }],
    }));

    useEffect(() => {
      if (phase !== "open" || Platform.OS !== "android") return;

      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        closeMenu();
        return true;
      });

      return () => sub.remove();
    }, [closeMenu, phase]);

    const overlayNode = useMemo(() => {
      if (phase !== "open") return null;

      return (
        <ContextMenuOverlay
          animatedBackdropStyle={animatedBgStyle}
          animatedCardStyle={animatedCardStyle}
          animatedMenuStyle={animatedMenuStyle}
          blurTargetRef={host?.blurTargetRef}
          closeMenu={closeMenu}
          onCardLayout={openAnim.onContentLayout}
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
      openAnim.onContentLayout,
      host?.blurTargetRef,
      phase,
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
      <GestureDetector gesture={composedGesture}>
        <Animated.View
          ref={animatedRef}
          collapsable={false}
          style={[
            { opacity: phase === "open" && openOn === "longPress" && !preview ? 0 : 1 },
            triggerScaleStyle,
          ]}
        >
          {children}
        </Animated.View>
      </GestureDetector>
    );
  },
);

export type { ContextMenuHandle, ContextMenuItemDef, ContextMenuProps } from "./ContextMenu.shared";
