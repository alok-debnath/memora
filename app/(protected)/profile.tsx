import React from "react";
import {
  Platform,
  Switch,
  Alert,
  TextInput,
  Pressable,
  StyleSheet,
} from "react-native";
import { XStack, YStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInUp } from "react-native-reanimated";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { useThemeStore } from "@/store/theme";
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

type TimezoneOption = {
  value: string;
  label: string;
  searchText: string;
  offsetInMinutes: number;
};

const formatUtcOffset = (offsetInMinutes: number) => {
  const sign = offsetInMinutes >= 0 ? "+" : "-";
  const absoluteMinutes = Math.abs(offsetInMinutes);
  const hours = String(Math.floor(absoluteMinutes / 60)).padStart(2, "0");
  const minutes = String(absoluteMinutes % 60).padStart(2, "0");
  return `UTC${sign}${hours}:${minutes}`;
};

// Computed once at module load — avoids blocking the JS thread on every mount.
const ALL_TIMEZONE_OPTIONS: TimezoneOption[] = getTimeZones({ includeUtc: true })
  .map((tz) => ({
    value: tz.name,
    label: `${tz.name} (${formatUtcOffset(tz.currentTimeOffsetInMinutes)})`,
    searchText: [tz.name, tz.alternativeName, tz.countryName, tz.abbreviation, ...tz.mainCities].join(" "),
    offsetInMinutes: tz.currentTimeOffsetInMinutes,
  }))
  .sort((a, b) =>
    a.offsetInMinutes === b.offsetInMinutes
      ? a.value.localeCompare(b.value)
      : a.offsetInMinutes - b.offsetInMinutes
  );

export default function ProfileScreen() {
  const theme = useAppTheme();
  const { showToast } = useAppToast();
  const { confirm } = useAppConfirm();
  const { user, token, logout } = useAuth();
  const { mode, setMode, resolvedMode } = useThemeStore();
  const [displayName, setDisplayName] = React.useState(user?.name ?? "");
  const [timezone, setTimezone] = React.useState(
    user?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  );
  const [isSavingProfile, setIsSavingProfile] = React.useState(false);
  const timezoneDropdownRef = React.useRef<IDropdownRef>(null);
  const [timezoneSearchText, setTimezoneSearchText] = React.useState("");
  const timezoneDropdownOptions = React.useMemo<TimezoneOption[]>(() => {
    if (!timezone || ALL_TIMEZONE_OPTIONS.some((option) => option.value === timezone)) {
      return ALL_TIMEZONE_OPTIONS;
    }
    return [
      { value: timezone, label: `${timezone} (Saved)`, searchText: timezone, offsetInMinutes: 0 },
      ...ALL_TIMEZONE_OPTIONS,
    ];
  }, [timezone]);
  const closeTimezoneDropdown = React.useCallback(() => {
    setTimezoneSearchText("");
    timezoneDropdownRef.current?.close();
  }, []);
  const [exportRequested, setExportRequested] = React.useState(false);
  const exportData = useQuery(
    api.dataExport.exportAllData,
    exportRequested ? {} : "skip"
  );

  const nowMs = React.useMemo(() => Date.now(), []);
  const memoryStats = useQuery(api.memories.stats, token ? { token, asOf: nowMs } : "skip");
  const diaryStats = useQuery(api.diary.stats, token ? { token } : "skip");
  const notificationPrefs = useQuery(api.notifications.get, token ? { token } : "skip");
  const updateNotifications = useMutation(api.notifications.upsert);
  const deleteAccount = useMutation(api.auth.deleteAccount);
  const updateProfile = useMutation(api.auth.updateProfile);

  // --- Google Integration (Calendar + Drive) ---
  const googleIntegration = useQuery(api.integrations.getGoogleIntegration, { token: token || undefined });
  const connectGoogle = useAction(api.integrations.connectGoogle);
  const disconnectGoogle = useMutation(api.integrations.disconnectGoogle);
  const [isConnectingGoogle, setIsConnectingGoogle] = React.useState(false);
  const googlePlatform =
    Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web";
  const googleRedirectUri = React.useMemo(
    () => {
      if (Platform.OS === "android") {
        return "com.alokdebnath.memora:/profile";
      }

      return makeRedirectUri({
        scheme: "memora",
        path: "profile",
      });
    },
    [googlePlatform]
  );

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

  React.useEffect(() => {
    setDisplayName(user?.name ?? "");
  }, [user?.name]);

  React.useEffect(() => {
    setTimezone(
      user?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
    );
  }, [user?.timezone]);

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

  const updatePreference = async (
    patch: {
      dailyReview?: boolean;
      dailyReviewTime?: string;
      weeklyDigest?: boolean;
      weeklyDigestDay?: string;
      memoryNudges?: boolean;
      capsuleAlerts?: boolean;
      pushEnabled?: boolean;
    }
  ) => {
    if (!token) return;
    try {
      await updateNotifications({ token, ...patch });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to update preferences.";
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
      const message =
        error instanceof Error ? error.message : "Unable to update profile.";
      if (Platform.OS === "web") {
        window.alert(message);
      } else {
        Alert.alert("Update failed", message);
      }
    } finally {
      setIsSavingProfile(false);
    }
  };

  return (
    <MorePageScaffold
      title="Profile"
      scrollProps={{ contentContainerStyle: styles.content }}
    >
        <Animated.View entering={FadeInUp.duration(400)}>
          <Card style={{ ...styles.profileCard, padding: 18, borderRadius: 26 }}>
            <XStack alignItems="flex-start" justifyContent="space-between" gap={14}>
              <XStack alignItems="center" gap={14} flex={1}>
                <LinearGradient colors={["#E8911B", "#D4710F"]} style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {user?.name?.charAt(0)?.toUpperCase() || "?"}
                  </Text>
                </LinearGradient>
                <YStack flex={1} gap={6}>
                  <Badge label="Memora account" color={theme.primary.val} />
                  <Text fontSize={22} fontFamily="$heading" fontWeight="700" color="$color">
                    {user?.name || "User"}
                  </Text>
                  <Text fontSize={14} fontFamily="$body" color="$colorMuted" numberOfLines={1}>
                    {user?.email || ""}
                  </Text>
                </YStack>
              </XStack>
            </XStack>
            <XStack gap={10} marginTop={16}>
              <Card style={{ flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 18 }}>
                <Text fontSize={20} fontFamily="$heading" fontWeight="700" color="$color">
                  {totalMemories}
                </Text>
                <Text fontSize={11} fontFamily="$body" marginTop={2} color="$colorMuted">
                  Memories
                </Text>
              </Card>
              <Card style={{ flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 18 }}>
                <Text fontSize={20} fontFamily="$heading" fontWeight="700" color="$color">
                  {diaryStats?.totalEntries ?? 0}
                </Text>
                <Text fontSize={11} fontFamily="$body" marginTop={2} color="$colorMuted">
                  Diary
                </Text>
              </Card>
              <Card style={{ flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 18 }}>
                <Text fontSize={20} fontFamily="$heading" fontWeight="700" color="$color">
                  {totalReminders}
                </Text>
                <Text fontSize={11} fontFamily="$body" marginTop={2} color="$colorMuted">
                  Reminders
                </Text>
              </Card>
            </XStack>
          </Card>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(40).duration(400)}>
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
                color="$colorMuted"
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
                color="$colorMuted"
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
                  <XStack gap={8} alignItems="center" paddingHorizontal={8} paddingTop={8} paddingBottom={6}>
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
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(100).duration(400)}>
          <SectionLabel>APPEARANCE</SectionLabel>
          <Card style={styles.groupCard}>
            <YStack flex={1}>
              <Text fontSize={15} fontFamily="$body" color="$color">Theme</Text>
              <Text fontSize={12} fontFamily="$body" marginTop={3} lineHeight={18} color="$colorMuted">
                Follow your system or force light or dark mode.
                {" "}
                Active: {resolvedMode}
              </Text>
            </YStack>
            <XStack gap={8} marginTop={16}>
              {[
                { key: "system", label: "System", icon: "smartphone" as const },
                { key: "light", label: "Light", icon: "sun" as const },
                { key: "dark", label: "Dark", icon: "moon" as const },
              ].map((option) => {
                const isActive = mode === option.key;
                return (
                  <PressableScale
                    key={option.key}
                    onPress={() => setMode(option.key as "system" | "light" | "dark")}
                    style={[
                      styles.themeChip,
                      {
                        backgroundColor: isActive ? theme.primary.val + "18" : theme.secondary.val,
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
                      style={{ color: isActive ? theme.primary.val : theme.color.val }}
                    >
                      {option.label}
                    </Text>
                  </PressableScale>
                );
              })}
            </XStack>
          </Card>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(150).duration(400)}>
          <SectionLabel>NOTIFICATIONS</SectionLabel>
          <Card style={styles.groupCard}>
            <XStack alignItems="center" gap={12} paddingVertical={10}>
              <YStack flex={1}>
                <Text fontSize={15} fontFamily="$body" color="$color">Daily Review</Text>
                <Text fontSize={12} fontFamily="$body" marginTop={3} lineHeight={18} color="$colorMuted">
                  Review memories every day at {notificationPrefs?.dailyReviewTime ?? "09:00"}.
                </Text>
              </YStack>
              <Switch
                value={notificationPrefs?.dailyReview ?? true}
                onValueChange={(value: boolean) => updatePreference({ dailyReview: value })}
                trackColor={{ true: theme.primary.val, false: theme.borderColor.val }}
                thumbColor="#FFFFFF"
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
                  color="$colorMuted"
                >
                  Daily Review Time
                </Text>
                <TextInput
                  value={notificationPrefs?.dailyReviewTime ?? "09:00"}
                  onChangeText={(value) => updatePreference({ dailyReviewTime: value })}
                  placeholder="09:00"
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
            </YStack>
            <YStack height={StyleSheet.hairlineWidth} backgroundColor="$borderColor" />
            <XStack alignItems="center" gap={12} paddingVertical={10}>
              <YStack flex={1}>
                <Text fontSize={15} fontFamily="$body" color="$color">Weekly Digest</Text>
                <Text fontSize={12} fontFamily="$body" marginTop={3} lineHeight={18} color="$colorMuted">
                  Summarize your week every {notificationPrefs?.weeklyDigestDay ?? "Sunday"}.
                </Text>
              </YStack>
              <Switch
                value={notificationPrefs?.weeklyDigest ?? true}
                onValueChange={(value: boolean) => updatePreference({ weeklyDigest: value })}
                trackColor={{ true: theme.primary.val, false: theme.borderColor.val }}
                thumbColor="#FFFFFF"
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
                  color="$colorMuted"
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
            <YStack height={StyleSheet.hairlineWidth} backgroundColor="$borderColor" />
            <XStack alignItems="center" gap={12} paddingVertical={10}>
              <YStack flex={1}>
                <Text fontSize={15} fontFamily="$body" color="$color">AI Nudges</Text>
                <Text fontSize={12} fontFamily="$body" marginTop={3} lineHeight={18} color="$colorMuted">
                  Smart suggestions based on your patterns.
                </Text>
              </YStack>
              <Switch
                value={notificationPrefs?.memoryNudges ?? true}
                onValueChange={(value: boolean) => updatePreference({ memoryNudges: value })}
                trackColor={{ true: theme.primary.val, false: theme.borderColor.val }}
                thumbColor="#FFFFFF"
              />
            </XStack>
            <YStack height={StyleSheet.hairlineWidth} backgroundColor="$borderColor" />
            <XStack alignItems="center" gap={12} paddingVertical={10}>
              <YStack flex={1}>
                <Text fontSize={15} fontFamily="$body" color="$color">Push Notifications</Text>
                <Text fontSize={12} fontFamily="$body" marginTop={3} lineHeight={18} color="$colorMuted">
                  Enable reminder and review alerts on supported devices.
                </Text>
              </YStack>
              <Switch
                value={notificationPrefs?.pushEnabled ?? false}
                onValueChange={(value: boolean) => updatePreference({ pushEnabled: value })}
                trackColor={{ true: theme.primary.val, false: theme.borderColor.val }}
                thumbColor="#FFFFFF"
              />
            </XStack>
            <YStack height={StyleSheet.hairlineWidth} backgroundColor="$borderColor" />
            <XStack alignItems="center" gap={12} paddingVertical={10}>
              <YStack flex={1}>
                <Text fontSize={15} fontFamily="$body" color="$color">Capsule Alerts</Text>
                <Text fontSize={12} fontFamily="$body" marginTop={3} lineHeight={18} color="$colorMuted">
                  Get notified when future memories unlock.
                </Text>
              </YStack>
              <Switch
                value={notificationPrefs?.capsuleAlerts ?? true}
                onValueChange={(value: boolean) => updatePreference({ capsuleAlerts: value })}
                trackColor={{ true: theme.primary.val, false: theme.borderColor.val }}
                thumbColor="#FFFFFF"
              />
            </XStack>
          </Card>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(180).duration(400)}>
          <SectionLabel>INTEGRATIONS</SectionLabel>
          <Card style={styles.groupCard}>
            <XStack alignItems="center" gap={12} paddingVertical={4}>
              <YStack flex={1}>
                <XStack alignItems="center" gap={8}>
                  <Text fontSize={15} fontFamily="$body" color="$color">Google</Text>
                  {googleIntegration?.connected && (
                    <Badge
                      label="Connected"
                      color={theme.primary.val}
                      small
                    />
                  )}
                </XStack>
                <Text fontSize={12} fontFamily="$body" marginTop={3} lineHeight={18} color="$colorMuted">
                  Sync reminders to Google Calendar and enable file attachments via Google Drive.
                </Text>
              </YStack>
              <Switch
                value={googleIntegration?.connected ?? false}
                onValueChange={handleToggleGoogleSync}
                disabled={!request || isConnectingGoogle}
                trackColor={{ true: theme.primary.val, false: theme.borderColor.val }}
                thumbColor="#FFFFFF"
              />
            </XStack>
          </Card>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(200).duration(400)}>
          <SectionLabel>DATA</SectionLabel>
          <Card style={styles.groupCard}>
            <YStack flex={1}>
              <Text fontSize={15} fontFamily="$body" color="$color">
                Export Your Data
              </Text>
              <Text fontSize={12} fontFamily="$body" marginTop={3} lineHeight={18} color="$colorMuted">
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
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(250).duration(400)}>
          <SectionLabel>ACCOUNT</SectionLabel>
          <Card>
            <PressableScale onPress={handleLogout} style={styles.settingRow}>
              <Feather name="log-out" size={18} color={theme.color.val} />
              <Text fontSize={15} fontFamily="$body" color="$color">
                Log Out
              </Text>
            </PressableScale>
          </Card>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(300).duration(400)}>
          <SectionLabel>DANGER ZONE</SectionLabel>
          <Card>
            <PressableScale onPress={handleDeleteAccount} style={styles.settingRow}>
              <Feather name="trash-2" size={18} color={theme.destructive.val} />
              <Text fontSize={15} fontFamily="$body" color="$destructive">
                Delete Account
              </Text>
            </PressableScale>
          </Card>
        </Animated.View>

        <YStack height={40} />
    </MorePageScaffold>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16 },
  profileCard: { alignItems: "center", paddingVertical: 24 },
  avatar: {
    width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center",
    marginBottom: 12,
  },
  avatarText: { color: "#FFFFFF", fontSize: 28, fontFamily: FontFamily.bold, fontWeight: "700" as const },
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
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 10,
  },
  themeChip: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
});
