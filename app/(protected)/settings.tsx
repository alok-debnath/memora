import React from "react";
import { Platform, StyleSheet } from "react-native";
import { Text, XStack, YStack } from "tamagui";

import { AppScreen } from "@/components/ui/AppScreen";
import { Card } from "@/components/ui/Card";
import { HexColorPicker } from "@/components/ui/HexColorPicker";
import { PressableScale } from "@/components/ui/PressableScale";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { withAlpha } from "@/components/ui/themeHelpers";
import {
  MEMORA_ACCENT,
  getAndroidSystemAccentColor,
  themeAccentPresets,
  type ThemeAccentSource,
  type ThemeMode,
} from "@/constants/themePalettes";
import { useAppTheme } from "@/hooks/useAppTheme";
import { Feather, type FeatherIconName } from "@/lib/icons";
import { useThemeStore } from "@/store/theme";

const themeModeOptions: Array<{
  key: ThemeMode;
  label: string;
  icon: FeatherIconName;
}> = [
  { key: "system", label: "System", icon: "smartphone" },
  { key: "light", label: "Light", icon: "sun" },
  { key: "dark", label: "Dark", icon: "moon" },
];

type AccentOption = {
  key: ThemeAccentSource;
  label: string;
  color: string;
  icon?: FeatherIconName;
};

export default function AppSettingsScreen() {
  const theme = useAppTheme();
  const {
    mode,
    resolvedMode,
    accentSource,
    accentColor,
    resolvedAccentColor,
    setMode,
    setAccentSource,
  } = useThemeStore();
  const [pickerColor, setPickerColor] = React.useState(resolvedAccentColor);
  React.useEffect(() => {
    setPickerColor(resolvedAccentColor);
  }, [resolvedAccentColor]);
  const androidSystemColor = getAndroidSystemAccentColor();

  const accentOptions: AccentOption[] = [
    { key: "memora", label: "Memora", color: MEMORA_ACCENT, icon: "star" },
    ...themeAccentPresets
      .filter((preset) => preset.color !== MEMORA_ACCENT)
      .map((preset) => ({ key: "preset" as const, label: preset.label, color: preset.color })),
    ...(Platform.OS === "android" && androidSystemColor
      ? [
          {
            key: "androidSystem" as const,
            label: "System",
            color: androidSystemColor,
            icon: "smartphone" as const,
          },
        ]
      : []),
  ];

  // Shared by preset taps and the hex picker's release commit — both are just
  // "apply this hex under this source" (setAccentSource("custom", hex) is
  // equivalent to setCustomColor(hex)). Full app re-theme (palette rebuild +
  // persistence) only runs here, never per drag frame — see HexColorPicker's
  // onChange vs onChangeEnd docs.
  const applyAccent = React.useCallback(
    (source: ThemeAccentSource, hex: string) => {
      const normalized = hex.toUpperCase();
      if (source === "custom" && normalized === resolvedAccentColor.toUpperCase()) return;
      setAccentSource(source, normalized);
    },
    [resolvedAccentColor, setAccentSource],
  );

  return (
    <AppScreen showBack title="App Settings">
      <YStack gap={16}>
        <YStack>
          <SectionLabel>Appearance</SectionLabel>
          <Card style={styles.groupCard}>
            <YStack gap={14}>
              <YStack gap={3}>
                <Text fontSize={15} fontFamily="$body" color={theme.color.val}>
                  Theme
                </Text>
                <Text fontSize={12} fontFamily="$body" lineHeight={18} color={theme.colorMuted.val}>
                  Follow your device or force a specific mode. Active: {resolvedMode}.
                </Text>
              </YStack>
              <XStack gap={8}>
                {themeModeOptions.map((option) => {
                  const isActive = mode === option.key;
                  return (
                    <PressableScale
                      key={option.key}
                      onPress={() => setMode(option.key)}
                      style={[
                        styles.modeChip,
                        {
                          backgroundColor: isActive
                            ? withAlpha(theme.primary.val, "18")
                            : theme.secondary.val,
                          borderColor: isActive ? theme.primary.val : theme.borderColor.val,
                        },
                      ]}
                    >
                      <Feather
                        name={option.icon}
                        size={16}
                        color={isActive ? theme.primary.val : theme.colorMuted.val}
                      />
                      <Text
                        fontSize={13}
                        fontFamily="$heading"
                        fontWeight="600"
                        color={isActive ? theme.primary.val : theme.color.val}
                      >
                        {option.label}
                      </Text>
                    </PressableScale>
                  );
                })}
              </XStack>
            </YStack>
          </Card>
        </YStack>

        <YStack>
          <SectionLabel>Color</SectionLabel>
          <Card style={styles.groupCard}>
            <YStack gap={16}>
              <XStack flexWrap="wrap" gap={10}>
                {accentOptions.map((option) => {
                  const isActive =
                    accentSource === option.key &&
                    (option.key === "androidSystem" || accentColor === option.color);
                  return (
                    <PressableScale
                      key={`${option.key}-${option.color}`}
                      onPress={() => applyAccent(option.key, option.color)}
                      style={[
                        styles.swatchButton,
                        {
                          borderColor: isActive ? theme.primary.val : theme.borderColor.val,
                          backgroundColor: isActive
                            ? withAlpha(theme.primary.val, "10")
                            : theme.backgroundStrong.val,
                        },
                      ]}
                    >
                      <YStack
                        width={26}
                        height={26}
                        borderRadius={13}
                        backgroundColor={option.color}
                        alignItems="center"
                        justifyContent="center"
                      >
                        {option.icon ? (
                          <Feather name={option.icon} size={12} color={theme.textInverse.val} />
                        ) : null}
                      </YStack>
                      <Text
                        fontSize={12}
                        fontFamily="$body"
                        fontWeight="700"
                        color={isActive ? theme.primary.val : theme.color.val}
                      >
                        {option.label}
                      </Text>
                    </PressableScale>
                  );
                })}
              </XStack>

              <YStack gap={10}>
                <Text
                  fontSize={12}
                  fontFamily="$heading"
                  fontWeight="700"
                  color={theme.colorMuted.val}
                >
                  Custom Hex
                </Text>
                <HexColorPicker
                  value={pickerColor}
                  onChange={setPickerColor}
                  onChangeEnd={(hex) => applyAccent("custom", hex)}
                />
              </YStack>
            </YStack>
          </Card>
        </YStack>

        <YStack>
          <SectionLabel>Dictation privacy</SectionLabel>
          <Card style={styles.groupCard}>
            <Text fontSize={13} fontFamily="$body" lineHeight={19} color={theme.colorMuted.val}>
              Voice recordings are sent temporarily to your configured transcription provider.
              Memora deletes the audio after transcription and does not keep it as an attachment or
              include it in exports.
            </Text>
          </Card>
        </YStack>
      </YStack>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  groupCard: { gap: 0 },
  modeChip: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  swatchButton: {
    minHeight: 48,
    borderRadius: 15,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
});
