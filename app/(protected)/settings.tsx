import React from "react";
import { Platform, StyleSheet, TextInput } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Text, XStack, YStack } from "tamagui";

import { AppScreen } from "@/components/ui/AppScreen";
import { Card } from "@/components/ui/Card";
import { PressableScale } from "@/components/ui/PressableScale";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { useAppToast } from "@/components/ui/toast";
import { withAlpha } from "@/components/ui/themeHelpers";
import { FontFamily } from "@/constants/fonts";
import {
  MEMORA_ACCENT,
  createThemeGradient,
  getAndroidSystemAccentColor,
  isValidThemeHex,
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
  const { showToast } = useAppToast();
  const {
    mode,
    resolvedMode,
    accentSource,
    accentColor,
    customColor,
    resolvedAccentColor,
    setMode,
    setAccentSource,
    setCustomColor,
  } = useThemeStore();
  const [customInput, setCustomInput] = React.useState(customColor);
  const androidSystemColor = getAndroidSystemAccentColor();
  const previewGradient = React.useMemo(
    () => createThemeGradient(resolvedAccentColor, resolvedMode),
    [resolvedAccentColor, resolvedMode],
  );

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

  function applyCustomColor() {
    const normalized = customInput.trim().toUpperCase();
    if (!isValidThemeHex(normalized)) {
      showToast({
        title: "Invalid color",
        message: "Use # followed by six hex digits.",
        tone: "error",
      });
      return;
    }
    setCustomColor(normalized);
    showToast({ title: "Theme updated", tone: "success" });
  }

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
              <LinearGradient
                colors={[...previewGradient]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.preview}
              >
                <YStack gap={4}>
                  <Text
                    fontSize={12}
                    fontFamily="$body"
                    fontWeight="700"
                    color={theme.textInverse.val}
                  >
                    Active Accent
                  </Text>
                  <Text
                    fontSize={24}
                    fontFamily="$heading"
                    fontWeight="800"
                    color={theme.textInverse.val}
                  >
                    {resolvedAccentColor}
                  </Text>
                </YStack>
              </LinearGradient>

              <XStack flexWrap="wrap" gap={10}>
                {accentOptions.map((option) => {
                  const isActive =
                    accentSource === option.key &&
                    (option.key === "androidSystem" || accentColor === option.color);
                  return (
                    <PressableScale
                      key={`${option.key}-${option.color}`}
                      onPress={() => setAccentSource(option.key, option.color)}
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

              <YStack gap={8}>
                <Text
                  fontSize={12}
                  fontFamily="$heading"
                  fontWeight="700"
                  color={theme.colorMuted.val}
                >
                  Custom Hex
                </Text>
                <XStack gap={8} alignItems="center">
                  <TextInput
                    value={customInput}
                    onChangeText={setCustomInput}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={7}
                    placeholder="Accent hex"
                    placeholderTextColor={theme.colorMuted.val}
                    style={[
                      styles.input,
                      {
                        color: theme.color.val,
                        borderColor: theme.borderColor.val,
                        backgroundColor: theme.secondary.val,
                      },
                    ]}
                  />
                  <PressableScale
                    onPress={applyCustomColor}
                    style={[
                      styles.applyButton,
                      {
                        backgroundColor: theme.primary.val,
                        borderColor: withAlpha(theme.textInverse.val, "2B"),
                      },
                    ]}
                  >
                    <Feather name="check" size={17} color={theme.textInverse.val} />
                  </PressableScale>
                </XStack>
              </YStack>
            </YStack>
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
  preview: {
    minHeight: 116,
    borderRadius: 18,
    padding: 16,
    justifyContent: "flex-end",
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
  input: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 15,
    fontFamily: FontFamily.medium,
  },
  applyButton: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
