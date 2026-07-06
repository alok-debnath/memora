import React, { useState } from "react";
import { appRouter as router } from "@/lib/appRouter";
import { YStack, XStack, Text } from "tamagui";

import { AuthShell } from "@/components/auth/AuthShell";
import { PasswordVisibilityButton } from "@/components/auth/PasswordVisibilityButton";
import { AppButton } from "@/components/ui/AppButton";
import { AppTextField } from "@/components/ui/AppTextField";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { PressableScale } from "@/components/ui/PressableScale";
import { FontFamily } from "@/constants/fonts";
import { useAuth } from "@/hooks/useAuth";
import { useAppTheme } from "@/hooks/useAppTheme";

export default function LoginScreen() {
  const theme = useAppTheme();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError("Please fill in all fields");
      return;
    }
    setError("");
    setIsLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in and continue where you left off."
      accentIcon="log-in"
    >
      <YStack gap={16}>
        {error ? <InlineNotice tone="error" icon="alert-triangle" description={error} /> : null}

        <AppTextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
        />

        <AppTextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder="Enter your password"
          secureTextEntry={!showPassword}
          autoComplete="password"
          textContentType="password"
          returnKeyType="go"
          accessory={
            <PasswordVisibilityButton
              visible={showPassword}
              onPress={() => setShowPassword((value) => !value)}
            />
          }
        />

        <AppButton
          title="Sign in"
          onPress={handleLogin}
          loading={isLoading}
          icon="log-in"
          variant="primary"
          fullWidth
          style={{ marginTop: 2 }}
        />

        <XStack justifyContent="space-between" alignItems="center" marginTop={2}>
          <PressableScale onPress={() => router.push("/(public)/(auth)/forgot-password")}>
            <Text fontSize={14} fontFamily={FontFamily.semiBold} color={theme.primary.val}>
              Forgot password?
            </Text>
          </PressableScale>
          <XStack alignItems="center" gap={6} flexShrink={1}>
            <Text fontSize={14} fontFamily={FontFamily.regular} color={theme.colorMuted.val}>
              New here?
            </Text>
            <PressableScale onPress={() => router.push("/(public)/(auth)/signup")}>
              <Text fontSize={14} fontFamily={FontFamily.semiBold} color={theme.primary.val}>
                Sign up
              </Text>
            </PressableScale>
          </XStack>
        </XStack>
      </YStack>
    </AuthShell>
  );
}
