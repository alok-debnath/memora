import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { BackHandler, Keyboard, Platform } from "react-native";
import { Sheet, type SheetProps, View } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import { withAlpha } from "@/components/ui/themeHelpers";

import { selectSheetStack, useUIStore } from "@/store/ui";

export const SHEET_CONFIG = {
  snapPoints: [90] as number[],
  snapPointsMode: "percent" as const,
  dismissOnSnapToBottom: true,
  zIndex: 100_000,
  frameBorderRadius: 30,
};

interface BaseSheetProps
  extends Omit<SheetProps, "children"> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  backgroundColor?: string;
  handleColor?: string;
  sheetId?: string;
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

  // sheetStack is managed entirely by uiStore open/close actions (eager stack push/pop).
  // No useEffect sync needed — that caused extra store updates mid-animation,
  // making Tamagui Sheet drop open transitions on native.
  const sheetStack = useUIStore(selectSheetStack);

  const { snapPoints, zIndex } = useMemo(() => {
    if (props.snapPoints) {
      return { snapPoints: props.snapPoints as number[], zIndex: props.zIndex ?? SHEET_CONFIG.zIndex };
    }
    if (!sheetId) {
      return { snapPoints: SHEET_CONFIG.snapPoints, zIndex: SHEET_CONFIG.zIndex };
    }

    const stackIndex = sheetStack.indexOf(sheetId);
    if (stackIndex === -1) {
      return { snapPoints: SHEET_CONFIG.snapPoints, zIndex: SHEET_CONFIG.zIndex };
    }

    const depth = sheetStack.length - 1 - stackIndex;
    const snapPoint = 90 + depth * 2;
    const computedZIndex = SHEET_CONFIG.zIndex + stackIndex;

    return { snapPoints: [snapPoint], zIndex: computedZIndex };
  }, [props.snapPoints, props.zIndex, sheetId, sheetStack]);

  const isTopSheet = sheetId ? sheetStack[sheetStack.length - 1] === sheetId : true;
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
