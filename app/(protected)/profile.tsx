import React from "react";
import {
  ScrollView,
  Platform,
  Switch,
  Alert,
  TextInput,
  StyleSheet,
} from "react-native";
import { XStack, YStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { useThemeStore } from "@/store/theme";
import { Card } from "@/components/ui/Card";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { PressableScale } from "@/components/ui/PressableScale";
import { GradientButton } from "@/components/ui/GradientButton";
import { FontFamily } from "@/constants/fonts";

export default function ProfileScreen() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { user, token, logout } = useAuth();
  const { mode, setMode, resolvedMode } = useThemeStore();
  const [displayName, setDisplayName] = React.useState(user?.name ?? "");
  const [timezone, setTimezone] = React.useState(
    user?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  );
  const [isSavingProfile, setIsSavingProfile] = React.useState(false);

  const memoryResult = useQuery(api.memories.list, token ? { token, limit: 100 } : "skip");
  const memories = memoryResult?.memories ?? [];
  const diaryEntries = useQuery(api.diary.list, token ? { token } : "skip") ?? [];
  const notificationPrefs = useQuery(api.notifications.get, token ? { token } : "skip");
  const updateNotifications = useMutation(api.notifications.upsert);
  const deleteAccount = useMutation(api.auth.deleteAccount);
  const updateProfile = useMutation(api.auth.updateProfile);

  React.useEffect(() => {
    setDisplayName(user?.name ?? "");
  }, [user?.name]);

  React.useEffect(() => {
    setTimezone(
      user?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
    );
  }, [user?.timezone]);

  const webTopPadding = Platform.OS === "web" ? 67 : 0;
  const upcomingReminders = memories.filter((memory) => memory.reminderDate).length;

  const handleExport = async () => {
    const data = JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        profile: user,
        memories,
        diaryEntries,
      },
      null,
      2
    );
    if (Platform.OS === "web") {
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "memora-export.json";
      a.click();
      URL.revokeObjectURL(url);
    } else {
      Alert.alert("Export", `${memories.length} memories ready for export`);
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
    if (Platform.OS === "web") {
      if (window.confirm("Are you sure you want to log out?")) doLogout();
    } else {
      Alert.alert("Logout", "Are you sure?", [
        { text: "Cancel", style: "cancel" },
        { text: "Logout", style: "destructive", onPress: doLogout },
      ]);
    }
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
    if (Platform.OS === "web") {
      if (window.confirm("Delete all data? This cannot be undone.")) doDelete();
    } else {
      Alert.alert("Delete Account", "This will delete your app data and profile. This cannot be undone.", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: doDelete },
      ]);
    }
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
    <YStack flex={1} backgroundColor="$background">
      <XStack
        alignItems="center"
        justifyContent="space-between"
        paddingHorizontal={16}
        paddingBottom={12}
        paddingTop={insets.top + webTopPadding + 12}
      >
        <PressableScale onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={theme.color.val} />
        </PressableScale>
        <Text fontSize={18} fontFamily="$heading" fontWeight="600" color="$color">Profile</Text>
        <YStack width={22} />
      </XStack>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInUp.duration(400)}>
          <Card style={styles.profileCard}>
            <LinearGradient colors={["#E8911B", "#D4710F"]} style={styles.avatar}>
              <Text style={styles.avatarText}>
                {user?.name?.charAt(0)?.toUpperCase() || "?"}
              </Text>
            </LinearGradient>
            <Text fontSize={11} fontFamily="$heading" letterSpacing={1.2} marginBottom={8} color="$primary">
              MEMORA ACCOUNT
            </Text>
            <Text fontSize={20} fontFamily="$heading" fontWeight="600" marginBottom={2} color="$color">
              {user?.name || "User"}
            </Text>
            <Text fontSize={14} fontFamily="$body" marginBottom={16} color="$colorMuted">
              {user?.email || ""}
            </Text>
            <XStack alignItems="center" gap={18}>
              <YStack alignItems="center">
                <Text fontSize={20} fontFamily="$heading" fontWeight="700" color="$color">
                  {memories.length}
                </Text>
                <Text fontSize={12} fontFamily="$body" marginTop={2} color="$colorMuted">
                  Memories
                </Text>
              </YStack>
              <YStack width={1} height={30} backgroundColor="$borderColor" />
              <YStack alignItems="center">
                <Text fontSize={20} fontFamily="$heading" fontWeight="700" color="$color">
                  {diaryEntries.length}
                </Text>
                <Text fontSize={12} fontFamily="$body" marginTop={2} color="$colorMuted">
                  Diary
                </Text>
              </YStack>
              <YStack width={1} height={30} backgroundColor="$borderColor" />
              <YStack alignItems="center">
                <Text fontSize={20} fontFamily="$heading" fontWeight="700" color="$color">
                  {upcomingReminders}
                </Text>
                <Text fontSize={12} fontFamily="$body" marginTop={2} color="$colorMuted">
                  Reminders
                </Text>
              </YStack>
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
              <TextInput
                value={timezone}
                onChangeText={setTimezone}
                placeholder="Asia/Kolkata"
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
      </ScrollView>
    </YStack>
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
