import { Redirect, Stack } from "expo-router";
import { ActivityIndicator, Platform } from "react-native";
import { YStack } from "tamagui";

import { OfflineBanner } from "@/components/ui/OfflineBanner";
import { ScreenErrorBoundary } from "@/components/ui/ScreenErrorBoundary";
import { ProtectedAppShell } from "@/components/navigation/ProtectedAppShell";
import { useAuth } from "@/hooks/useAuth";
import { useAppTheme } from "@/hooks/useAppTheme";
import { DeferredProtectedSheetHost } from "@/components/sheets/ProtectedSheetHost";

export default function ProtectedLayout() {
  const theme = useAppTheme();
  const { user, isLoading, hasSeenOnboarding } = useAuth();

  if (!hasSeenOnboarding) return null;

  if (isLoading) {
    return (
      <YStack
        flex={1}
        alignItems="center"
        justifyContent="center"
        backgroundColor={theme.background.val}
      >
        <ActivityIndicator size="large" color={theme.primary.val} />
      </YStack>
    );
  }

  if (!user) return <Redirect href="/(public)/(auth)/login" />;

  return (
    <>
      <ScreenErrorBoundary label="This page">
        <ProtectedAppShell>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: theme.background.val },
              animation: Platform.OS === "android" ? "ios_from_right" : "default",
              gestureEnabled: true,
              freezeOnBlur: true,
            }}
          />
        </ProtectedAppShell>
      </ScreenErrorBoundary>
      <DeferredProtectedSheetHost />
      <OfflineBanner />
    </>
  );
}
