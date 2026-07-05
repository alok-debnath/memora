import React from "react";
import { Platform, Switch, Alert, TextInput, Pressable, StyleSheet } from "react-native";
import DateTimePicker from "@expo/ui/community/datetime-picker";
import dayjs from "dayjs";
import { XStack, YStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import { Feather, type FeatherIconName } from "@/lib/icons";
import { appRouter as router } from "@/lib/appRouter";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/Card";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { PressableScale } from "@/components/ui/PressableScale";
import { GradientButton } from "@/components/ui/GradientButton";
import { Badge } from "@/components/ui/Badge";
import { MorePageScaffold } from "@/components/ui/MorePageScaffold";
import { useAppToast } from "@/components/ui/toast";
import { useAppConfirm } from "@/components/ui/confirm/AppConfirmProvider";
import { FontFamily } from "@/constants/fonts";
import { Dropdown, type IDropdownRef } from "react-native-element-dropdown";
import { getTimeZones } from "@vvo/tzdb";
import * as Google from "expo-auth-session/providers/google";
import { makeRedirectUri } from "expo-auth-session";
import { canUseGoogleCalendar, canUseGoogleDrive } from "@/lib/googleIntegration";

type TimezoneOption = {
  value: string;
  label: string;
  searchText: string;
  offsetInMinutes: number;
};

type VisibleAiCapability = "chat" | "structured_text" | "embeddings" | "vision" | "transcription";

const formatUtcOffset = (offsetInMinutes: number) => {
  const sign = offsetInMinutes >= 0 ? "+" : "-";
  const absoluteMinutes = Math.abs(offsetInMinutes);
  const hours = String(Math.floor(absoluteMinutes / 60)).padStart(2, "0");
  const minutes = String(absoluteMinutes % 60).padStart(2, "0");
  return `UTC${sign}${hours}:${minutes}`;
};

const formatUsdMicros = (value: number) =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100_000 ? 2 : 4,
  }).format(value / 1_000_000);

// Computed once at module load — avoids blocking the JS thread on every mount.
const ALL_TIMEZONE_OPTIONS: TimezoneOption[] = getTimeZones({
  includeUtc: true,
})
  .map((tz) => ({
    value: tz.name,
    label: `${tz.name} (${formatUtcOffset(tz.currentTimeOffsetInMinutes)})`,
    searchText: [
      tz.name,
      tz.alternativeName,
      tz.countryName,
      tz.abbreviation,
      ...tz.mainCities,
    ].join(" "),
    offsetInMinutes: tz.currentTimeOffsetInMinutes,
  }))
  .sort((a, b) =>
    a.offsetInMinutes === b.offsetInMinutes
      ? a.value.localeCompare(b.value)
      : a.offsetInMinutes - b.offsetInMinutes,
  );

function IntegrationFeatureRow({
  theme,
  icon,
  title,
  description,
  value,
  disabled,
  onValueChange,
}: {
  theme: ReturnType<typeof useAppTheme>;
  icon: FeatherIconName;
  title: string;
  description: string;
  value: boolean;
  disabled: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <XStack alignItems="center" gap={12}>
      <YStack
        width={34}
        height={34}
        borderRadius={12}
        alignItems="center"
        justifyContent="center"
        backgroundColor={theme.primary.val + "12"}
      >
        <Feather name={icon} size={16} color={theme.primary.val} />
      </YStack>
      <YStack flex={1} gap={2}>
        <Text fontSize={14} fontFamily="$body" fontWeight="600" color={theme.color.val}>
          {title}
        </Text>
        <Text fontSize={12} fontFamily="$body" lineHeight={17} color={theme.colorMuted.val}>
          {description}
        </Text>
      </YStack>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{
          true: theme.primary.val,
          false: theme.borderColor.val,
        }}
        thumbColor={theme.textInverse.val}
      />
    </XStack>
  );
}

function getTimePreferenceDate(value: string) {
  const [hours = "9", minutes = "0"] = value.split(":");
  return dayjs()
    .hour(Number.parseInt(hours, 10) || 0)
    .minute(Number.parseInt(minutes, 10) || 0)
    .second(0)
    .millisecond(0)
    .toDate();
}

function formatTimePreference(date: Date) {
  return dayjs(date).format("HH:mm");
}

function TimePreferenceField({
  label,
  value,
  placeholder,
  theme,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  theme: ReturnType<typeof useAppTheme>;
  onChange: (value: string) => void;
}) {
  const [showAndroidPicker, setShowAndroidPicker] = React.useState(false);
  const pickerDate = getTimePreferenceDate(value || placeholder);

  return (
    <YStack gap={6}>
      <Text
        fontSize={12}
        fontFamily="$heading"
        fontWeight="600"
        textTransform="uppercase"
        letterSpacing={0.8}
        marginLeft={4}
        color={theme.colorMuted.val}
      >
        {label}
      </Text>
      {Platform.OS === "web" ? (
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={theme.colorMuted.val}
          style={[
            styles.input,
            {
              backgroundColor: theme.secondary.val,
              color: theme.color.val,
              borderColor: theme.borderColor.val,
            },
          ]}
        />
      ) : Platform.OS === "ios" ? (
        <XStack
          alignItems="center"
          justifyContent="space-between"
          style={[
            styles.input,
            {
              backgroundColor: theme.secondary.val,
              borderColor: theme.borderColor.val,
            },
          ]}
        >
          <Text fontSize={15} fontFamily="$body" color={theme.color.val}>
            {value || placeholder}
          </Text>
          <DateTimePicker
            value={pickerDate}
            mode="time"
            display="compact"
            presentation="inline"
            accentColor={theme.primary.val}
            onValueChange={(_, date) => onChange(formatTimePreference(date))}
          />
        </XStack>
      ) : (
        <>
          <Pressable
            onPress={() => setShowAndroidPicker(true)}
            style={[
              styles.input,
              {
                backgroundColor: theme.secondary.val,
                borderColor: theme.borderColor.val,
                justifyContent: "center",
              },
            ]}
          >
            <Text fontSize={15} fontFamily="$body" color={theme.color.val}>
              {value || placeholder}
            </Text>
          </Pressable>
          {showAndroidPicker ? (
            <DateTimePicker
              value={pickerDate}
              mode="time"
              presentation="dialog"
              accentColor={theme.primary.val}
              positiveButton={{ label: "Set" }}
              negativeButton={{ label: "Cancel" }}
              onValueChange={(_, date) => {
                onChange(formatTimePreference(date));
                setShowAndroidPicker(false);
              }}
              onDismiss={() => setShowAndroidPicker(false)}
            />
          ) : null}
        </>
      )}
    </YStack>
  );
}

export default function ProfileScreen() {
  const theme = useAppTheme();
  const { showToast } = useAppToast();
  const { confirm } = useAppConfirm();
  const { user, token, logout } = useAuth();
  const [displayName, setDisplayName] = React.useState(user?.name ?? "");
  const [timezone, setTimezone] = React.useState(
    user?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  );
  const [isSavingProfile, setIsSavingProfile] = React.useState(false);
  const timezoneDropdownRef = React.useRef<IDropdownRef>(null);
  const [timezoneSearchText, setTimezoneSearchText] = React.useState("");
  const timezoneDropdownOptions = React.useMemo<TimezoneOption[]>(() => {
    if (!timezone || ALL_TIMEZONE_OPTIONS.some((option) => option.value === timezone)) {
      return ALL_TIMEZONE_OPTIONS;
    }
    return [
      {
        value: timezone,
        label: `${timezone} (Saved)`,
        searchText: timezone,
        offsetInMinutes: 0,
      },
      ...ALL_TIMEZONE_OPTIONS,
    ];
  }, [timezone]);
  const closeTimezoneDropdown = React.useCallback(() => {
    setTimezoneSearchText("");
    timezoneDropdownRef.current?.close();
  }, []);
  const [exportRequested, setExportRequested] = React.useState(false);
  const exportData = useQuery(api.dataExport.exportAllData, exportRequested ? {} : "skip");

  const nowMs = React.useMemo(() => Date.now(), []);
  const memoryStats = useQuery(api.memories.stats, token ? { token, asOf: nowMs } : "skip");
  const diaryStats = useQuery(api.diary.stats, token ? { token } : "skip");
  const notificationPrefs = useQuery(api.notifications.get, token ? { token } : "skip");
  const updateNotifications = useMutation(api.notifications.upsert);
  const deleteAccount = useMutation(api.auth.deleteAccount);
  const updateProfile = useMutation(api.auth.updateProfile);
  const aiProviderSettings = useQuery(api.aiProviders.getSettings, token ? {} : "skip");
  const aiUsageOverview = useQuery(
    api.analytics.overview,
    token ? { token, range: "30d", spendSource: "combined" } : "skip",
  );
  const setAiByokPreference = useMutation(api.aiProviders.setByokPreference);
  const deleteAiProviderKey = useMutation(api.aiProviders.deleteProviderKey);
  const upsertAiProviderKey = useAction(api.actions.aiProviderKeys.upsertProviderKey);
  const [selectedAiProvider, setSelectedAiProvider] = React.useState<"openai" | "google">("openai");
  const [aiApiKey, setAiApiKey] = React.useState("");
  const [aiBaseUrl, setAiBaseUrl] = React.useState("");
  const [aiCapabilityModels, setAiCapabilityModels] = React.useState<Record<string, string>>({});
  const [isSavingAiKey, setIsSavingAiKey] = React.useState(false);
  const [isUpdatingByok, setIsUpdatingByok] = React.useState(false);

  // --- Google Integration (Calendar + Drive) ---
  const googleIntegration = useQuery(api.integrations.getGoogleIntegration, {
    token: token || undefined,
  });
  const connectGoogle = useAction(api.integrations.connectGoogle);
  const disconnectGoogle = useMutation(api.integrations.disconnectGoogle);
  const updateGoogleIntegrationPreferences = useMutation(
    api.integrations.updateGoogleIntegrationPreferences,
  );
  const [isConnectingGoogle, setIsConnectingGoogle] = React.useState(false);
  const [updatingGoogleFeature, setUpdatingGoogleFeature] = React.useState<
    "calendar" | "drive" | null
  >(null);
  const googlePlatform =
    Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web";
  const googleRedirectUri = React.useMemo(() => {
    if (Platform.OS === "android") {
      return "com.alokdebnath.memora:/profile";
    }

    return makeRedirectUri({
      scheme: "memora",
      path: "profile",
    });
  }, [googlePlatform]);

  const [request, response, promptAsync] = Google.useAuthRequest({
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB,
    scopes: [
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/drive.file",
    ],
    responseType: "code",
    shouldAutoExchangeCode: false,
    redirectUri: googleRedirectUri,
    extraParams: {
      access_type: "offline",
      prompt: "consent",
    },
  });

  React.useEffect(() => {
    if (response?.type === "success" && response.params.code) {
      handleGoogleAuthCode(response.params.code, request?.codeVerifier);
    }
  }, [request?.codeVerifier, response]);

  const handleGoogleAuthCode = async (code: string, codeVerifier?: string) => {
    setIsConnectingGoogle(true);
    try {
      await connectGoogle({
        token: token || undefined,
        code,
        codeVerifier,
        platform: googlePlatform,
        redirectUri: request?.redirectUri ?? googleRedirectUri,
      });
      showToast({
        title: "Google connected",
        message: "Calendar sync and file attachments are now enabled.",
        tone: "success",
      });
    } catch (error: any) {
      showToast({
        title: "Connection failed",
        message: error instanceof Error ? error.message : "Could not connect Google.",
        tone: "error",
        closeMode: "manual",
      });
    } finally {
      setIsConnectingGoogle(false);
    }
  };

  const handleToggleGoogleSync = async () => {
    if (googleIntegration?.connected) {
      const confirmed = await confirm({
        title: "Disconnect Google",
        message: "This will stop calendar sync and disable file attachments.",
        confirmLabel: "Disconnect",
        tone: "destructive",
        icon: "link-2",
      });
      if (!confirmed) return;
      try {
        await disconnectGoogle({ token: token || undefined });
      } catch (e) {
        Alert.alert("Error", "Failed to disconnect");
      }
    } else {
      promptAsync();
    }
  };

  const handleToggleGoogleFeature = async (feature: "calendar" | "drive", value: boolean) => {
    if (!token || !googleIntegration?.connected) return;
    setUpdatingGoogleFeature(feature);
    try {
      await updateGoogleIntegrationPreferences({
        token,
        ...(feature === "calendar" ? { calendarEnabled: value } : { driveEnabled: value }),
      });
      showToast({
        title: value
          ? feature === "calendar"
            ? "Google Calendar enabled"
            : "Google Drive enabled"
          : feature === "calendar"
            ? "Google Calendar disabled"
            : "Google Drive disabled",
        message: value
          ? feature === "calendar"
            ? "Reminder sync is available again."
            : "File uploads and attachments are available again."
          : feature === "calendar"
            ? "Future reminder sync stays off until you turn it back on."
            : "New file uploads stay off until you turn it back on.",
        tone: "success",
      });
    } catch (error) {
      showToast({
        title: "Update failed",
        message:
          error instanceof Error ? error.message : "Unable to update Google integration settings.",
        tone: "error",
      });
    } finally {
      setUpdatingGoogleFeature(null);
    }
  };

  const canUseCalendar = canUseGoogleCalendar(googleIntegration ?? null);
  const canUseDrive = canUseGoogleDrive(googleIntegration ?? null);
  const showGoogleFeatureControls = !!(
    googleIntegration?.connected &&
    (googleIntegration.hasCalendarScope || googleIntegration.hasDriveScope)
  );

  React.useEffect(() => {
    setDisplayName(user?.name ?? "");
  }, [user?.name]);

  React.useEffect(() => {
    setTimezone(user?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  }, [user?.timezone]);

  React.useEffect(() => {
    const preferred = aiProviderSettings?.preference?.preferredProvider;
    if (preferred) {
      setSelectedAiProvider(preferred);
    }
  }, [aiProviderSettings?.preference?.preferredProvider]);

  React.useEffect(() => {
    const selectedConfig = aiProviderSettings?.providers?.find(
      (provider: any) => provider.provider === selectedAiProvider,
    );
    setAiBaseUrl(selectedConfig?.baseUrl ?? "");
  }, [aiProviderSettings?.providers, selectedAiProvider]);

  React.useEffect(() => {
    const selectedConfig = aiProviderSettings?.providers?.find(
      (provider: any) => provider.provider === selectedAiProvider,
    );
    setAiCapabilityModels({
      ...(selectedConfig?.defaultModels ?? {}),
      ...(selectedConfig?.savedModels ?? {}),
    });
  }, [
    aiProviderSettings?.preference?.preferredProvider,
    aiProviderSettings?.providers,
    selectedAiProvider,
  ]);

  React.useEffect(() => {
    if (!exportRequested || !exportData || Platform.OS !== "web") {
      return;
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "memora-export.json";
    a.click();
    URL.revokeObjectURL(url);
    setExportRequested(false);
  }, [exportRequested, exportData]);
  const totalMemories = memoryStats?.totalMemories ?? 0;
  const totalReminders = memoryStats?.totalReminders ?? 0;

  const handleExport = async () => {
    if (Platform.OS === "web") {
      setExportRequested(true);
    } else {
      Alert.alert("Export", `${totalMemories} memories ready for export`);
    }
  };

  const updatePreference = async (patch: {
    dailyReview?: boolean;
    dailyReviewTime?: string;
    weeklyDigest?: boolean;
    weeklyDigestDay?: string;
    memoryNudges?: boolean;
    capsuleAlerts?: boolean;
    pushEnabled?: boolean;
  }) => {
    if (!token) return;
    try {
      await updateNotifications({ token, ...patch });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update preferences.";
      if (Platform.OS === "web") {
        window.alert(message);
      } else {
        Alert.alert("Update failed", message);
      }
    }
  };

  const handleLogout = () => {
    const doLogout = async () => {
      await logout();
      router.replace("/(public)/(auth)/login");
    };
    void (async () => {
      const confirmed = await confirm({
        title: "Logout",
        message: "Are you sure?",
        confirmLabel: "Logout",
        tone: "default",
        icon: "log-out",
      });
      if (confirmed) void doLogout();
    })();
  };

  const handleDeleteAccount = () => {
    const doDelete = async () => {
      try {
        await deleteAccount({});
      } finally {
        await AsyncStorage.clear();
        await logout();
        router.replace("/(public)/(auth)/login");
      }
    };
    void (async () => {
      const confirmed = await confirm({
        title: "Delete Account",
        message: "This will delete your app data and profile. This cannot be undone.",
        confirmLabel: "Delete",
        tone: "destructive",
        icon: "trash-2",
      });
      if (confirmed) void doDelete();
    })();
  };

  const handleSaveProfile = async () => {
    if (!token) return;
    setIsSavingProfile(true);
    try {
      await updateProfile({
        name: displayName,
        timezone,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update profile.";
      if (Platform.OS === "web") {
        window.alert(message);
      } else {
        Alert.alert("Update failed", message);
      }
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleToggleByok = async (value: boolean) => {
    setIsUpdatingByok(true);
    try {
      await setAiByokPreference({
        preferredProvider: selectedAiProvider,
        byokEnabled: value,
        providerModels: {
          [selectedAiProvider]: aiCapabilityModels,
        },
      });
      showToast({
        title: value ? "BYOK enabled" : "BYOK disabled",
        message: value
          ? "Supported AI requests will use your own provider key and selected models."
          : "AI requests will use Memora's provider routing.",
        tone: "success",
      });
    } catch (error) {
      showToast({
        title: "Update failed",
        message: error instanceof Error ? error.message : "Unable to update BYOK settings.",
        tone: "error",
      });
    } finally {
      setIsUpdatingByok(false);
    }
  };

  const handleSaveAiKey = async () => {
    if (!aiApiKey.trim()) {
      showToast({
        title: "API key required",
        message: "Paste a provider API key before saving.",
        tone: "error",
      });
      return;
    }
    setIsSavingAiKey(true);
    try {
      await upsertAiProviderKey({
        provider: selectedAiProvider,
        apiKey: aiApiKey.trim(),
        baseUrl: aiBaseUrl.trim() || undefined,
        validate: true,
      });
      await setAiByokPreference({
        preferredProvider: selectedAiProvider,
        byokEnabled: aiProviderSettings?.preference?.byokEnabled ?? false,
        providerModels: {
          [selectedAiProvider]: aiCapabilityModels,
        },
      });
      setAiApiKey("");
      showToast({
        title: "Key saved",
        message: "The API key was encrypted and stored successfully.",
        tone: "success",
      });
    } catch (error) {
      showToast({
        title: "Save failed",
        message: error instanceof Error ? error.message : "Unable to save API key.",
        tone: "error",
        closeMode: "manual",
      });
    } finally {
      setIsSavingAiKey(false);
    }
  };

  const handleDeleteAiKey = async () => {
    const confirmed = await confirm({
      title: "Delete API key",
      message: `Remove your ${selectedAiProvider} API key from Memora?`,
      confirmLabel: "Delete",
      tone: "destructive",
      icon: "trash-2",
    });
    if (!confirmed) return;
    try {
      await deleteAiProviderKey({ provider: selectedAiProvider });
      setAiApiKey("");
      showToast({
        title: "Key removed",
        message: "Stored provider credentials were deleted.",
        tone: "success",
      });
    } catch (error) {
      showToast({
        title: "Delete failed",
        message: error instanceof Error ? error.message : "Unable to delete API key.",
        tone: "error",
      });
    }
  };

  const selectedAiConfig = aiProviderSettings?.providers?.find(
    (provider: any) => provider.provider === selectedAiProvider,
  );
  const isByokEnabled = aiProviderSettings?.preference?.byokEnabled ?? false;
  const embeddingRebuildActive =
    aiProviderSettings?.preference?.embeddingRebuildStatus &&
    aiProviderSettings.preference.embeddingRebuildStatus !== "idle" &&
    aiProviderSettings.preference.embeddingRebuildStatus !== "failed";
  const embeddingRebuildProcessed = aiProviderSettings?.preference?.embeddingRebuildProcessed ?? 0;
  const embeddingRebuildTotal = aiProviderSettings?.preference?.embeddingRebuildTotal ?? 0;

  const formatCapabilityLabel = (capability: string) =>
    capability
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  const capabilityOrder: VisibleAiCapability[] = [
    "chat",
    "structured_text",
    "embeddings",
    "vision",
    "transcription",
  ];
  const previewCapabilityMatrix = capabilityOrder.map((capability: VisibleAiCapability) => {
    const selectedModel =
      aiCapabilityModels[capability] ?? selectedAiConfig?.defaultModels?.[capability];
    const supported = selectedAiConfig?.supportedCapabilities?.includes(capability);
    if (!supported || !selectedModel) {
      return {
        capability,
        available: false,
        label: "Unavailable",
      };
    }
    if (!selectedAiConfig?.configured) {
      return {
        capability,
        available: false,
        label: `${selectedAiProvider} · Needs key · ${selectedModel}`,
      };
    }
    const byokActive =
      aiProviderSettings?.preference?.byokEnabled &&
      aiProviderSettings?.preference?.preferredProvider === selectedAiProvider;
    return {
      capability,
      available: true,
      label: `${selectedAiProvider} · ${byokActive ? "BYOK" : "Ready"} · ${selectedModel}`,
    };
  });

  return (
    <MorePageScaffold
      title="Profile"
      staticHeader
      scrollProps={{ contentContainerStyle: styles.content }}
    >
      <YStack>
        <Card style={{ ...styles.profileCard, padding: 18, borderRadius: 26 }}>
          <XStack alignItems="flex-start" justifyContent="space-between" gap={14}>
            <XStack alignItems="center" gap={14} flex={1}>
              <LinearGradient
                colors={[theme.primary.val, theme.primaryHover.val] as const}
                style={styles.avatar}
              >
                <Text style={[styles.avatarText, { color: theme.textInverse.val }]}>
                  {user?.name?.charAt(0)?.toUpperCase() || "?"}
                </Text>
              </LinearGradient>
              <YStack flex={1} gap={6}>
                <Badge label="Memora account" color={theme.primary.val} />
                <Text fontSize={22} fontFamily="$heading" fontWeight="700" color={theme.color.val}>
                  {user?.name || "User"}
                </Text>
                <Text
                  fontSize={14}
                  fontFamily="$body"
                  color={theme.colorMuted.val}
                  numberOfLines={1}
                >
                  {user?.email || ""}
                </Text>
              </YStack>
            </XStack>
          </XStack>
          <XStack gap={10} marginTop={16}>
            <Card
              style={{
                flex: 1,
                alignItems: "center",
                paddingVertical: 12,
                borderRadius: 18,
              }}
            >
              <Text fontSize={20} fontFamily="$heading" fontWeight="700" color={theme.color.val}>
                {totalMemories}
              </Text>
              <Text fontSize={11} fontFamily="$body" marginTop={2} color={theme.colorMuted.val}>
                Memories
              </Text>
            </Card>
            <Card
              style={{
                flex: 1,
                alignItems: "center",
                paddingVertical: 12,
                borderRadius: 18,
              }}
            >
              <Text fontSize={20} fontFamily="$heading" fontWeight="700" color={theme.color.val}>
                {diaryStats?.totalEntries ?? 0}
              </Text>
              <Text fontSize={11} fontFamily="$body" marginTop={2} color={theme.colorMuted.val}>
                Diary
              </Text>
            </Card>
            <Card
              style={{
                flex: 1,
                alignItems: "center",
                paddingVertical: 12,
                borderRadius: 18,
              }}
            >
              <Text fontSize={20} fontFamily="$heading" fontWeight="700" color={theme.color.val}>
                {totalReminders}
              </Text>
              <Text fontSize={11} fontFamily="$body" marginTop={2} color={theme.colorMuted.val}>
                Reminders
              </Text>
            </Card>
          </XStack>
        </Card>
      </YStack>

      <YStack>
        <SectionLabel>PROFILE</SectionLabel>
        <Card style={styles.groupCard}>
          <YStack gap={6} marginBottom={14}>
            <Text
              fontSize={12}
              fontFamily="$heading"
              fontWeight="600"
              textTransform="uppercase"
              letterSpacing={0.8}
              marginLeft={4}
              color={theme.colorMuted.val}
            >
              Display Name
            </Text>
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Your name"
              placeholderTextColor={theme.colorMuted.val}
              style={[
                styles.input,
                {
                  backgroundColor: theme.secondary.val,
                  color: theme.color.val,
                  borderColor: theme.borderColor.val,
                },
              ]}
            />
          </YStack>
          <YStack gap={6} marginBottom={14}>
            <Text
              fontSize={12}
              fontFamily="$heading"
              fontWeight="600"
              textTransform="uppercase"
              letterSpacing={0.8}
              marginLeft={4}
              color={theme.colorMuted.val}
            >
              Timezone
            </Text>
            <Dropdown
              ref={timezoneDropdownRef}
              data={timezoneDropdownOptions}
              value={timezone}
              labelField="label"
              valueField="value"
              searchField="searchText"
              search
              mode={Platform.OS === "web" ? "auto" : "modal"}
              maxHeight={340}
              placeholder="Select timezone"
              style={[
                styles.input,
                styles.dropdown,
                {
                  backgroundColor: theme.secondary.val,
                  borderColor: theme.borderColor.val,
                },
              ]}
              containerStyle={[
                styles.dropdownContainer,
                Platform.OS !== "web" && styles.dropdownContainerModal,
                {
                  backgroundColor: theme.card.val,
                  borderColor: theme.borderColor.val,
                },
              ]}
              placeholderStyle={[
                styles.dropdownPlaceholderText,
                {
                  color: theme.colorMuted.val,
                  fontFamily: FontFamily.regular,
                },
              ]}
              selectedTextStyle={[
                styles.dropdownSelectedText,
                {
                  color: theme.color.val,
                  fontFamily: FontFamily.regular,
                },
              ]}
              itemContainerStyle={styles.dropdownItemContainer}
              itemTextStyle={[
                styles.dropdownItemText,
                {
                  color: theme.color.val,
                  fontFamily: FontFamily.regular,
                },
              ]}
              activeColor={`${theme.primary.val}1A`}
              iconColor={theme.colorMuted.val}
              onChange={(item) => {
                setTimezone(item.value);
                setTimezoneSearchText("");
              }}
              onBlur={() => setTimezoneSearchText("")}
              renderInputSearch={(onSearch) => (
                <XStack
                  gap={8}
                  alignItems="center"
                  paddingHorizontal={8}
                  paddingTop={8}
                  paddingBottom={6}
                >
                  <TextInput
                    value={timezoneSearchText}
                    onChangeText={(text) => {
                      setTimezoneSearchText(text);
                      onSearch(text);
                    }}
                    placeholder="Search timezone..."
                    placeholderTextColor={theme.colorMuted.val}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="search"
                    style={[
                      styles.dropdownSearchInput,
                      {
                        backgroundColor: theme.background.val,
                        borderColor: theme.borderColor.val,
                        color: theme.color.val,
                        fontFamily: FontFamily.regular,
                      },
                    ]}
                  />
                  <Pressable
                    onPress={closeTimezoneDropdown}
                    accessibilityRole="button"
                    accessibilityLabel="Close timezone selector"
                    hitSlop={8}
                    style={({ pressed }) => [
                      styles.dropdownCloseButton,
                      {
                        backgroundColor: pressed ? `${theme.primary.val}24` : theme.secondary.val,
                        borderColor: theme.borderColor.val,
                      },
                    ]}
                  >
                    <Feather name="x" size={18} color={theme.color.val} />
                  </Pressable>
                </XStack>
              )}
            />
          </YStack>
          <GradientButton
            title="Save Profile"
            onPress={handleSaveProfile}
            icon="save"
            loading={isSavingProfile}
            style={{ marginTop: 8 }}
          />
        </Card>
      </YStack>

      <YStack>
        <SectionLabel>NOTIFICATIONS</SectionLabel>
        <Card style={styles.groupCard}>
          <XStack alignItems="center" gap={12} paddingVertical={10}>
            <YStack flex={1}>
              <Text fontSize={15} fontFamily="$body" color={theme.color.val}>
                Daily Review
              </Text>
              <Text
                fontSize={12}
                fontFamily="$body"
                marginTop={3}
                lineHeight={18}
                color={theme.colorMuted.val}
              >
                Review memories every day at {notificationPrefs?.dailyReviewTime ?? "09:00"}.
              </Text>
            </YStack>
            <Switch
              value={notificationPrefs?.dailyReview ?? true}
              onValueChange={(value: boolean) => updatePreference({ dailyReview: value })}
              trackColor={{
                true: theme.primary.val,
                false: theme.borderColor.val,
              }}
              thumbColor={theme.textInverse.val}
            />
          </XStack>
          <YStack paddingBottom={10}>
            <TimePreferenceField
              label="Daily Review Time"
              value={notificationPrefs?.dailyReviewTime ?? "09:00"}
              placeholder="09:00"
              theme={theme}
              onChange={(value) => updatePreference({ dailyReviewTime: value })}
            />
          </YStack>
          <YStack height={StyleSheet.hairlineWidth} backgroundColor={theme.borderColor.val} />
          <XStack alignItems="center" gap={12} paddingVertical={10}>
            <YStack flex={1}>
              <Text fontSize={15} fontFamily="$body" color={theme.color.val}>
                Weekly Digest
              </Text>
              <Text
                fontSize={12}
                fontFamily="$body"
                marginTop={3}
                lineHeight={18}
                color={theme.colorMuted.val}
              >
                Summarize your week every {notificationPrefs?.weeklyDigestDay ?? "Sunday"}.
              </Text>
            </YStack>
            <Switch
              value={notificationPrefs?.weeklyDigest ?? true}
              onValueChange={(value: boolean) => updatePreference({ weeklyDigest: value })}
              trackColor={{
                true: theme.primary.val,
                false: theme.borderColor.val,
              }}
              thumbColor={theme.textInverse.val}
            />
          </XStack>
          <YStack paddingBottom={10}>
            <YStack gap={6}>
              <Text
                fontSize={12}
                fontFamily="$heading"
                fontWeight="600"
                textTransform="uppercase"
                letterSpacing={0.8}
                marginLeft={4}
                color={theme.colorMuted.val}
              >
                Weekly Digest Day
              </Text>
              <TextInput
                value={notificationPrefs?.weeklyDigestDay ?? "sunday"}
                onChangeText={(value) => updatePreference({ weeklyDigestDay: value })}
                placeholder="sunday"
                placeholderTextColor={theme.colorMuted.val}
                autoCapitalize="none"
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.secondary.val,
                    color: theme.color.val,
                    borderColor: theme.borderColor.val,
                  },
                ]}
              />
            </YStack>
          </YStack>
          <YStack height={StyleSheet.hairlineWidth} backgroundColor={theme.borderColor.val} />
          <XStack alignItems="center" gap={12} paddingVertical={10}>
            <YStack flex={1}>
              <Text fontSize={15} fontFamily="$body" color={theme.color.val}>
                AI Nudges
              </Text>
              <Text
                fontSize={12}
                fontFamily="$body"
                marginTop={3}
                lineHeight={18}
                color={theme.colorMuted.val}
              >
                Smart suggestions based on your patterns.
              </Text>
            </YStack>
            <Switch
              value={notificationPrefs?.memoryNudges ?? true}
              onValueChange={(value: boolean) => updatePreference({ memoryNudges: value })}
              trackColor={{
                true: theme.primary.val,
                false: theme.borderColor.val,
              }}
              thumbColor={theme.textInverse.val}
            />
          </XStack>
          <YStack height={StyleSheet.hairlineWidth} backgroundColor={theme.borderColor.val} />
          <XStack alignItems="center" gap={12} paddingVertical={10}>
            <YStack flex={1}>
              <Text fontSize={15} fontFamily="$body" color={theme.color.val}>
                Push Notifications
              </Text>
              <Text
                fontSize={12}
                fontFamily="$body"
                marginTop={3}
                lineHeight={18}
                color={theme.colorMuted.val}
              >
                Enable reminder and review alerts on supported devices.
              </Text>
            </YStack>
            <Switch
              value={notificationPrefs?.pushEnabled ?? false}
              onValueChange={(value: boolean) => updatePreference({ pushEnabled: value })}
              trackColor={{
                true: theme.primary.val,
                false: theme.borderColor.val,
              }}
              thumbColor={theme.textInverse.val}
            />
          </XStack>
          <YStack height={StyleSheet.hairlineWidth} backgroundColor={theme.borderColor.val} />
          <XStack alignItems="center" gap={12} paddingVertical={10}>
            <YStack flex={1}>
              <Text fontSize={15} fontFamily="$body" color={theme.color.val}>
                Capsule Alerts
              </Text>
              <Text
                fontSize={12}
                fontFamily="$body"
                marginTop={3}
                lineHeight={18}
                color={theme.colorMuted.val}
              >
                Get notified when future memories unlock.
              </Text>
            </YStack>
            <Switch
              value={notificationPrefs?.capsuleAlerts ?? true}
              onValueChange={(value: boolean) => updatePreference({ capsuleAlerts: value })}
              trackColor={{
                true: theme.primary.val,
                false: theme.borderColor.val,
              }}
              thumbColor={theme.textInverse.val}
            />
          </XStack>
        </Card>
      </YStack>

      <YStack>
        <SectionLabel>INTEGRATIONS</SectionLabel>
        <Card style={styles.groupCard}>
          <XStack alignItems="center" gap={12} paddingVertical={4}>
            <YStack flex={1}>
              <XStack alignItems="center" gap={8}>
                <Text fontSize={15} fontFamily="$body" color={theme.color.val}>
                  Google
                </Text>
                {googleIntegration?.connected && (
                  <Badge label="Connected" color={theme.primary.val} small />
                )}
              </XStack>
              <Text
                fontSize={12}
                fontFamily="$body"
                marginTop={3}
                lineHeight={18}
                color={theme.colorMuted.val}
              >
                Sync reminders to Google Calendar and enable file attachments via Google Drive.
              </Text>
            </YStack>
            <Switch
              value={googleIntegration?.connected ?? false}
              onValueChange={handleToggleGoogleSync}
              disabled={!request || isConnectingGoogle}
              trackColor={{
                true: theme.primary.val,
                false: theme.borderColor.val,
              }}
              thumbColor={theme.textInverse.val}
            />
          </XStack>
          {showGoogleFeatureControls ? (
            <YStack
              marginTop={14}
              marginLeft={4}
              borderRadius={20}
              borderWidth={1}
              borderColor={theme.borderColor.val}
              backgroundColor={theme.background.val}
              overflow="hidden"
            >
              <XStack
                alignItems="center"
                justifyContent="space-between"
                paddingHorizontal={14}
                paddingTop={12}
                paddingBottom={10}
              >
                <Text
                  fontSize={11}
                  fontFamily="$heading"
                  fontWeight="600"
                  letterSpacing={0.8}
                  textTransform="uppercase"
                  color={theme.colorMuted.val}
                >
                  Google Capabilities
                </Text>
                <YStack
                  width={8}
                  height={8}
                  borderRadius={4}
                  backgroundColor={theme.primary.val}
                  opacity={0.85}
                />
              </XStack>

              <YStack height={StyleSheet.hairlineWidth} backgroundColor={theme.borderColor.val} />

              <YStack padding={14} gap={12}>
                {googleIntegration.hasCalendarScope ? (
                  <IntegrationFeatureRow
                    theme={theme}
                    icon="calendar"
                    title="Calendar"
                    description={
                      canUseCalendar
                        ? "AI and reminder edits can sync to Google Calendar."
                        : "Future reminder sync is paused. Existing events stay as-is."
                    }
                    value={googleIntegration.calendarEnabled}
                    onValueChange={(value) => void handleToggleGoogleFeature("calendar", value)}
                    disabled={updatingGoogleFeature !== null || isConnectingGoogle}
                  />
                ) : null}

                {googleIntegration.hasCalendarScope && googleIntegration.hasDriveScope ? (
                  <YStack
                    height={StyleSheet.hairlineWidth}
                    backgroundColor={theme.borderColor.val}
                  />
                ) : null}

                {googleIntegration.hasDriveScope ? (
                  <IntegrationFeatureRow
                    theme={theme}
                    icon="paperclip"
                    title="Drive"
                    description={
                      canUseDrive
                        ? "Attach new files from chat and memory screens."
                        : "New uploads are paused. Existing files remain viewable."
                    }
                    value={googleIntegration.driveEnabled}
                    onValueChange={(value) => void handleToggleGoogleFeature("drive", value)}
                    disabled={updatingGoogleFeature !== null || isConnectingGoogle}
                  />
                ) : null}
              </YStack>
            </YStack>
          ) : null}
        </Card>
      </YStack>

      <YStack>
        <SectionLabel>AI PROVIDERS</SectionLabel>
        <Card style={styles.groupCard}>
          <XStack alignItems="center" gap={12} paddingVertical={4}>
            <YStack flex={1}>
              <Text fontSize={15} fontFamily="$body" color={theme.color.val}>
                Bring Your Own Key
              </Text>
              <Text
                fontSize={12}
                fontFamily="$body"
                marginTop={3}
                lineHeight={18}
                color={theme.colorMuted.val}
              >
                Use one provider for supported AI capabilities and skip Memora pricing on those
                requests.
              </Text>
              {embeddingRebuildActive ? (
                <Text
                  fontSize={12}
                  fontFamily="$body"
                  marginTop={4}
                  lineHeight={18}
                  color={theme.colorMuted.val}
                >
                  Rebuilding embeddings in the background: {embeddingRebuildProcessed} /{" "}
                  {embeddingRebuildTotal || "?"}. Search falls back to keyword matching until this
                  finishes, and embedding provider changes are locked meanwhile.
                </Text>
              ) : null}
            </YStack>
            <Switch
              value={isByokEnabled}
              onValueChange={(value) => void handleToggleByok(value)}
              disabled={isUpdatingByok}
              trackColor={{
                true: theme.primary.val,
                false: theme.borderColor.val,
              }}
              thumbColor={theme.textInverse.val}
            />
          </XStack>

          {isByokEnabled ? (
            <>
              <YStack
                height={StyleSheet.hairlineWidth}
                backgroundColor={theme.borderColor.val}
                marginTop={14}
              />

              <XStack gap={10} marginTop={14}>
                {(["openai", "google"] as const).map((provider) => {
                  const isActive = selectedAiProvider === provider;
                  return (
                    <PressableScale
                      key={provider}
                      onPress={() => setSelectedAiProvider(provider)}
                      style={[
                        styles.providerChip,
                        {
                          borderColor: isActive ? theme.primary.val : theme.borderColor.val,
                          backgroundColor: isActive
                            ? theme.primary.val + "14"
                            : theme.background.val,
                        },
                      ]}
                    >
                      <Text
                        fontSize={13}
                        fontFamily="$body"
                        fontWeight="600"
                        color={isActive ? theme.primary.val : theme.color.val}
                      >
                        {provider === "openai" ? "OpenAI" : "Google"}
                      </Text>
                    </PressableScale>
                  );
                })}
              </XStack>

              <YStack gap={6} marginTop={16}>
                <Text
                  fontSize={12}
                  fontFamily="$heading"
                  fontWeight="600"
                  textTransform="uppercase"
                  letterSpacing={0.8}
                  marginLeft={4}
                  color={theme.colorMuted.val}
                >
                  API Key
                </Text>
                <TextInput
                  value={aiApiKey}
                  onChangeText={setAiApiKey}
                  placeholder={`Paste your ${selectedAiProvider === "openai" ? "OpenAI" : "Google"} API key`}
                  placeholderTextColor={theme.colorMuted.val}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.secondary.val,
                      color: theme.color.val,
                      borderColor: theme.borderColor.val,
                    },
                  ]}
                />
              </YStack>

              {selectedAiProvider === "openai" ? (
                <YStack gap={6} marginTop={12}>
                  <Text
                    fontSize={12}
                    fontFamily="$heading"
                    fontWeight="600"
                    textTransform="uppercase"
                    letterSpacing={0.8}
                    marginLeft={4}
                    color={theme.colorMuted.val}
                  >
                    Base URL
                  </Text>
                  <TextInput
                    value={aiBaseUrl}
                    onChangeText={setAiBaseUrl}
                    placeholder="Optional custom OpenAI-compatible base URL"
                    placeholderTextColor={theme.colorMuted.val}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={[
                      styles.input,
                      {
                        backgroundColor: theme.secondary.val,
                        color: theme.color.val,
                        borderColor: theme.borderColor.val,
                      },
                    ]}
                  />
                </YStack>
              ) : null}

              <YStack gap={10} marginTop={16}>
                <Text
                  fontSize={12}
                  fontFamily="$heading"
                  fontWeight="600"
                  textTransform="uppercase"
                  letterSpacing={0.8}
                  marginLeft={4}
                  color={theme.colorMuted.val}
                >
                  Models
                </Text>
                {selectedAiConfig?.supportedCapabilities?.map((capability: string) => {
                  const matchingModels =
                    selectedAiConfig?.availableModels?.filter((model: any) =>
                      model.capabilities.includes(capability),
                    ) ?? [];
                  return (
                    <YStack key={capability} gap={8}>
                      <Text fontSize={13} fontFamily="$body" color={theme.color.val}>
                        {formatCapabilityLabel(capability)}
                      </Text>
                      <XStack flexWrap="wrap" gap={8}>
                        {matchingModels.map((model: any) => {
                          const isSelected = aiCapabilityModels[capability] === model.id;
                          const isLocked = capability === "embeddings" && embeddingRebuildActive;
                          return (
                            <PressableScale
                              key={`${capability}-${model.id}`}
                              onPress={
                                isLocked
                                  ? undefined
                                  : () =>
                                      setAiCapabilityModels((current) => ({
                                        ...current,
                                        [capability]: model.id,
                                      }))
                              }
                              style={[
                                styles.modelChip,
                                {
                                  borderColor: isSelected
                                    ? theme.primary.val
                                    : theme.borderColor.val,
                                  backgroundColor: isSelected
                                    ? theme.primary.val + "14"
                                    : theme.background.val,
                                  opacity: isLocked ? 0.55 : 1,
                                },
                              ]}
                            >
                              <Text
                                fontSize={12}
                                fontFamily="$body"
                                fontWeight="600"
                                color={isSelected ? theme.primary.val : theme.color.val}
                              >
                                {model.id}
                              </Text>
                            </PressableScale>
                          );
                        })}
                      </XStack>
                    </YStack>
                  );
                })}
              </YStack>

              <XStack gap={10} marginTop={16}>
                <GradientButton
                  title={isSavingAiKey ? "Saving..." : "Save Key"}
                  onPress={() => void handleSaveAiKey()}
                  icon="key"
                  style={{ flex: 1 }}
                />
                <GradientButton
                  title="Delete"
                  onPress={() => void handleDeleteAiKey()}
                  icon="trash-2"
                  style={{ flex: 1 }}
                />
              </XStack>

              <YStack
                marginTop={16}
                padding={14}
                borderRadius={18}
                borderWidth={1}
                borderColor={theme.borderColor.val}
                backgroundColor={theme.background.val}
                gap={8}
              >
                <XStack alignItems="center" justifyContent="space-between">
                  <Text fontSize={14} fontFamily="$body" fontWeight="600" color={theme.color.val}>
                    {selectedAiProvider === "openai" ? "OpenAI" : "Google"} status
                  </Text>
                  {selectedAiConfig?.configured ? (
                    <Badge
                      label={`••••${selectedAiConfig.maskedKeySuffix ?? ""}`}
                      color={theme.primary.val}
                      small
                    />
                  ) : (
                    <Badge label="No key" color={theme.borderColor.val} small />
                  )}
                </XStack>
                <Text fontSize={12} fontFamily="$body" lineHeight={18} color={theme.colorMuted.val}>
                  {selectedAiConfig?.lastValidationStatus === "valid"
                    ? (selectedAiConfig.lastValidationMessage ?? "Last validation succeeded.")
                    : (selectedAiConfig?.lastValidationMessage ??
                      "Your key is encrypted server-side and only used to execute your AI requests.")}
                </Text>
                {aiProviderSettings?.preference?.embeddingRebuildStatus === "failed" ? (
                  <Text
                    fontSize={12}
                    fontFamily="$body"
                    lineHeight={18}
                    color={theme.destructive.val}
                  >
                    {aiProviderSettings?.preference?.embeddingRebuildError ||
                      "Embedding rebuild failed. Search will keep using the last ready vectors."}
                  </Text>
                ) : null}
                <Text fontSize={12} fontFamily="$body" lineHeight={18} color={theme.colorMuted.val}>
                  Last 30 days: Memora{" "}
                  {formatUsdMicros(aiUsageOverview?.totals?.totalAiMemoraCostUsdMicros ?? 0)} /{" "}
                  {aiUsageOverview?.totals?.totalAiMemoraRequests ?? 0} ops, your key{" "}
                  {formatUsdMicros(aiUsageOverview?.totals?.totalAiByokCostUsdMicros ?? 0)} /{" "}
                  {aiUsageOverview?.totals?.totalAiByokRequests ?? 0} ops.
                </Text>
                <PressableScale onPress={() => router.push("/(protected)/statistics")}>
                  <XStack
                    alignItems="center"
                    gap={8}
                    paddingHorizontal={12}
                    paddingVertical={10}
                    borderRadius={14}
                    borderWidth={1}
                    borderColor={theme.borderColor.val}
                    backgroundColor={theme.card.val}
                    alignSelf="flex-start"
                  >
                    <Feather name="bar-chart-2" size={14} color={theme.primary.val} />
                    <Text fontSize={12} fontFamily="$body" fontWeight="600" color={theme.color.val}>
                      View AI usage
                    </Text>
                  </XStack>
                </PressableScale>
              </YStack>

              <YStack marginTop={16} gap={8}>
                {previewCapabilityMatrix.map((item: any) => (
                  <XStack
                    key={item.capability}
                    alignItems="center"
                    justifyContent="space-between"
                    paddingVertical={6}
                  >
                    <Text fontSize={13} fontFamily="$body" color={theme.color.val}>
                      {item.capability.replace(/_/g, " ")}
                    </Text>
                    <Text fontSize={12} fontFamily="$body" color={theme.colorMuted.val}>
                      {item.label}
                    </Text>
                  </XStack>
                ))}
              </YStack>
            </>
          ) : null}
        </Card>
      </YStack>

      <YStack>
        <SectionLabel>DATA</SectionLabel>
        <Card style={styles.groupCard}>
          <YStack flex={1}>
            <Text fontSize={15} fontFamily="$body" color={theme.color.val}>
              Export Your Data
            </Text>
            <Text
              fontSize={12}
              fontFamily="$body"
              marginTop={3}
              lineHeight={18}
              color={theme.colorMuted.val}
            >
              Download memories, diary entries, and your current profile snapshot.
            </Text>
          </YStack>
          <GradientButton
            title="Export JSON"
            onPress={handleExport}
            icon="download"
            style={{ marginTop: 16 }}
          />
        </Card>
      </YStack>

      <YStack>
        <SectionLabel>ACCOUNT</SectionLabel>
        <Card>
          <PressableScale onPress={handleLogout} style={styles.settingRow}>
            <Feather name="log-out" size={18} color={theme.color.val} />
            <Text fontSize={15} fontFamily="$body" color={theme.color.val}>
              Log Out
            </Text>
          </PressableScale>
        </Card>
      </YStack>

      <YStack>
        <SectionLabel>DANGER ZONE</SectionLabel>
        <Card>
          <PressableScale onPress={handleDeleteAccount} style={styles.settingRow}>
            <Feather name="trash-2" size={18} color={theme.destructive.val} />
            <Text fontSize={15} fontFamily="$body" color={theme.destructive.val}>
              Delete Account
            </Text>
          </PressableScale>
        </Card>
      </YStack>

      <YStack height={40} />
    </MorePageScaffold>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16 },
  profileCard: { alignItems: "center", paddingVertical: 24 },
  providerChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  modelChip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 28,
    fontFamily: FontFamily.bold,
    fontWeight: "700" as const,
  },
  groupCard: { gap: 0 },
  input: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: FontFamily.regular,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dropdown: {
    minHeight: 49,
    justifyContent: "center",
  },
  dropdownContainer: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    overflow: "hidden",
  },
  dropdownContainerModal: {
    marginVertical: 20,
    maxHeight: "90%",
  },
  dropdownSearchInput: {
    flex: 1,
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "web" ? 12 : 10,
    fontSize: 16,
  },
  dropdownCloseButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  dropdownPlaceholderText: {
    fontSize: 15,
  },
  dropdownSelectedText: {
    fontSize: 15,
  },
  dropdownItemContainer: {
    borderRadius: 10,
    marginHorizontal: 8,
    marginVertical: 2,
  },
  dropdownItemText: {
    fontSize: 14,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
});
