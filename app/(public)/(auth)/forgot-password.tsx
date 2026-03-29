import { Feather } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  TextInput,
  Platform,
} from "react-native";
import { YStack, XStack, Text } from "tamagui";

import Colors from "@/constants/colors";
import { useAppTheme } from "@/hooks/useAppTheme";
import { authClient } from "@/lib/auth-client";
import { AuthShell } from "@/components/auth/AuthShell";
import { GradientButton } from "@/components/ui/GradientButton";
import { FontFamily } from "@/constants/fonts";
import { PressableScale } from "@/components/ui/PressableScale";

export default function ForgotPasswordScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!email.trim()) return;
    setLoading(true);
    setError("");
    try {
      const redirectTo =
        Platform.OS === "web"
          ? `${window.location.origin}/reset-password`
          : Linking.createURL("/reset-password");
      const result = await authClient.requestPasswordReset({
        email: email.trim().toLowerCase(),
        redirectTo,
      });
      if (result.error) {
        throw new Error(result.error.message || "Unable to send reset email");
      }
      setSubmitted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Reset your password"
      subtitle="We'll send you a secure link so you can get back into Memora."
      accentIcon="key"
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

      {submitted ? (
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
            If an account exists with {email}, you will receive instructions
            to reset your password.
          </Text>
          <GradientButton
            title="Back to Login"
            onPress={() => router.replace("/(public)/(auth)/login")}
            icon="arrow-left"
          />
        </YStack>
      ) : (
        <YStack gap={16}>
          <YStack gap={6}>
            <Text fontSize={13} fontFamily={FontFamily.medium} color="$colorMuted">
              Email Address
            </Text>
            <TextInput
              style={{
                height: 52,
                borderRadius: 12,
                borderWidth: 1,
                paddingHorizontal: 16,
                fontSize: 16,
                fontFamily: FontFamily.regular,
                backgroundColor: theme.card.val,
                color: theme.color.val,
                borderColor: theme.borderColor.val,
              }}
              placeholder="your@email.com"
              placeholderTextColor={theme.colorMuted.val}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
          </YStack>

          <GradientButton
            title={loading ? "Sending..." : "Send Reset Link"}
            onPress={handleSubmit}
            icon="send"
            loading={loading}
            disabled={!email.trim()}
          />

          <PressableScale
            style={{ alignItems: "center", paddingVertical: 12 }}
            onPress={() => router.replace("/(public)/(auth)/login")}
          >
            <Text fontSize={14} fontFamily={FontFamily.medium} color="$primary">
              Back to Login
            </Text>
          </PressableScale>
        </YStack>
      )}
    </AuthShell>
  );
}
