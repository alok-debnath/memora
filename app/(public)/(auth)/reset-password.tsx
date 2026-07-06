import { Feather } from "@/lib/icons";
import { useLocalSearchParams } from "expo-router";
import { useAppRouter as useRouter } from "@/hooks/useAppRouter";
import React, { useState } from "react";
import { View } from "react-native";
import { YStack, Text } from "tamagui";

import { AuthShell } from "@/components/auth/AuthShell";
import { PasswordVisibilityButton } from "@/components/auth/PasswordVisibilityButton";
import { AppButton } from "@/components/ui/AppButton";
import { AppTextField } from "@/components/ui/AppTextField";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { SurfaceCard } from "@/components/ui/SurfaceCard";
import { FontFamily } from "@/constants/fonts";
import { useAppTheme } from "@/hooks/useAppTheme";
import { authClient } from "@/lib/auth-client";

export default function ResetPasswordScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ token: string }>();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleReset = async () => {
    if (!newPassword.trim() || newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (!params.token) {
      setError("Invalid reset link");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await authClient.resetPassword({
        token: params.token,
        newPassword,
      });
      if (result.error) {
        throw new Error(result.error.message || "Reset failed");
      }
      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reset failed. Link may have expired.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Set a fresh password for your account."
      accentIcon="shield"
    >
      <YStack gap={16}>
        <AppButton
          title="Back"
          onPress={() => router.back()}
          icon="arrow-left"
          variant="ghost"
          size="sm"
          tone="neutral"
        />

        {error ? <InlineNotice tone="error" icon="alert-triangle" description={error} /> : null}

        {success ? (
          <YStack alignItems="center" gap={18}>
            <SurfaceCard tone="successSoft" padding={18} style={{ borderRadius: 999 }}>
              <View style={{ width: 48, alignItems: "center" }}>
                <Feather name="check-circle" size={42} color={theme.textSuccess.val} />
              </View>
            </SurfaceCard>
            <Text
              fontSize={15}
              lineHeight={22}
              fontFamily={FontFamily.regular}
              textAlign="center"
              color={theme.colorMuted.val}
            >
              You can now sign in with your new password.
            </Text>
            <AppButton
              title="Sign in"
              onPress={() => router.replace("/(public)/(auth)/login")}
              icon="log-in"
              variant="primary"
              fullWidth
            />
          </YStack>
        ) : (
          <YStack gap={16}>
            <AppTextField
              label="New password"
              placeholder="At least 8 characters"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry={!showNewPassword}
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="next"
              accessory={
                <PasswordVisibilityButton
                  visible={showNewPassword}
                  onPress={() => setShowNewPassword((value) => !value)}
                />
              }
            />

            <AppTextField
              label="Confirm password"
              placeholder="Re-enter password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirmPassword}
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="done"
              accessory={
                <PasswordVisibilityButton
                  visible={showConfirmPassword}
                  onPress={() => setShowConfirmPassword((value) => !value)}
                />
              }
            />

            <AppButton
              title={loading ? "Resetting..." : "Reset password"}
              onPress={handleReset}
              icon="check"
              loading={loading}
              disabled={!newPassword.trim()}
              variant="primary"
              fullWidth
            />

            <AppButton
              title="Back to login"
              onPress={() => router.replace("/(public)/(auth)/login")}
              variant="ghost"
              size="sm"
            />
          </YStack>
        )}
      </YStack>
    </AuthShell>
  );
}
