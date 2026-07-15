import React from "react";
import { Platform, Switch, Alert, TextInput, Pressable, StyleSheet } from "react-native";
import { XStack, YStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import { Feather, type FeatherIconName } from "@/lib/icons";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { SurfaceCard } from "@/components/ui/SurfaceCard";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { AppButton } from "@/components/ui/AppButton";
import { Badge } from "@/components/ui/Badge";
import { AppScreen } from "@/components/ui/AppScreen";
import { SectionGrid } from "@/components/ui/Responsive";
import { useAppToast } from "@/components/ui/toast";
import { useAppConfirm } from "@/components/ui/confirm/AppConfirmProvider";
import { FontFamily } from "@/constants/fonts";
import { Dropdown, type IDropdownRef } from "react-native-element-dropdown";
import { getTimeZones } from "@vvo/tzdb";
import * as Google from "expo-auth-session/providers/google";
import { makeRedirectUri } from "expo-auth-session";
import { canUseGoogleCalendar, canUseGoogleDrive } from "@/lib/googleIntegration";
import { radius } from "@/constants/uiTokens";

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

function SettingsRowIcon({
  theme,
  icon,
  tone = "primary",
}: {
  theme: ReturnType<typeof useAppTheme>;
  icon: FeatherIconName;
  tone?: "primary" | "destructive";
}) {
  const color = tone === "destructive" ? theme.destructive.val : theme.primary.val;
  return (
    <YStack
      width={32}
      height={32}
      borderRadius={9}
      alignItems="center"
      justifyContent="center"
      backgroundColor={color}
    >
      <Feather name={icon} size={16} color={theme.textInverse.val} />
    </YStack>
  );
}

function IntegrationFeatureRow({
  theme,
  icon,
  title,
  description,
  value,
  disabled,
  onValueChange,
  isLast,
}: {
  theme: ReturnType<typeof useAppTheme>;
  icon: FeatherIconName;
  title: string;
  description: string;
  value: boolean;
  disabled: boolean;
  onValueChange: (value: boolean) => void;
  isLast?: boolean;
}) {
  return (
    <XStack
      alignItems="center"
      gap={12}
      paddingVertical={10}
      borderBottomWidth={isLast ? 0 : 1}
      borderBottomColor={theme.borderSubtle.val}
    >
      <SettingsRowIcon theme={theme} icon={icon} />
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

export default function ProfileScreen() {
  const theme = useAppTheme();
  const { showToast } = useAppToast();
  const { confirm } = useAppConfirm();
  const { user, token } = useAuth();
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
  const updateProfile = useMutation(api.auth.updateProfile);

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
  const googleClientIds = {
    android: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID,
    ios: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS,
    web: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB,
  };
  const isGoogleAuthConfigured = !!googleClientIds[googlePlatform];
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
    androidClientId: googleClientIds.android || "google-oauth-client-id-not-configured",
    iosClientId: googleClientIds.ios || "google-oauth-client-id-not-configured",
    webClientId: googleClientIds.web || "google-oauth-client-id-not-configured",
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
      if (!isGoogleAuthConfigured) {
        showToast({
          title: "Google is not configured",
          message: `Set EXPO_PUBLIC_GOOGLE_CLIENT_ID_${googlePlatform.toUpperCase()} before connecting Google.`,
          tone: "error",
          closeMode: "manual",
        });
        return;
      }
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

  return (
    <AppScreen
      showBack
      title="Profile"
      subtitle="Manage your personal details and connected services."
      contentWidth="workspace"
    >
      <SectionGrid minimumColumnWidth={360} maximumColumns={2} gap={16}>
        <YStack width="100%">
          <SectionLabel>IDENTITY</SectionLabel>
          <SurfaceCard style={styles.groupCard}>
            <XStack alignItems="center" gap={12} marginBottom={18}>
              <SettingsRowIcon theme={theme} icon="user" />
              <YStack flex={1} gap={2}>
                <Text fontSize={16} fontFamily="$heading" fontWeight="700" color={theme.color.val}>
                  Personal details
                </Text>
                <Text fontSize={12} lineHeight={17} color={theme.colorMuted.val}>
                  Used to personalize your workspace and time-based features.
                </Text>
              </YStack>
            </XStack>
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
            <AppButton
              title="Save Profile"
              onPress={handleSaveProfile}
              icon="save"
              variant="gradient"
              fullWidth
              loading={isSavingProfile}
              style={{ marginTop: 8 }}
            />
          </SurfaceCard>
        </YStack>

        <YStack>
          <SectionLabel>CONNECTED SERVICES</SectionLabel>
          <SurfaceCard style={styles.groupCard}>
            <XStack alignItems="center" gap={12} paddingVertical={4}>
              <SettingsRowIcon theme={theme} icon="cloud" />
              <YStack flex={1}>
                <XStack alignItems="center" gap={8}>
                  <Text fontSize={15} fontFamily="$body" fontWeight="600" color={theme.color.val}>
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
                disabled={!isGoogleAuthConfigured || !request || isConnectingGoogle}
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
                borderRadius={18}
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
                      isLast={!googleIntegration.hasDriveScope}
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
                      isLast
                    />
                  ) : null}
                </YStack>
              </YStack>
            ) : null}
          </SurfaceCard>
        </YStack>
      </SectionGrid>
      <YStack height={24} />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  groupCard: { gap: 0, borderRadius: radius.md },
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
});
