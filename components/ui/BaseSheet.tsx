import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { BackHandler, Keyboard, Platform } from "react-native";
import { Sheet, type SheetProps, XStack, YStack } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";

import { selectSheetStack, useUIStore } from "@/store/ui";

export const SHEET_CONFIG = {
  snapPoints: [90] as number[],
  snapPointsMode: "percent" as const,
  dismissOnSnapToBottom: true,
  zIndex: 100_000,
  overlayBackgroundColor: "rgba(0,0,0,0.5)",
  frameBorderRadius: 30,
};

interface BaseSheetProps
  extends Omit<SheetProps, "snapPoints" | "snapPointsMode" | "children"> {
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
  const RootSheet = Sheet as any;
  const SheetHandle = Sheet.Handle as any;
  const SheetOverlay = Sheet.Overlay as any;
  const SheetFrame = Sheet.Frame as any;

  const pushSheet = useUIStore((s) => s.pushSheet);
  const popSheet = useUIStore((s) => s.popSheet);
  const sheetStack = useUIStore(selectSheetStack);
  const resolvedBackgroundColor = backgroundColor ?? theme.card.val;
  const isInStack = sheetId ? sheetStack.includes(sheetId) : false;

  const { snapPoints, zIndex } = useMemo(() => {
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
  }, [sheetId, sheetStack]);

  // Sync sheet stack for sheets not using eager store actions
  useEffect(() => {
    if (!sheetId) return;
    if (open && !isInStack) {
      pushSheet(sheetId);
    } else if (!open && isInStack) {
      popSheet(sheetId);
    }
  }, [isInStack, open, popSheet, pushSheet, sheetId]);

  useEffect(() => {
    return () => {
      if (sheetId) popSheet(sheetId);
    };
  }, [popSheet, sheetId]);

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

  useEffect(() => {
    if (!open || Platform.OS !== "android") return;

    const backHandler = BackHandler.addEventListener("hardwareBackPress", () => {
      handleOpenChange(false);
      return true;
    });

    return () => backHandler.remove();
  }, [handleOpenChange, open]);

  return (
    <RootSheet
      modal
      open={open}
      onOpenChange={handleOpenChange}
      snapPoints={snapPoints}
      snapPointsMode={SHEET_CONFIG.snapPointsMode}
      dismissOnSnapToBottom={SHEET_CONFIG.dismissOnSnapToBottom}
      disableDrag={props.disableDrag ?? false}
      moveOnKeyboardChange={props.moveOnKeyboardChange ?? false}
      zIndex={zIndex}
      {...props}
    >
      <SheetOverlay backgroundColor={SHEET_CONFIG.overlayBackgroundColor} />
      <SheetFrame
        backgroundColor={resolvedBackgroundColor}
        borderTopLeftRadius={SHEET_CONFIG.frameBorderRadius}
        borderTopRightRadius={SHEET_CONFIG.frameBorderRadius}
      >
        <SheetHandle
          backgroundColor="transparent"
          opacity={1}
          alignItems="center"
          justifyContent="center"
          paddingTop={10}
          paddingBottom={6}
          marginHorizontal={0}
          marginBottom={0}
          height={20}
        >
          <YStack
            width={40}
            height={4}
            borderRadius={2}
            backgroundColor={handleColor ?? "$borderColor"}
          />
        </SheetHandle>
        {children}
      </SheetFrame>
    </RootSheet>
  );
}
