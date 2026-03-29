import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { TextInput } from "react-native";
import { YStack, XStack, Text } from "tamagui";

import { useAppTheme } from "@/hooks/useAppTheme";
import { authClient } from "@/lib/auth-client";
import { AuthShell } from "@/components/auth/AuthShell";
import { GradientButton } from "@/components/ui/GradientButton";
import { FontFamily } from "@/constants/fonts";
import { PressableScale } from "@/components/ui/PressableScale";

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
      subtitle="Finish recovering your account with a fresh password."
      accentIcon="shield"
    >
      <PressableScale onPress={() => router.back()} style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <Feather name="arrow-left" size={20} color={theme.color.val} />
        <Text fontSize={13} fontFamily={FontFamily.medium} color="$colorMuted">Back</Text>
      </PressableScale>

      {error ? (
        <YStack padding={12} borderRadius={10} marginBottom={16} backgroundColor="#ef444415">
          <Text fontSize={13} fontFamily={FontFamily.medium} textAlign="center" style={{ color: "#ef4444" }}>{error}</Text>
        </YStack>
      ) : null}

      {success ? (
        <YStack alignItems="center" gap={20}>
          <YStack
            width={88}
            height={88}
            borderRadius={44}
            alignItems="center"
            justifyContent="center"
            backgroundColor="#22c55e15"
          >
            <Feather name="check-circle" size={48} color="#22c55e" />
          </YStack>
          <Text
            fontSize={15}
            fontFamily={FontFamily.regular}
            textAlign="center"
            lineHeight={22}
            paddingHorizontal={16}
            color="$colorMuted"
          >
            You can now sign in with your new password.
          </Text>
          <GradientButton
            title="Sign In"
            onPress={() => router.replace("/(public)/(auth)/login")}
            icon="log-in"
          />
        </YStack>
      ) : (
        <YStack gap={16}>
          <YStack gap={6}>
            <Text fontSize={13} fontFamily={FontFamily.medium} color="$colorMuted">
              New Password
            </Text>
            <XStack
              minHeight={52}
              borderRadius={12}
              borderWidth={1}
              paddingLeft={16}
              paddingRight={10}
              alignItems="center"
              backgroundColor="$card"
              borderColor="$borderColor"
            >
              <TextInput
                style={{
                  flex: 1,
                  fontSize: 16,
                  fontFamily: FontFamily.regular,
                  paddingVertical: 14,
                  color: theme.color.val,
                }}
                placeholder="At least 8 characters"
                placeholderTextColor={theme.colorMuted.val}
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry={!showNewPassword}
              />
              <PressableScale onPress={() => setShowNewPassword((value) => !value)} style={{ paddingHorizontal: 8, paddingVertical: 6 }}>
                <Text fontSize={13} fontFamily={FontFamily.semiBold} fontWeight="600" color="$colorMuted">
                  {showNewPassword ? "Hide" : "Show"}
                </Text>
              </PressableScale>
            </XStack>
          </YStack>

          <YStack gap={6}>
            <Text fontSize={13} fontFamily={FontFamily.medium} color="$colorMuted">
              Confirm Password
            </Text>
            <XStack
              minHeight={52}
              borderRadius={12}
              borderWidth={1}
              paddingLeft={16}
              paddingRight={10}
              alignItems="center"
              backgroundColor="$card"
              borderColor="$borderColor"
            >
              <TextInput
                style={{
                  flex: 1,
                  fontSize: 16,
                  fontFamily: FontFamily.regular,
                  paddingVertical: 14,
                  color: theme.color.val,
                }}
                placeholder="Re-enter password"
                placeholderTextColor={theme.colorMuted.val}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirmPassword}
              />
              <PressableScale onPress={() => setShowConfirmPassword((value) => !value)} style={{ paddingHorizontal: 8, paddingVertical: 6 }}>
                <Text fontSize={13} fontFamily={FontFamily.semiBold} fontWeight="600" color="$colorMuted">
                  {showConfirmPassword ? "Hide" : "Show"}
                </Text>
              </PressableScale>
            </XStack>
          </YStack>

          <GradientButton
            title={loading ? "Resetting..." : "Reset Password"}
            onPress={handleReset}
            icon="check"
            loading={loading}
            disabled={!newPassword.trim()}
          />
        </YStack>
      )}
    </AuthShell>
  );
}
