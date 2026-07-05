import React, { useCallback } from "react";
import { StyleSheet } from "react-native";
import { YStack } from "tamagui";
import ColorPicker, {
  Panel1,
  HueSlider,
  InputWidget,
  type ColorFormatsObject,
} from "reanimated-color-picker";

import { useAppTheme } from "@/hooks/useAppTheme";
import { radius, spacing } from "@/constants/uiTokens";

type HexColorPickerProps = {
  /** Current color as a hex string, e.g. "#3B82F6". */
  value: string;
  /**
   * Called on every drag frame / hue-slider move (high frequency — cheap local
   * state only, e.g. a preview swatch). Do not use this to drive app-wide
   * state or persistence; use `onChangeEnd` for that.
   */
  onChange: (hex: string) => void;
  /**
   * Called once when the user lifts their finger off the panel/slider, or
   * submits the hex text field. Fires far less often than `onChange` — the
   * right place to commit to global state, trigger a theme rebuild, or
   * persist to storage.
   */
  onChangeEnd?: (hex: string) => void;
};

export function HexColorPicker({ value, onChange, onChangeEnd }: HexColorPickerProps) {
  const theme = useAppTheme();

  const handleChangeJS = useCallback(
    (colors: ColorFormatsObject) => {
      onChange(colors.hex);
    },
    [onChange],
  );

  const handleCompleteJS = useCallback(
    (colors: ColorFormatsObject) => {
      onChangeEnd?.(colors.hex);
    },
    [onChangeEnd],
  );

  return (
    <ColorPicker
      value={value}
      onChangeJS={handleChangeJS}
      onCompleteJS={handleCompleteJS}
      boundedThumb
      thumbShape="ring"
    >
      <YStack gap={spacing.md}>
        <Panel1 style={styles.panel} />
        <HueSlider style={styles.slider} />
        <InputWidget
          defaultFormat="HEX"
          formats={["HEX"]}
          containerStyle={styles.inputContainer}
          inputStyle={[
            styles.input,
            {
              color: theme.color.val,
              backgroundColor: theme.card.val,
              borderColor: theme.borderColor.val,
            },
          ]}
        />
      </YStack>
    </ColorPicker>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: radius.md,
  },
  slider: {
    borderRadius: radius.pill,
  },
  inputContainer: {
    gap: spacing.sm,
  },
  input: {
    borderRadius: radius.sm,
    borderWidth: 0.5,
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});
