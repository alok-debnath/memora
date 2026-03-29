import {
  KeyboardAwareScrollView as RNKeyboardAwareScrollView,
  type KeyboardAwareScrollViewProps,
} from "react-native-keyboard-controller";
import React, { useEffect } from "react";
import { Keyboard, Platform, ScrollView, TextInput, type ScrollViewProps } from "react-native";

type Props = KeyboardAwareScrollViewProps &
  ScrollViewProps & {
    children: React.ReactNode;
  };

export const KeyboardAwareScrollViewCompat = React.forwardRef<
  React.ElementRef<typeof RNKeyboardAwareScrollView>,
  Props
>(function KeyboardAwareScrollViewCompat(
  { children, bottomOffset = 20, keyboardShouldPersistTaps = "handled", ...props },
  ref
) {
  useEffect(() => {
    if (Platform.OS === "web") {
      return;
    }

    const subscription = Keyboard.addListener("keyboardDidHide", () => {
      const focused = TextInput.State.currentlyFocusedInput();
      if (focused) {
        TextInput.State.blurTextInput(focused);
      }
    });

    return () => subscription.remove();
  }, []);

  if (Platform.OS === "web") {
    return (
      <ScrollView keyboardShouldPersistTaps={keyboardShouldPersistTaps} {...props}>
        {children}
      </ScrollView>
    );
  }

  return (
    <RNKeyboardAwareScrollView
      ref={ref}
      bottomOffset={bottomOffset}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      keyboardDismissMode="on-drag"
      onScrollBeginDrag={Keyboard.dismiss}
      showsVerticalScrollIndicator={false}
      {...props}
    >
      {children}
    </RNKeyboardAwareScrollView>
  );
});
