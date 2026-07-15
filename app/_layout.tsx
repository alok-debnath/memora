import * as WebBrowser from "expo-web-browser";

WebBrowser.maybeCompleteAuthSession();

import { useFonts } from "expo-font";
import { SpaceGrotesk_400Regular } from "@expo-google-fonts/space-grotesk/400Regular";
import { SpaceGrotesk_500Medium } from "@expo-google-fonts/space-grotesk/500Medium";
import { SpaceGrotesk_600SemiBold } from "@expo-google-fonts/space-grotesk/600SemiBold";
import { SpaceGrotesk_700Bold } from "@expo-google-fonts/space-grotesk/700Bold";
import { DMSans_400Regular } from "@expo-google-fonts/dm-sans/400Regular";
import { DMSans_500Medium } from "@expo-google-fonts/dm-sans/500Medium";
import { DMSans_600SemiBold } from "@expo-google-fonts/dm-sans/600SemiBold";
import { DMSans_700Bold } from "@expo-google-fonts/dm-sans/700Bold";
import { ConvexReactClient } from "convex/react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { initialWindowMetrics, SafeAreaProvider } from "react-native-safe-area-context";
import { useColorScheme } from "react-native";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { TamaguiProvider } from "tamagui";
import { PortalProvider } from "react-native-teleport";

import { ConvexBetterAuthProvider } from "@/components/auth/ConvexBetterAuthProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useThemeStore } from "@/store/theme";
import { useAuthState, AuthContext } from "@/hooks/useAuth";
import { OnboardingScreen } from "@/components/OnboardingScreen";
import { authClient } from "@/lib/auth-client";
import { logDevError } from "@/lib/devLog";
import { createAppTamaguiConfig } from "@/tamagui.config";
import { createThemeColors, MEMORA_ACCENT } from "@/constants/themePalettes";
import { AppThemeProvider } from "@/hooks/useAppTheme";
import { AppToastProvider, AppToastRenderer } from "@/components/ui/toast";
import { AppConfirmProvider } from "@/components/ui/confirm/AppConfirmProvider";
import { BackdropBlurProvider, TopOverlayProvider } from "@/components/ui/BackdropBlurProvider";
import type { AuthContextValue } from "@/hooks/useAuth";

SplashScreen.preventAutoHideAsync();

const CONVEX_URL = process.env.EXPO_PUBLIC_CONVEX_URL || "https://placeholder.convex.cloud";
const convex = new ConvexReactClient(CONVEX_URL, {
  unsavedChangesWarning: false,
});

type RootAppProvidersProps = {
  auth: AuthContextValue;
  children: React.ReactNode;
  defaultTheme: "light" | "dark";
  tamaguiConfig: ReturnType<typeof createAppTamaguiConfig>;
};

function RootAppProviders({ auth, children, defaultTheme, tamaguiConfig }: RootAppProvidersProps) {
  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme={defaultTheme}>
      <AppThemeProvider>
        <AuthContext.Provider value={auth}>
          <AppConfirmProvider>
            <TopOverlayProvider>
              <BottomSheetModalProvider>
                <BackdropBlurProvider>
                  {children}
                  <AppToastRenderer />
                </BackdropBlurProvider>
              </BottomSheetModalProvider>
            </TopOverlayProvider>
          </AppConfirmProvider>
        </AuthContext.Provider>
      </AppThemeProvider>
    </TamaguiProvider>
  );
}

function RootLayoutNav() {
  const systemMode = useColorScheme() === "dark" ? "dark" : "light";
  const {
    resolvedMode,
    resolvedAccentColor,
    loadTheme,
    hasLoaded: themeLoaded,
    setSystemMode,
  } = useThemeStore();
  const auth = useAuthState();
  const isStartupReady = themeLoaded && !auth.isOnboardingLoading;
  // Base Tamagui config stays fixed to MEMORA_ACCENT and is never recreated —
  // all user-selected accent colors flow through AppThemeProvider/useAppTheme()
  // instead, which re-renders live off the theme store. defaultTheme={resolvedMode}
  // below switches the active light/dark theme reactively without remounting.
  // This used to key the TamaguiProvider on mode+accent, forcing a full app
  // remount (losing nav state, retriggering every useQuery) on every toggle.
  const dynamicThemes = React.useMemo(
    () => ({
      light: createThemeColors(MEMORA_ACCENT, "light"),
      dark: createThemeColors(MEMORA_ACCENT, "dark"),
    }),
    [],
  );
  const tamaguiConfig = React.useMemo(() => createAppTamaguiConfig(dynamicThemes), [dynamicThemes]);
  const rootTheme = React.useMemo(
    () => createThemeColors(resolvedAccentColor, resolvedMode),
    [resolvedAccentColor, resolvedMode],
  );

  useEffect(() => {
    loadTheme();
  }, [loadTheme]);

  useEffect(() => {
    setSystemMode(systemMode);
  }, [setSystemMode, systemMode]);

  useEffect(() => {
    if (isStartupReady) {
      void SplashScreen.hideAsync();
    }
  }, [isStartupReady]);

  if (!isStartupReady) return null;

  if (!auth.hasSeenOnboarding) {
    return (
      <RootAppProviders auth={auth} defaultTheme={resolvedMode} tamaguiConfig={tamaguiConfig}>
        <OnboardingScreen />
      </RootAppProviders>
    );
  }

  return (
    <RootAppProviders auth={auth} defaultTheme={resolvedMode} tamaguiConfig={tamaguiConfig}>
      <StatusBar style={resolvedMode === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          freezeOnBlur: true,
          contentStyle: {
            backgroundColor: rootTheme.background,
          },
        }}
      >
        <Stack.Screen name="(public)" options={{ headerShown: false }} />
        <Stack.Screen name="(protected)" options={{ headerShown: false }} />
      </Stack>
    </RootAppProviders>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
  });

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <ErrorBoundary
        onError={(error, stackTrace) => {
          logDevError("ErrorBoundary", error, { stackTrace });
        }}
      >
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
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
