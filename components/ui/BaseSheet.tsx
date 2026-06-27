import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  BackHandler,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View as RNView,
} from "react-native";
import { Sheet, type SheetProps, View } from "tamagui";
import { Portal } from "react-native-teleport";
import { useAppTheme } from "@/hooks/useAppTheme";
import { withAlpha } from "@/components/ui/themeHelpers";
import { useIsLargeScreen } from "@/hooks/useIsLargeScreen";
import { type SheetId, useUIStore } from "@/store/ui";

export const SHEET_CONFIG = {
  snapPoints: [90] as number[],
  snapPointsMode: "percent" as const,
  dismissOnSnapToBottom: true,
  zIndex: 100_000,
  frameBorderRadius: 30,
  stackHeightStep: 2,
  maxStackedSnapPoint: 96,
};

const MODAL_DEFAULT_MAX_WIDTH = 720;
// Each stacked background modal scales down by this factor per depth level
const MODAL_STACK_SCALE_STEP = 0.04;
const MODAL_STACK_MIN_SCALE = 0.88;
// Background modals shift upward by this many px per depth level (peek effect)
const MODAL_STACK_TRANSLATE_Y_STEP = -14;

function resolveSheetPresentation(args: {
  sheetId?: string;
  depth: number;
  stackIndex: number;
  snapPoints?: number[];
  zIndex?: number;
}) {
  if (args.snapPoints) {
    return {
      snapPoints: args.snapPoints,
      zIndex: args.zIndex ?? SHEET_CONFIG.zIndex,
    };
  }

  if (!args.sheetId || args.stackIndex === -1) {
    return {
      snapPoints: SHEET_CONFIG.snapPoints,
      zIndex: args.zIndex ?? SHEET_CONFIG.zIndex,
    };
  }

  const baseSnapPoint = SHEET_CONFIG.snapPoints[0] ?? 90;
  const stackedSnapPoint = Math.min(
    SHEET_CONFIG.maxStackedSnapPoint,
    baseSnapPoint + args.depth * SHEET_CONFIG.stackHeightStep,
  );

  return {
    snapPoints: [stackedSnapPoint],
    zIndex: args.zIndex ?? SHEET_CONFIG.zIndex + args.stackIndex,
  };
}

interface BaseSheetProps extends Omit<SheetProps, "children"> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  backgroundColor?: string;
  handleColor?: string;
  sheetId?: SheetId;
  children: React.ReactNode;
  /** Controls large-screen rendering mode. "auto" (default) uses modal on ≥768px screens. */
  largeScreenPresentation?: "auto" | "sheet" | "modal";
  /** Maximum card width in large-screen modal mode. Defaults to 720. */
  modalMaxWidth?: number;
}

// ─── Large-screen centered modal ────────────────────────────────────────────

interface LargeScreenModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  backgroundColor: string;
  shadowColor: string;
  children: React.ReactNode;
  depth: number;
  stackIndex: number;
  snapPoints: number[];
  modalMaxWidth: number;
  dismissOnOverlayPress: boolean;
}

function computeModalTargets(open: boolean, depth: number) {
  if (!open) {
    return { backdropOpacity: 0, cardScale: 0.95, cardTranslateY: 24, cardOpacity: 0 };
  }
  return {
    // Only the top-most modal shows its backdrop; background modals fade theirs out.
    // This prevents multiplicative darkening when several modals are stacked.
    backdropOpacity: depth === 0 ? 1 : 0,
    cardScale: Math.max(MODAL_STACK_MIN_SCALE, 1 - depth * MODAL_STACK_SCALE_STEP),
    cardTranslateY: depth * MODAL_STACK_TRANSLATE_Y_STEP,
    cardOpacity: depth === 0 ? 1 : Math.max(0.7, 1 - depth * 0.15),
  };
}

function LargeScreenModal({
  open,
  onOpenChange,
  backgroundColor,
  shadowColor,
  children,
  depth,
  stackIndex,
  snapPoints,
  modalMaxWidth,
  dismissOnOverlayPress,
}: LargeScreenModalProps) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [mounted, setMounted] = useState(open);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Initialise animated values from the first known state so there is no
  // flash on the first render.
  const initial = computeModalTargets(open, depth);
  const backdropAnim = useRef(new Animated.Value(initial.backdropOpacity)).current;
  const scaleAnim = useRef(new Animated.Value(initial.cardScale)).current;
  const translateYAnim = useRef(new Animated.Value(initial.cardTranslateY)).current;
  const opacityAnim = useRef(new Animated.Value(initial.cardOpacity)).current;

  useEffect(() => {
    const targets = computeModalTargets(open, depth);
    const SPRING = { tension: 280, friction: 26, useNativeDriver: true } as const;

    if (open) {
      setMounted(true);
      Animated.parallel([
        Animated.spring(backdropAnim, { toValue: targets.backdropOpacity, ...SPRING }),
        Animated.spring(scaleAnim, { toValue: targets.cardScale, ...SPRING }),
        Animated.spring(translateYAnim, { toValue: targets.cardTranslateY, ...SPRING }),
        Animated.spring(opacityAnim, { toValue: targets.cardOpacity, ...SPRING }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(backdropAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 0.95, duration: 200, useNativeDriver: true }),
        Animated.timing(translateYAnim, { toValue: 24, duration: 200, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished && isMountedRef.current) setMounted(false);
      });
    }
  }, [open, depth]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!mounted) return null;

  // Z-index bands: each modal gets a "slot" of width 2.
  //   stackIndex 0 → backdrop 100_000 / card 100_001
  //   stackIndex 1 → backdrop 100_002 / card 100_003
  // This guarantees the top modal's backdrop sits above the background modal's
  // card while the background modal's card still renders above its own backdrop.
  // Sheets with no sheetId (stackIndex=-1) get a high slot so they float
  // on top of all registered sheets regardless of stack order.
  const si = stackIndex >= 0 ? stackIndex : 10;
  const backdropZ = SHEET_CONFIG.zIndex + si * 2;
  const cardZ = backdropZ + 1;

  const cardWidth = Math.min(screenWidth - 32, modalMaxWidth);
  const snapPoint = snapPoints[0] ?? 90;
  const maxHeight = screenHeight * (snapPoint / 100);
  const cardLeft = (screenWidth - cardWidth) / 2;
  const cardTop = (screenHeight - maxHeight) / 2;

  return (
    <Portal>
      {/* Dimmed backdrop – only visible for the top-most modal */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { zIndex: backdropZ, backgroundColor: withAlpha(shadowColor, "80") },
          { opacity: backdropAnim },
        ]}
        pointerEvents={open && depth === 0 ? "auto" : "none"}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={dismissOnOverlayPress ? () => onOpenChange(false) : undefined}
        />
      </Animated.View>

      {/* Centered card – outer view carries the shadow; inner view clips content.
          IMPORTANT: use `height` (not `maxHeight`) so flex:1 children get a
          definite parent height. Without this, FlatList/ScrollView/flex trees
          collapse to zero px in an absolute-positioned container. */}
      <Animated.View
        style={{
          position: "absolute",
          zIndex: cardZ,
          width: cardWidth,
          height: maxHeight,
          left: cardLeft,
          top: cardTop,
          opacity: opacityAnim,
          transform: [{ scale: scaleAnim }, { translateY: translateYAnim }],
          // Shadow (kept on the outer view so overflow:hidden doesn't clip it)
          shadowColor,
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.18,
          shadowRadius: 28,
          elevation: 24,
          borderRadius: 24,
        }}
        pointerEvents={open ? "auto" : "none"}
      >
        <RNView
          style={{
            flex: 1,
            backgroundColor,
            borderRadius: 24,
            overflow: "hidden",
          }}
        >
          {children}
        </RNView>
      </Animated.View>
    </Portal>
  );
}

// ─── BaseSheet ───────────────────────────────────────────────────────────────

export function BaseSheet({
  open,
  onOpenChange,
  backgroundColor,
  handleColor,
  sheetId,
  children,
  largeScreenPresentation = "auto",
  modalMaxWidth = MODAL_DEFAULT_MAX_WIDTH,
  ...props
}: BaseSheetProps) {
  const theme = useAppTheme();
  const isLargeScreen = useIsLargeScreen();
  const resolvedBg = backgroundColor ?? theme.backgroundStrong?.val ?? "$backgroundStrong";
  const sheetStack = useUIStore((state) => state.sheetStack);
  // Important: any sheet that can appear while another BaseSheet may already be open
  // must pass a registered `sheetId` and be opened via `useUIStore`, otherwise it will
  // bypass the shared sheet stack and render outside the stacking system.
  // Also avoid custom `snapPoints` for normal sheets. Let BaseSheet own height/stack sizing
  // unless there is a deliberate exception that truly needs a different presentation.
  const stackIndex = sheetId ? sheetStack.indexOf(sheetId) : -1;
  const stackSize = sheetStack.length;
  const topSheetId = sheetStack[stackSize - 1] ?? null;
  const depth = stackIndex === -1 ? 0 : stackSize - 1 - stackIndex;
  const isTopSheet = sheetId ? topSheetId === sheetId : true;

  const { snapPoints, zIndex } = useMemo(() => {
    return resolveSheetPresentation({
      sheetId,
      depth,
      stackIndex,
      snapPoints: props.snapPoints as number[] | undefined,
      zIndex: props.zIndex,
    });
  }, [depth, props.snapPoints, props.zIndex, sheetId, stackIndex]);

  const wasTopSheet = useRef(isTopSheet);
  useEffect(() => {
    if (open && wasTopSheet.current && !isTopSheet) {
      Keyboard.dismiss();
    }
    wasTopSheet.current = isTopSheet;
  }, [isTopSheet, open]);

  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) {
      Keyboard.dismiss();
    }
    onOpenChangeRef.current(nextOpen);
  }, []);

  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open) {
      Keyboard.dismiss();
    }
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    if (!open || Platform.OS !== "android") return;

    const backHandler = BackHandler.addEventListener("hardwareBackPress", () => {
      handleOpenChange(false);
      return true;
    });

    return () => backHandler.remove();
  }, [open, handleOpenChange]);

  // Determine which presentation path to use
  const useModalPresentation =
    largeScreenPresentation === "modal" || (largeScreenPresentation === "auto" && isLargeScreen);

  if (useModalPresentation) {
    return (
      <LargeScreenModal
        open={open}
        onOpenChange={handleOpenChange}
        backgroundColor={resolvedBg}
        shadowColor={theme.shadowColor.val}
        depth={depth}
        stackIndex={stackIndex}
        snapPoints={snapPoints}
        modalMaxWidth={modalMaxWidth}
        dismissOnOverlayPress={props.dismissOnOverlayPress ?? true}
      >
        {children}
      </LargeScreenModal>
    );
  }

  return (
    <Sheet
      modal
      open={open}
      onOpenChange={handleOpenChange}
      snapPoints={snapPoints}
      snapPointsMode={props.snapPointsMode ?? SHEET_CONFIG.snapPointsMode}
      dismissOnSnapToBottom={SHEET_CONFIG.dismissOnSnapToBottom}
      // By default, disable drag-to-close so swiping inside the sheet body
      // (e.g. scroll or gesture areas) doesn't accidentally move/close it.
      // Individual sheets can still override by passing `disableDrag` in props.
      disableDrag={props.disableDrag ?? true}
      // Allow tapping the overlay to dismiss the sheet.
      dismissOnOverlayPress={props.dismissOnOverlayPress ?? true}
      zIndex={zIndex}
      {...props}
    >
      <Sheet.Overlay backgroundColor={withAlpha(theme.shadowColor.val, "80")} />
      <Sheet.Frame
        flex={1}
        minHeight={0}
        backgroundColor={resolvedBg}
        borderTopLeftRadius={SHEET_CONFIG.frameBorderRadius}
        borderTopRightRadius={SHEET_CONFIG.frameBorderRadius}
      >
        {/* Custom handle - renders reliably on mobile unlike Sheet.Handle */}
        <View
          alignSelf="center"
          width={40}
          height={4}
          borderRadius={2}
          backgroundColor={handleColor ?? "$borderColor"}
          marginTop={10}
          marginBottom={6}
        />
        {/* Keep sheet content in a bounded flex container so ScrollView/FlatList children
            get a real viewport and can scroll correctly inside the shared sheet frame. */}
        <View flex={1} minHeight={0}>
          {children}
        </View>
      </Sheet.Frame>
    </Sheet>
  );
}
