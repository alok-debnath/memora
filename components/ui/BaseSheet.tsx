import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { BackHandler, Keyboard, Platform } from "react-native";
import { Sheet, type SheetProps, View } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import { withAlpha } from "@/components/ui/themeHelpers";

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
}

export function BaseSheet({
  open,
  onOpenChange,
  backgroundColor,
  handleColor,
  sheetId,
  children,
  ...props
}: BaseSheetProps) {
  const theme = useAppTheme();
  const resolvedBg = backgroundColor ?? theme.backgroundStrong?.val ?? "$backgroundStrong";
  const sheetStack = useUIStore((state) => state.sheetStack);
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
        {children}
      </Sheet.Frame>
    </Sheet>
  );
}
