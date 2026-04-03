import { Redirect, Stack } from "expo-router";
import { ActivityIndicator } from "react-native";
import { YStack, useTheme } from "tamagui";

import Colors from "@/constants/colors";
import { useAuth } from "@/hooks/useAuth";

export default function ProtectedLayout() {
  const theme = useTheme();
  const { user, isLoading, hasSeenOnboarding } = useAuth();

  if (!hasSeenOnboarding) {
    return null;
  }

  if (isLoading) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" backgroundColor="$background">
        <ActivityIndicator size="large" color={Colors.primary} />
      </YStack>
    );
  }

  if (!user) {
    return <Redirect href="/(public)/(auth)/login" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
