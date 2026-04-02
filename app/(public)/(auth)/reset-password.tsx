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
      <YStack gap={18}>
        <PressableScale
          onPress={() => router.back()}
          style={{
            alignSelf: "flex-start",
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 999,
            backgroundColor: theme.accent.val + "88",
          }}
        >
          <Feather name="arrow-left" size={18} color={theme.color.val} />
          <Text fontSize={13} fontFamily={FontFamily.medium} color="$colorMuted">
            Back
          </Text>
        </PressableScale>

        {error ? (
          <XStack
            gap={10}
            alignItems="flex-start"
            padding={14}
            borderRadius={16}
            backgroundColor="#ef444412"
            borderWidth={1}
            borderColor="#ef444424"
          >
            <Feather name="alert-triangle" size={16} color="#ef4444" style={{ marginTop: 1 }} />
            <Text fontSize={13} lineHeight={19} fontFamily={FontFamily.medium} color="#ef4444" flex={1}>
              {error}
            </Text>
          </XStack>
        ) : null}

        {success ? (
          <YStack alignItems="center" gap={18}>
            <YStack
              width={84}
              height={84}
              borderRadius={42}
              alignItems="center"
              justifyContent="center"
              backgroundColor="#22c55e12"
              borderWidth={1}
              borderColor="#22c55e24"
            >
              <Feather name="check-circle" size={42} color="#16a34a" />
            </YStack>
            <Text
              fontSize={15}
              lineHeight={22}
              fontFamily={FontFamily.regular}
              textAlign="center"
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
            <YStack gap={7}>
              <Text fontSize={11} fontFamily={FontFamily.semiBold} letterSpacing={1.2} color="$colorMuted">
                NEW PASSWORD
              </Text>
              <XStack
                minHeight={54}
                borderRadius={16}
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
                    paddingVertical: 15,
                    color: theme.color.val,
                  }}
                  placeholder="At least 8 characters"
                  placeholderTextColor={theme.colorMuted.val}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry={!showNewPassword}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  returnKeyType="next"
                />
                <PressableScale
                  onPress={() => setShowNewPassword((value) => !value)}
                  style={{ paddingHorizontal: 10, paddingVertical: 8 }}
                >
                  <Text fontSize={13} fontFamily={FontFamily.semiBold} color="$colorMuted">
                    {showNewPassword ? "Hide" : "Show"}
                  </Text>
                </PressableScale>
              </XStack>
            </YStack>

            <YStack gap={7}>
              <Text fontSize={11} fontFamily={FontFamily.semiBold} letterSpacing={1.2} color="$colorMuted">
                CONFIRM PASSWORD
              </Text>
              <XStack
                minHeight={54}
                borderRadius={16}
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
                    paddingVertical: 15,
                    color: theme.color.val,
                  }}
                  placeholder="Re-enter password"
                  placeholderTextColor={theme.colorMuted.val}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirmPassword}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  returnKeyType="done"
                />
                <PressableScale
                  onPress={() => setShowConfirmPassword((value) => !value)}
                  style={{ paddingHorizontal: 10, paddingVertical: 8 }}
                >
                  <Text fontSize={13} fontFamily={FontFamily.semiBold} color="$colorMuted">
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
      </YStack>
    </AuthShell>
  );
}
