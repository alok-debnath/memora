import React from "react";
import { Platform, Switch, TextInput } from "react-native";
import DateTimePicker from "@expo/ui/community/datetime-picker";
import dayjs from "dayjs";
import { Feather } from "@/lib/icons";
import { XStack, YStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import { FontFamily } from "@/constants/fonts";

interface TimeCapsuleToggleProps {
  enabled: boolean;
  date: string;
  onToggle: (enabled: boolean) => void;
  onDateChange: (date: string) => void;
}

function getPickerDate(value: string) {
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.toDate() : new Date();
}

function mergeDatePart(currentValue: string, selectedDate: Date) {
  const current = dayjs(currentValue);
  const base = current.isValid() ? current : dayjs();
  return dayjs(selectedDate)
    .hour(base.hour())
    .minute(base.minute())
    .second(0)
    .millisecond(0)
    .toISOString();
}

function mergeTimePart(currentValue: string, selectedTime: Date) {
  const current = dayjs(currentValue);
  const base = current.isValid() ? current : dayjs();
  const time = dayjs(selectedTime);
  return base.hour(time.hour()).minute(time.minute()).second(0).millisecond(0).toISOString();
}

export function TimeCapsuleToggle({
  enabled,
  date,
  onToggle,
  onDateChange,
}: TimeCapsuleToggleProps) {
  const theme = useAppTheme();
  const pickerDate = getPickerDate(date);

  return (
    <YStack
      borderWidth={0.5}
      borderColor="$borderColor"
      backgroundColor="$card"
      borderRadius={14}
      overflow="hidden"
    >
      <XStack alignItems="center" gap={12} padding={14}>
        <Feather name="lock" size={18} color={theme.colorMuted.val} />
        <YStack flex={1}>
          <Text color="$color" fontSize={14} fontFamily="$body" fontWeight="600">
            Time Capsule
          </Text>
          <Text color="$colorMuted" fontSize={12} fontFamily="$body" marginTop={1}>
            Lock until a future date
          </Text>
        </YStack>
        <Switch
          value={enabled}
          onValueChange={onToggle}
          trackColor={{ true: theme.primary.val, false: theme.borderColor.val }}
          thumbColor={theme.textInverse.val}
        />
      </XStack>
      {enabled ? (
        <YStack
          gap={10}
          paddingHorizontal={14}
          paddingVertical={10}
          borderTopWidth={0.5}
          borderTopColor="$borderColor"
        >
          <XStack alignItems="center" gap={8}>
            <Feather name="calendar" size={14} color={theme.colorMuted.val} />
            <Text flex={1} color="$color" fontSize={14} fontFamily="$body">
              {date ? dayjs(date).format("MMM D, YYYY - h:mm A") : "Select unlock date"}
            </Text>
          </XStack>
          {Platform.OS === "web" ? (
            <TextInput
              value={date}
              onChangeText={onDateChange}
              placeholder="yyyy-mm-ddTHH:MM"
              placeholderTextColor={theme.colorMuted.val}
              autoCapitalize="none"
              style={{
                flex: 1,
                fontSize: 14,
                fontFamily: FontFamily.regular,
                color: theme.color.val,
              }}
            />
          ) : Platform.OS === "ios" ? (
            <DateTimePicker
              value={pickerDate}
              mode="datetime"
              display="compact"
              presentation="inline"
              accentColor={theme.primary.val}
              onValueChange={(_, value) => onDateChange(dayjs(value).toISOString())}
              style={{ alignSelf: "flex-start" }}
            />
          ) : (
            <YStack gap={10}>
              <DateTimePicker
                value={pickerDate}
                mode="date"
                display="inline"
                presentation="inline"
                accentColor={theme.primary.val}
                onValueChange={(_, value) => onDateChange(mergeDatePart(date, value))}
                style={{ alignSelf: "stretch" }}
              />
              <DateTimePicker
                value={pickerDate}
                mode="time"
                display="inline"
                presentation="inline"
                accentColor={theme.primary.val}
                onValueChange={(_, value) => onDateChange(mergeTimePart(date, value))}
                style={{ alignSelf: "stretch" }}
              />
            </YStack>
          )}
        </YStack>
      ) : null}
    </YStack>
  );
}
