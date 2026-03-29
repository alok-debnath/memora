import { Redirect, Stack } from "expo-router";

import { useAuth } from "@/hooks/useAuth";

export default function AuthLayout() {
  const { user, isLoading, hasSeenOnboarding } = useAuth();

  if (!hasSeenOnboarding) {
    return null;
  }

  if (!isLoading && user) {
    return <Redirect href="/(protected)/(tabs)" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="reset-password" />
    </Stack>
  );
}
