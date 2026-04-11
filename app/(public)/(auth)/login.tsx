import React, { useState } from "react";
import { router } from "expo-router";
import { YStack, XStack, Text } from "tamagui";

import { AuthShell } from "@/components/auth/AuthShell";
import { AppButton } from "@/components/ui/AppButton";
import { AppTextField } from "@/components/ui/AppTextField";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { PressableScale } from "@/components/ui/PressableScale";
import { FontFamily } from "@/constants/fonts";
import { useAuth } from "@/hooks/useAuth";

export default function LoginScreen() {
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
    <AuthShell title="Welcome back" subtitle="Sign in to continue." accentIcon="zap">
      <YStack gap={18}>
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
          accessory={(
            <PressableScale
              onPress={() => setShowPassword((value) => !value)}
              style={{ paddingHorizontal: 10, paddingVertical: 8 }}
            >
              <Text fontSize={13} fontFamily={FontFamily.semiBold} color="$colorMuted">
                {showPassword ? "Hide" : "Show"}
              </Text>
            </PressableScale>
          )}
        />

        <AppButton
          title="Sign In"
          onPress={handleLogin}
          loading={isLoading}
          icon="log-in"
          variant="gradient"
          style={{ marginTop: 2 }}
        />

        <XStack justifyContent="space-between" alignItems="center" marginTop={2}>
          <PressableScale onPress={() => router.push("/(public)/(auth)/forgot-password")}>
            <Text fontSize={14} fontFamily={FontFamily.semiBold} color="$primary">
              Forgot password?
            </Text>
          </PressableScale>
          <XStack alignItems="center" gap={6}>
            <Text fontSize={14} fontFamily={FontFamily.regular} color="$colorMuted">
              New here?
            </Text>
            <PressableScale onPress={() => router.push("/(public)/(auth)/signup")}>
              <Text fontSize={14} fontFamily={FontFamily.semiBold} color="$primary">
                Sign Up
              </Text>
            </PressableScale>
          </XStack>
        </XStack>
      </YStack>
    </AuthShell>
  );
}
