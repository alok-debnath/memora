import React from "react";
import { Alert, Platform, StyleSheet, Switch } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAction, useMutation, useQuery } from "convex/react";
import { Text, XStack, YStack } from "tamagui";

import { AppScreen, SectionCard } from "@/components/ui/AppScreen";
import { HexColorPicker } from "@/components/ui/HexColorPicker";
import { AppButton } from "@/components/ui/AppButton";
import { PickerField } from "@/components/ui/PickerField";
import { WorkspaceSplit } from "@/components/ui/Responsive";
import { PressableScale } from "@/components/ui/PressableScale";
import { AiProviderSettingsCard } from "@/components/settings/AiProviderSettingsCard";
import { withAlpha } from "@/components/ui/themeHelpers";
import {
  MEMORA_ACCENT,
  getAndroidSystemAccentColor,
  themeAccentPresets,
  type ThemeAccentSource,
  type ThemeMode,
} from "@/constants/themePalettes";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import { useAuth } from "@/hooks/useAuth";
import { useAppRouter } from "@/hooks/useAppRouter";
import { useAppConfirm } from "@/components/ui/confirm/AppConfirmProvider";
import { api } from "@/convex/_generated/api";
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

type SettingsSection = "appearance" | "notifications" | "privacy" | "account";

const SETTINGS_SECTIONS: Array<{
  value: SettingsSection;
  label: string;
  description: string;
  icon: FeatherIconName;
}> = [
  { value: "appearance", label: "Appearance", description: "Theme and accent", icon: "sliders" },
  {
    value: "notifications",
    label: "Notifications",
    description: "Reviews and alerts",
    icon: "bell",
  },
  {
    value: "privacy",
    label: "Privacy & AI",
    description: "Dictation and providers",
    icon: "shield",
  },
  { value: "account", label: "Data & account", description: "Export and access", icon: "database" },
];

const REVIEW_TIME_OPTIONS = ["07:00", "08:00", "09:00", "12:00", "18:00", "20:00"].map((value) => ({
  value,
  label: value,
}));

const WEEKDAY_OPTIONS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
].map((value) => ({ value, label: value.charAt(0).toUpperCase() + value.slice(1) }));

function SettingsSectionRow({
  icon,
  label,
  description,
  active = false,
  onPress,
}: {
  icon: FeatherIconName;
  label: string;
  description: string;
  active?: boolean;
  onPress: () => void;
}) {
  const theme = useAppTheme();
  return (
    <PressableScale onPress={onPress} disabled={active}>
      <XStack
        alignItems="center"
        gap={10}
        paddingHorizontal={10}
        paddingVertical={9}
        borderRadius={12}
        backgroundColor={active ? withAlpha(theme.primary.val, "16") : "transparent"}
      >
        <Feather name={icon} size={15} color={active ? theme.primary.val : theme.colorMuted.val} />
        <YStack flex={1} gap={1}>
          <Text fontSize={12} fontWeight="700" color={active ? theme.primary.val : theme.color.val}>
            {label}
          </Text>
          <Text fontSize={10} color={theme.colorMuted.val}>
            {description}
          </Text>
        </YStack>
        {!active ? <Feather name="chevron-right" size={14} color={theme.colorMuted.val} /> : null}
      </XStack>
    </PressableScale>
  );
}

function SettingToggleRow({
  icon,
  title,
  description,
  value,
  onChange,
}: {
  icon: FeatherIconName;
  title: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const theme = useAppTheme();
  return (
    <XStack alignItems="center" gap={12} paddingVertical={8}>
      <YStack
        width={36}
        height={36}
        borderRadius={11}
        alignItems="center"
        justifyContent="center"
        backgroundColor={withAlpha(theme.primary.val, "12")}
      >
        <Feather name={icon} size={15} color={theme.primary.val} />
      </YStack>
      <YStack flex={1} gap={2}>
        <Text fontSize={13} fontWeight="700" color={theme.color.val}>
          {title}
        </Text>
        <Text fontSize={11} lineHeight={16} color={theme.colorMuted.val}>
          {description}
        </Text>
      </YStack>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: theme.primary.val, false: theme.borderColor.val }}
        thumbColor={theme.textInverse.val}
      />
    </XStack>
  );
}

export default function AppSettingsScreen() {
  const theme = useAppTheme();
  const responsive = useResponsiveLayout();
  const router = useAppRouter();
  const { confirm } = useAppConfirm();
  const { token, logout } = useAuth();
  const [activeSection, setActiveSection] = React.useState<SettingsSection>("appearance");
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
  const [showCustomColor, setShowCustomColor] = React.useState(false);
  const [isExporting, setIsExporting] = React.useState(false);
  const notificationPrefs = useQuery(api.notifications.get, token ? { token } : "skip");
  const updateNotifications = useMutation(api.notifications.upsert);
  const deleteAccount = useMutation(api.auth.deleteAccount);
  const exportData = useAction(api.dataExport.exportAllDataOnce);
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

  const updateNotificationPreference = async (patch: {
    dailyReview?: boolean;
    dailyReviewTime?: string;
    weeklyDigest?: boolean;
    weeklyDigestDay?: string;
    memoryNudges?: boolean;
    capsuleAlerts?: boolean;
    pushEnabled?: boolean;
  }) => {
    if (!token) return;
    await updateNotifications({ token, ...patch });
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const data = await exportData({});
      if (Platform.OS === "web") {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "memora-export.json";
        anchor.click();
        URL.revokeObjectURL(url);
      } else {
        Alert.alert("Export ready", "Your Memora data was prepared successfully.");
      }
    } finally {
      setIsExporting(false);
    }
  };

  const handleLogout = async () => {
    const accepted = await confirm({
      title: "Log out",
      message: "Log out of Memora on this device?",
      confirmLabel: "Log out",
      icon: "log-out",
    });
    if (!accepted) return;
    await logout();
    router.replace("/(public)/(auth)/login");
  };

  const handleDeleteAccount = async () => {
    const accepted = await confirm({
      title: "Delete account",
      message: "This permanently deletes your app data and profile.",
      confirmLabel: "Delete account",
      tone: "destructive",
      icon: "trash-2",
    });
    if (!accepted) return;
    await deleteAccount({});
    await AsyncStorage.clear();
    await logout();
    router.replace("/(public)/(auth)/login");
  };

  return (
    <AppScreen
      showBack
      title="Settings"
      subtitle="Manage appearance, notifications, privacy, AI, and account preferences."
      contentWidth="workspace"
    >
      {!responsive.isExpanded ? (
        <PickerField
          label="Settings section"
          stacked
          value={activeSection}
          options={SETTINGS_SECTIONS.map((section) => ({
            value: section.value,
            label: section.label,
            icon: section.icon,
          }))}
          onChange={(value) => value && setActiveSection(value as SettingsSection)}
        />
      ) : null}
      <WorkspaceSplit
        splitAt={860}
        asideWidth={260}
        asideFirstOnCompact
        asidePosition="start"
        aside={
          responsive.isExpanded ? (
            <SectionCard
              title="Settings sections"
              eyebrow="Preferences"
              density="compact"
              emphasis="quiet"
            >
              <YStack gap={6}>
                {SETTINGS_SECTIONS.map((section) => (
                  <SettingsSectionRow
                    key={section.value}
                    {...section}
                    active={activeSection === section.value}
                    onPress={() => setActiveSection(section.value)}
                  />
                ))}
              </YStack>
            </SectionCard>
          ) : null
        }
      >
        <YStack gap={16}>
          {activeSection === "appearance" ? (
            <>
              <SectionCard title="Theme mode" eyebrow="Appearance" emphasis="quiet">
                <Text fontSize={12} lineHeight={18} color={theme.colorMuted.val}>
                  Follow your device or keep Memora in a specific mode. Active: {resolvedMode}.
                </Text>
                <XStack gap={8} flexWrap="wrap">
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
                          fontFamily="$body"
                          fontWeight="600"
                          color={isActive ? theme.primary.val : theme.color.val}
                        >
                          {option.label}
                        </Text>
                      </PressableScale>
                    );
                  })}
                </XStack>
              </SectionCard>

              <SectionCard title="Accent color" eyebrow="Appearance" emphasis="quiet">
                <Text fontSize={12} lineHeight={18} color={theme.colorMuted.val}>
                  Choose the color used for selection, focus, and primary actions.
                </Text>
                <XStack flexWrap="wrap" gap={10}>
                  {accentOptions.map((option) => {
                    const isActive =
                      accentSource === option.key &&
                      (option.key === "androidSystem" || accentColor === option.color);
                    return (
                      <PressableScale
                        key={`${option.key}-${option.color}`}
                        onPress={() => {
                          applyAccent(option.key, option.color);
                          setShowCustomColor(false);
                        }}
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
                          fontWeight="700"
                          color={isActive ? theme.primary.val : theme.color.val}
                        >
                          {option.label}
                        </Text>
                      </PressableScale>
                    );
                  })}
                  <PressableScale
                    onPress={() => setShowCustomColor((value) => !value)}
                    style={[
                      styles.swatchButton,
                      {
                        borderColor:
                          accentSource === "custom" ? theme.primary.val : theme.borderColor.val,
                        backgroundColor: showCustomColor
                          ? withAlpha(theme.primary.val, "10")
                          : theme.backgroundStrong.val,
                      },
                    ]}
                  >
                    <Feather name="edit-3" size={15} color={theme.primary.val} />
                    <Text fontSize={12} fontWeight="700" color={theme.color.val}>
                      Custom
                    </Text>
                  </PressableScale>
                </XStack>

                {showCustomColor ? (
                  <YStack gap={10} maxWidth={620} paddingTop={4}>
                    <HexColorPicker
                      value={pickerColor}
                      onChange={setPickerColor}
                      onChangeEnd={(hex) => applyAccent("custom", hex)}
                    />
                  </YStack>
                ) : null}
              </SectionCard>
            </>
          ) : null}

          {activeSection === "notifications" ? (
            <SectionCard title="Notification schedule" eyebrow="Notifications" emphasis="quiet">
              <SettingToggleRow
                icon="sun"
                title="Daily review"
                description={`Include due review cards each day at ${notificationPrefs?.dailyReviewTime ?? "09:00"}.`}
                value={notificationPrefs?.dailyReview ?? true}
                onChange={(value) => void updateNotificationPreference({ dailyReview: value })}
              />
              {(notificationPrefs?.dailyReview ?? true) ? (
                <PickerField
                  label="Daily review time"
                  stacked
                  value={notificationPrefs?.dailyReviewTime ?? "09:00"}
                  options={REVIEW_TIME_OPTIONS}
                  onChange={(value) =>
                    value && void updateNotificationPreference({ dailyReviewTime: value })
                  }
                />
              ) : null}
              <SettingToggleRow
                icon="calendar"
                title="Weekly digest"
                description={`Receive a memory summary every ${notificationPrefs?.weeklyDigestDay ?? "Sunday"}.`}
                value={notificationPrefs?.weeklyDigest ?? true}
                onChange={(value) => void updateNotificationPreference({ weeklyDigest: value })}
              />
              {(notificationPrefs?.weeklyDigest ?? true) ? (
                <PickerField
                  label="Weekly digest day"
                  stacked
                  value={(notificationPrefs?.weeklyDigestDay ?? "sunday").toLowerCase()}
                  options={WEEKDAY_OPTIONS}
                  onChange={(value) =>
                    value && void updateNotificationPreference({ weeklyDigestDay: value })
                  }
                />
              ) : null}
              <SettingToggleRow
                icon="zap"
                title="AI nudges"
                description="Allow helpful suggestions based on your patterns."
                value={notificationPrefs?.memoryNudges ?? true}
                onChange={(value) => void updateNotificationPreference({ memoryNudges: value })}
              />
              <SettingToggleRow
                icon="bell"
                title="Push notifications"
                description="Enable reminder and review alerts on supported devices."
                value={notificationPrefs?.pushEnabled ?? false}
                onChange={(value) => void updateNotificationPreference({ pushEnabled: value })}
              />
              <SettingToggleRow
                icon="package"
                title="Capsule alerts"
                description="Notify you when future memories unlock."
                value={notificationPrefs?.capsuleAlerts ?? true}
                onChange={(value) => void updateNotificationPreference({ capsuleAlerts: value })}
              />
            </SectionCard>
          ) : null}

          {activeSection === "privacy" ? (
            <>
              <SectionCard title="Dictation privacy" eyebrow="Privacy" emphasis="quiet">
                <XStack alignItems="flex-start" gap={12}>
                  <Feather name="mic" size={17} color={theme.primary.val} />
                  <Text flex={1} fontSize={12} lineHeight={19} color={theme.colorMuted.val}>
                    On-device dictation keeps speech processing on your device. Cloud transcription
                    temporarily sends audio to your configured provider, then deletes the recording.
                    Memora does not add dictation recordings to your archive or data export.
                  </Text>
                </XStack>
              </SectionCard>
              <AiProviderSettingsCard />
            </>
          ) : null}

          {activeSection === "account" ? (
            <>
              <SectionCard title="Your data" eyebrow="Data & account" emphasis="quiet">
                <Text fontSize={12} lineHeight={18} color={theme.colorMuted.val}>
                  Download memories, diary entries, and your current profile snapshot as JSON.
                </Text>
                <AppButton
                  title={isExporting ? "Preparing export…" : "Export data"}
                  icon="download"
                  onPress={() => void handleExport()}
                  loading={isExporting}
                />
              </SectionCard>
              <SectionCard title="Session" eyebrow="Account" emphasis="quiet">
                <AppButton
                  title="Log out"
                  icon="log-out"
                  variant="secondary"
                  onPress={() => void handleLogout()}
                />
              </SectionCard>
              <SectionCard title="Delete account" eyebrow="Danger zone" emphasis="quiet">
                <Text fontSize={12} lineHeight={18} color={theme.colorMuted.val}>
                  Permanently remove your profile and app data. This cannot be undone.
                </Text>
                <AppButton
                  title="Delete account"
                  icon="trash-2"
                  variant="secondary"
                  tone="error"
                  onPress={() => void handleDeleteAccount()}
                />
              </SectionCard>
            </>
          ) : null}
        </YStack>
      </WorkspaceSplit>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  modeChip: {
    flexGrow: 1,
    minWidth: 130,
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
