import * as WebBrowser from "expo-web-browser";

WebBrowser.maybeCompleteAuthSession();

import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
  useFonts,
} from "@expo-google-fonts/dm-sans";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useColorScheme } from "react-native";
import { TamaguiProvider } from "tamagui";
import { PortalProvider } from "react-native-teleport";

import { ConvexBetterAuthProvider } from "@/components/auth/ConvexBetterAuthProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useThemeStore } from "@/store/theme";
import { useAuthState, AuthContext } from "@/hooks/useAuth";
import { OnboardingScreen } from "@/components/OnboardingScreen";
import { authClient } from "@/lib/auth-client";
import { logDevError } from "@/lib/devLog";
import tamaguiConfig from "@/tamagui.config";
import { AppToastProvider, AppToastRenderer } from "@/components/ui/toast";
import { AppConfirmProvider } from "@/components/ui/confirm/AppConfirmProvider";

SplashScreen.preventAutoHideAsync();

const CONVEX_URL = process.env.EXPO_PUBLIC_CONVEX_URL || "https://placeholder.convex.cloud";
const convex = new ConvexReactClient(CONVEX_URL, {
  unsavedChangesWarning: false,
});

function RootLayoutNav() {
  const systemMode = useColorScheme() === "dark" ? "dark" : "light";
  const { resolvedMode, loadTheme, hasLoaded: themeLoaded, setSystemMode } = useThemeStore();
  const auth = useAuthState();

  useEffect(() => {
    loadTheme();
  }, []);

  useEffect(() => {
    setSystemMode(systemMode);
  }, [setSystemMode, systemMode]);

  if (!themeLoaded || auth.isLoading) return null;

  if (!auth.hasSeenOnboarding) {
    return (
      <TamaguiProvider config={tamaguiConfig} defaultTheme={resolvedMode}>
        <AppConfirmProvider>
          <AuthContext.Provider value={auth}>
            <OnboardingScreen />
            <AppToastRenderer />
          </AuthContext.Provider>
        </AppConfirmProvider>
      </TamaguiProvider>
    );
  }

  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme={resolvedMode}>
      <AppConfirmProvider>
        <AuthContext.Provider value={auth}>
          <StatusBar style={resolvedMode === "dark" ? "light" : "dark"} />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: {
                backgroundColor:
                  resolvedMode === "dark"
                    ? tamaguiConfig.themes.dark.background.val
                    : tamaguiConfig.themes.light.background.val,
              },
            }}
          >
            <Stack.Screen name="(public)" options={{ headerShown: false }} />
            <Stack.Screen name="(protected)" options={{ headerShown: false }} />
          </Stack>
          <AppToastRenderer />
        </AuthContext.Provider>
      </AppConfirmProvider>
    </TamaguiProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary
        onError={(error, stackTrace) => {
          logDevError("ErrorBoundary", error, { stackTrace });
        }}
      >
        <ConvexProvider client={convex}>
          <ConvexBetterAuthProvider client={convex} authClient={authClient}>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <PortalProvider>
                <KeyboardProvider>
                  <AppToastProvider>
                    <RootLayoutNav />
                  </AppToastProvider>
                </KeyboardProvider>
              </PortalProvider>
            </GestureHandlerRootView>
          </ConvexBetterAuthProvider>
        </ConvexProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
