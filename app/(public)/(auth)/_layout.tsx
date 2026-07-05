import { Redirect, Stack } from "expo-router";

import { useAuth } from "@/hooks/useAuth";
import { useAppTheme } from "@/hooks/useAppTheme";

export default function AuthLayout() {
  const theme = useAppTheme();
  const { user, isLoading, hasSeenOnboarding } = useAuth();

  if (!hasSeenOnboarding) {
    return null;
  }

  if (!isLoading && user) {
    return <Redirect href="/(protected)/(tabs)" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "simple_push",
        freezeOnBlur: true,
        contentStyle: { backgroundColor: theme.background.val },
      }}
    >
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="reset-password" />
    </Stack>
  );
}
