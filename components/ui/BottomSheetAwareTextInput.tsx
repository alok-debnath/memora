import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import { findNodeHandle, Platform, TextInput, type TextInputProps } from "react-native";
import { useBottomSheetInternal } from "@gorhom/bottom-sheet";

/**
 * A native TextInput that participates in Gorhom's keyboard handling without
 * using Gesture Handler's TextInput wrapper. Keeping the native input allows
 * the surrounding BottomSheetScrollView to take over a vertical drag.
 */
const NativeBottomSheetAwareTextInput = forwardRef<TextInput, TextInputProps>(
  function BottomSheetAwareTextInput({ onBlur, onFocus, ...props }, forwardedRef) {
    const inputRef = useRef<TextInput>(null);
    const { animatedKeyboardState, textInputNodesRef } = useBottomSheetInternal();

    useImperativeHandle(forwardedRef, () => inputRef.current as TextInput, []);

    const handleFocus = useCallback<NonNullable<TextInputProps["onFocus"]>>(
      (event) => {
        animatedKeyboardState.set((state) => ({
          ...state,
          target: event.nativeEvent.target,
        }));
        onFocus?.(event);
      },
      [animatedKeyboardState, onFocus],
    );

    const handleBlur = useCallback<NonNullable<TextInputProps["onBlur"]>>(
      (event) => {
        const keyboardState = animatedKeyboardState.get();
        const focusedNode = findNodeHandle(
          TextInput.State.currentlyFocusedInput() as unknown as React.Component,
        );
        const focusMovedWithinSheet =
          focusedNode !== null && textInputNodesRef.current.has(focusedNode);

        if (keyboardState.target === event.nativeEvent.target && !focusMovedWithinSheet) {
          animatedKeyboardState.set((state) => ({ ...state, target: undefined }));
        }
        onBlur?.(event);
      },
      [animatedKeyboardState, onBlur, textInputNodesRef],
    );

    useEffect(() => {
      const node = findNodeHandle(inputRef.current);
      if (node === null) return;

      textInputNodesRef.current.add(node);
      return () => {
        textInputNodesRef.current.delete(node);
        if (animatedKeyboardState.get().target === node) {
          animatedKeyboardState.set((state) => ({ ...state, target: undefined }));
        }
      };
    }, [animatedKeyboardState, textInputNodesRef]);

    return (
      <TextInput
        ref={inputRef}
        rejectResponderTermination
        onFocus={handleFocus}
        onBlur={handleBlur}
        {...props}
      />
    );
  },
);

// Keyboard coordination is a native-only concern, and the implementation above
// relies on findNodeHandle and TextInput.State.currentlyFocusedInput, neither
// of which react-native-web supports.
export const BottomSheetAwareTextInput =
  Platform.OS === "web"
    ? forwardRef<TextInput, TextInputProps>(function BottomSheetAwareTextInputWeb(props, ref) {
        return <TextInput ref={ref} {...props} />;
      })
    : NativeBottomSheetAwareTextInput;
