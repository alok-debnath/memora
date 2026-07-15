import React, { useState } from "react";
import { Pressable } from "react-native";
import { Feather, type FeatherIconName } from "@/lib/icons";
import { XStack, YStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";

export interface PickerOption {
  value: string;
  label: string;
  icon?: FeatherIconName;
  color?: string;
}

interface PickerFieldProps {
  label: string;
  options: PickerOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  allowClear?: boolean;
  placeholder?: string;
  stacked?: boolean;
}

export function PickerField({
  label,
  options,
  value,
  onChange,
  allowClear = false,
  placeholder = "Select...",
  stacked = false,
}: PickerFieldProps) {
  const theme = useAppTheme();
  const [open, setOpen] = useState(false);

  const selectedOption = options.find((o) => o.value === value) ?? null;

  const handleSelect = (optValue: string | null) => {
    onChange(optValue);
    setOpen(false);
  };

  return (
    <YStack flex={stacked ? undefined : 1} width={stacked ? "100%" : undefined} gap={4}>
      <Text
        color={theme.colorMuted.val}
        fontSize={11}
        fontFamily="$body"
        fontWeight="600"
        letterSpacing={0.8}
        marginLeft={4}
        textTransform="uppercase"
      >
        {label}
      </Text>

      {/* Trigger */}
      <Pressable onPress={() => setOpen((o) => !o)}>
        <XStack
          borderColor={open ? theme.primary.val : theme.borderColor.val}
          backgroundColor={theme.card.val}
          borderWidth={0.5}
          borderRadius={12}
          paddingHorizontal={12}
          paddingVertical={10}
          minHeight={40}
          alignItems="center"
          gap={6}
        >
          {selectedOption?.icon && (
            <Feather
              name={selectedOption.icon}
              size={14}
              color={selectedOption.color ?? theme.primary.val}
            />
          )}
          <Text
            flex={1}
            color={selectedOption ? theme.color.val : theme.colorMuted.val}
            fontSize={14}
            fontFamily="$body"
            numberOfLines={1}
          >
            {selectedOption?.label ?? placeholder}
          </Text>
          <Feather
            name={open ? "chevron-up" : "chevron-down"}
            size={14}
            color={theme.colorMuted.val}
          />
        </XStack>
      </Pressable>

      {/* Inline options */}
      {open && (
        <YStack
          borderWidth={0.5}
          borderColor={theme.borderColor.val}
          backgroundColor={theme.card.val}
          borderRadius={12}
          overflow="hidden"
        >
          {allowClear && (
            <Pressable onPress={() => handleSelect(null)}>
              <XStack
                paddingHorizontal={12}
                paddingVertical={10}
                alignItems="center"
                gap={8}
                backgroundColor={value === null ? theme.accent.val : "transparent"}
              >
                <Text flex={1} color={theme.colorMuted.val} fontSize={14} fontFamily="$body">
                  None
                </Text>
                {value === null && <Feather name="check" size={14} color={theme.primary.val} />}
              </XStack>
            </Pressable>
          )}
          {options.map((option, idx) => (
            <Pressable key={option.value} onPress={() => handleSelect(option.value)}>
              <XStack
                paddingHorizontal={12}
                paddingVertical={10}
                alignItems="center"
                gap={8}
                backgroundColor={value === option.value ? theme.accent.val : "transparent"}
                borderTopWidth={idx > 0 || allowClear ? 0.5 : 0}
                borderTopColor={theme.borderColor.val}
              >
                {option.icon && (
                  <Feather
                    name={option.icon}
                    size={14}
                    color={
                      option.color ??
                      (value === option.value ? theme.primary.val : theme.colorMuted.val)
                    }
                  />
                )}
                <Text
                  flex={1}
                  color={value === option.value ? theme.primary.val : theme.color.val}
                  fontSize={14}
                  fontFamily="$body"
                  numberOfLines={1}
                >
                  {option.label}
                </Text>
                {value === option.value && (
                  <Feather name="check" size={14} color={theme.primary.val} />
                )}
              </XStack>
            </Pressable>
          ))}
        </YStack>
      )}
    </YStack>
  );
}
