import React, { useState } from "react";
import { appRouter as router } from "@/lib/appRouter";
import { YStack, XStack, Text } from "tamagui";

import { AuthShell } from "@/components/auth/AuthShell";
import { AppButton } from "@/components/ui/AppButton";
import { AppTextField } from "@/components/ui/AppTextField";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { PressableScale } from "@/components/ui/PressableScale";
import { FontFamily } from "@/constants/fonts";
import { useAuth } from "@/hooks/useAuth";

export default function SignupScreen() {
  const { signup } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSignup = async () => {
    if (!name.trim() || !email.trim() || !password.trim()) {
      setError("Please fill in all fields");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setError("");
    setIsLoading(true);
    try {
      await signup(name.trim(), email.trim().toLowerCase(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Signup failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell
      title="Create your account"
      subtitle="Build your private memory studio and keep every capture in one place."
      accentIcon="user-plus"
    >
      <YStack gap={18}>
        {error ? <InlineNotice tone="error" icon="alert-triangle" description={error} /> : null}

        <AppTextField
          label="Name"
          value={name}
          onChangeText={setName}
          placeholder="Your full name"
          autoCapitalize="words"
          textContentType="name"
          returnKeyType="next"
        />

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
          placeholder="At least 8 characters"
          secureTextEntry={!showPassword}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="next"
          accessory={
            <PressableScale
              onPress={() => setShowPassword((value) => !value)}
              style={{ paddingHorizontal: 10, paddingVertical: 8 }}
            >
              <Text fontSize={13} fontFamily={FontFamily.semiBold} color="$colorMuted">
                {showPassword ? "Hide" : "Show"}
              </Text>
            </PressableScale>
          }
        />

        <AppTextField
          label="Confirm password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Re-enter your password"
          secureTextEntry={!showConfirmPassword}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="done"
          accessory={
            <PressableScale
              onPress={() => setShowConfirmPassword((value) => !value)}
              style={{ paddingHorizontal: 10, paddingVertical: 8 }}
            >
              <Text fontSize={13} fontFamily={FontFamily.semiBold} color="$colorMuted">
                {showConfirmPassword ? "Hide" : "Show"}
              </Text>
            </PressableScale>
          }
        />

        <AppButton
          title="Create Account"
          onPress={handleSignup}
          loading={isLoading}
          icon="user-plus"
          variant="gradient"
          style={{ marginTop: 2 }}
        />

        <XStack justifyContent="center" alignItems="center" gap={6} marginTop={4}>
          <Text fontSize={14} fontFamily={FontFamily.regular} color="$colorMuted">
            Already have an account?
          </Text>
          <PressableScale onPress={() => router.back()}>
            <Text fontSize={14} fontFamily={FontFamily.semiBold} color="$primary">
              Sign In
            </Text>
          </PressableScale>
        </XStack>
      </YStack>
    </AuthShell>
  );
}
