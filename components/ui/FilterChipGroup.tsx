import React from "react";
import { ScrollView, type ViewStyle } from "react-native";
import { Feather, type FeatherIconName } from "@/lib/icons";
import { Text, XStack } from "tamagui";

import { PressableScale } from "@/components/ui/PressableScale";
import { withAlpha } from "@/components/ui/themeHelpers";
import { radius, spacing, typeScale } from "@/constants/uiTokens";
import { useAppTheme } from "@/hooks/useAppTheme";

export type FilterChipOption<T extends string = string> = {
  value: T;
  label: string;
  icon?: FeatherIconName;
  count?: number;
  color?: string;
  showColorSwatch?: boolean;
  disabled?: boolean;
};

type FilterChipGroupBaseProps<T extends string = string> = {
  options: readonly FilterChipOption<T>[];
  scrollable?: boolean;
  size?: "compact" | "default";
  contentStyle?: ViewStyle;
  accessibilityLabel?: string;
};

type FilterChipGroupProps<T extends string = string> = FilterChipGroupBaseProps<T> &
  (
    | { value: T | null; onChange: (value: T | null) => void; allowDeselect?: boolean }
    | { values: readonly T[]; onValuesChange: (values: T[]) => void }
  );

export function FilterChipGroup<T extends string = string>(props: FilterChipGroupProps<T>) {
  const { options, scrollable = false, size = "default", contentStyle, accessibilityLabel } = props;
  const theme = useAppTheme();
  const multiple = "values" in props;
  const isSelected = (optionValue: T) =>
    multiple ? props.values.includes(optionValue) : props.value === optionValue;
  const handleChange = (optionValue: T) => {
    if (multiple) {
      props.onValuesChange(
        props.values.includes(optionValue)
          ? props.values.filter((item) => item !== optionValue)
          : [...props.values, optionValue],
      );
      return;
    }
    props.onChange(props.value === optionValue && props.allowDeselect ? null : optionValue);
  };
  const content = (
    <XStack
      accessibilityLabel={accessibilityLabel}
      flexWrap={scrollable ? "nowrap" : "wrap"}
      gap={spacing.sm}
      style={contentStyle}
    >
      {options.map((option) => {
        const active = isSelected(option.value);
        const accent = option.color ?? theme.primary.val;
        return (
          <PressableScale
            key={option.value}
            onPress={() => handleChange(option.value)}
            disabled={option.disabled}
            accessibilityRole="button"
            accessibilityLabel={option.label}
            accessibilityState={{ selected: active, disabled: option.disabled }}
            hitSlop={size === "compact" ? 5 : 2}
            style={{ opacity: option.disabled ? 0.42 : 1, borderRadius: radius.pill }}
          >
            <XStack
              minHeight={size === "compact" ? 34 : 40}
              paddingHorizontal={size === "compact" ? spacing.sm : spacing.md}
              alignItems="center"
              gap={spacing.xs}
              borderRadius={radius.pill}
              borderWidth={1}
              borderColor={active ? withAlpha(accent, "70") : theme.borderSubtle.val}
              backgroundColor={active ? withAlpha(accent, "18") : theme.backgroundStrong.val}
            >
              {option.showColorSwatch ? (
                <XStack
                  width={7}
                  height={7}
                  borderRadius={radius.pill}
                  backgroundColor={active ? accent : withAlpha(accent, "70")}
                />
              ) : null}
              {option.icon ? (
                <Feather
                  name={option.icon}
                  size={size === "compact" ? 13 : 14}
                  color={active ? accent : theme.colorMuted.val}
                />
              ) : null}
              <Text
                fontFamily="$body"
                fontSize={size === "compact" ? typeScale.metadata : typeScale.control}
                fontWeight={active ? "700" : "500"}
                color={active ? accent : theme.colorMuted.val}
              >
                {option.label}
              </Text>
              {typeof option.count === "number" ? (
                <Text
                  fontFamily="$utility"
                  fontSize={10}
                  fontWeight="700"
                  color={active ? accent : theme.colorMuted.val}
                >
                  {option.count > 99 ? "99+" : option.count}
                </Text>
              ) : null}
            </XStack>
          </PressableScale>
        );
      })}
    </XStack>
  );

  if (!scrollable) return content;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      {content}
    </ScrollView>
  );
}
