import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  KEYBOARD_STATUS,
  useBottomSheetInternal,
} from "@gorhom/bottom-sheet";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { YStack } from "tamagui";
import { withAlpha } from "@/components/ui/themeHelpers";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useIsLargeScreen } from "@/hooks/useIsLargeScreen";
import { SheetIdProvider } from "@/components/ui/ContextMenu.shared";
import { useChatController } from "./useChatController";
import { ChatHeader } from "./ChatHeader";
import { ChatMessageList } from "./ChatMessageList";
import { ChatComposer } from "./ChatComposer";

// gorhom renders the sheet at the height of its TALLEST detent and translates
// it down for lower snap points, so a flex-filled child would extend below the
// screen at the lower detent and push the composer offscreen. Instead, size
// the column to the currently VISIBLE portion of the sheet:
// containerHeight − animatedPosition − handle − keyboard. Same math gorhom's
// own footer container uses; runs on the UI thread, no React re-renders.
function VisibleContentContainer({ children }: { children: React.ReactNode }) {
  const { animatedPosition, animatedLayoutState, animatedKeyboardState } = useBottomSheetInternal();

  const style = useAnimatedStyle(() => {
    const { containerHeight, handleHeight } = animatedLayoutState.get();
    if (containerHeight <= 0) {
      return {};
    }

    const keyboard = animatedKeyboardState.get();
    const keyboardSpace =
      keyboard.status === KEYBOARD_STATUS.SHOWN ? keyboard.heightWithinContainer : 0;

    return {
      height: Math.max(
        0,
        containerHeight - animatedPosition.get() - Math.max(handleHeight, 0) - keyboardSpace,
      ),
    };
  }, [animatedPosition, animatedLayoutState, animatedKeyboardState]);

  return <Animated.View style={style}>{children}</Animated.View>;
}

export function ChatSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const isLargeScreen = useIsLargeScreen();
  const modalRef = useRef<BottomSheetModal>(null);
  const presentedRef = useRef(false);
  const controller = useChatController();

  const snapPoints = useMemo(() => (isLargeScreen ? ["80%"] : ["95%"]), [isLargeScreen]);
  const sheetBottomInset = isLargeScreen ? insets.bottom + 16 : insets.bottom;

  useEffect(() => {
    if (visible && !presentedRef.current) {
      modalRef.current?.present();
      presentedRef.current = true;
      return;
    }

    if (!visible && presentedRef.current) {
      modalRef.current?.dismiss();
    }
  }, [visible]);

  const handleDismiss = useCallback(() => {
    presentedRef.current = false;
    onClose();
  }, [onClose]);

  const renderBackdrop = useCallback(
    (props: React.ComponentProps<typeof BottomSheetBackdrop>) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
      />
    ),
    [],
  );

  return (
    <BottomSheetModal
      ref={modalRef}
      name="chatSheet"
      index={0}
      snapPoints={snapPoints}
      // Snap points are authoritative: gorhom v5 defaults enableDynamicSizing
      // to true, which measures content height and would let the list grow to
      // its full content size instead of staying bounded.
      enableDynamicSizing={false}
      // "extend" keeps the sheet parked at the snap point when the keyboard
      // opens; keyboard clearance is handled by VisibleContentContainer's
      // height worklet, so gorhom must not also move the sheet ("interactive"
      // would double-compensate).
      keyboardBehavior="extend"
      keyboardBlurBehavior="restore"
      enableBlurKeyboardOnGesture
      // AndroidManifest sets adjustResize, but Android edge-to-edge (mandatory
      // on targetSdk 35+) stops the OS from actually auto-shrinking the window.
      // "adjustResize" here would make gorhom assume the OS handled it and
      // zero out its keyboard compensation; "adjustPan" makes it compute and
      // apply its own (the content-mask shrink described above).
      android_keyboardInputMode="adjustPan"
      // The sheet's content panning gesture fights the inverted FlatList
      // (known gorhom limitation on Android): its pan worklet captures the
      // drag, and with a single snap point the position clamp turns every
      // gesture into overdrag resistance instead of list scrolling. Disabling
      // it routes content touches natively to the list; the sheet still
      // closes via the handle and the backdrop.
      enableContentPanningGesture={false}
      detached={isLargeScreen}
      enablePanDownToClose
      style={
        isLargeScreen
          ? {
              marginHorizontal: 16,
              width: "100%",
              maxWidth: 720,
              alignSelf: "center",
            }
          : undefined
      }
      topInset={isLargeScreen ? insets.top + 16 : insets.top}
      bottomInset={sheetBottomInset}
      stackBehavior="push"
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: theme.background.val }}
      onDismiss={handleDismiss}
    >
      {/* Deliberately NOT BottomSheetView: it forces position absolute with
          top/left/right only, so it sizes to content and overflows the sheet
          (with bottom:0 it fills the mask's padded overdrag zone instead,
          pushing the composer offscreen). */}
      <SheetIdProvider value="unifiedCommand">
        <VisibleContentContainer>
          <ChatHeader
            messageCount={controller.messages.length}
            onClear={controller.handleClearChat}
            onClose={onClose}
          />
          {/* Composer floats over the list instead of sitting in its own row —
              the list runs full height underneath and scrolls visibly behind
              the gaps around the rounded pill. */}
          <YStack flex={1} position="relative">
            <ChatMessageList controller={controller} />
            {/* Fades messages out as they scroll under the floating pill,
                instead of a hard clip against the transparent overlay. */}
            <LinearGradient
              colors={[withAlpha(theme.background.val, "00"), theme.background.val]}
              locations={[0, 0.75]}
              pointerEvents="none"
              style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 80 }}
            />
            <YStack pointerEvents="box-none" position="absolute" left={0} right={0} bottom={0}>
              <ChatComposer
                isSending={controller.isSending}
                onSend={controller.handleSend}
                attachments={controller.attachments}
                onRemoveAttachment={controller.onRemoveAttachment}
                onPickImages={controller.onPickImages}
                onPickCamera={controller.onPickCamera}
                onPickDocument={controller.onPickDocument}
                driveConnected={controller.driveConnected}
                onRequestDriveAccess={controller.onRequestDriveAccess}
              />
            </YStack>
          </YStack>
        </VisibleContentContainer>
      </SheetIdProvider>
    </BottomSheetModal>
  );
}
