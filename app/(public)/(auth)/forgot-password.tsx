import { Feather } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Platform, TextInput, View } from "react-native";
import { YStack, XStack, Text } from "tamagui";

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
      subtitle="We’ll send a secure link so you can get back into Memora."
      accentIcon="key"
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
            <View style={{ marginTop: 1 }}>
              <Feather name="alert-triangle" size={16} color="#ef4444" />
            </View>
            <Text fontSize={13} lineHeight={19} fontFamily={FontFamily.medium} color="#ef4444" flex={1}>
              {error}
            </Text>
          </XStack>
        ) : null}

        {submitted ? (
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
              If an account exists with {email}, you’ll receive instructions to reset your password.
            </Text>
            <GradientButton
              title="Back to Login"
              onPress={() => router.replace("/(public)/(auth)/login")}
              icon="arrow-left"
            />
          </YStack>
        ) : (
          <YStack gap={16}>
            <YStack gap={7}>
              <Text fontSize={11} fontFamily={FontFamily.semiBold} letterSpacing={1.2} color="$colorMuted">
                EMAIL ADDRESS
              </Text>
              <TextInput
                style={{
                  height: 54,
                  borderRadius: 16,
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
                textContentType="emailAddress"
              />
              <Text fontSize={12} lineHeight={18} color="$colorMuted">
                We’ll only send a link if the email matches an existing account.
              </Text>
            </YStack>

            <GradientButton
              title={loading ? "Sending..." : "Send Reset Link"}
              onPress={handleSubmit}
              icon="send"
              loading={loading}
              disabled={!email.trim()}
            />

            <PressableScale
              style={{ alignItems: "center", paddingVertical: 10 }}
              onPress={() => router.replace("/(public)/(auth)/login")}
            >
              <Text fontSize={14} fontFamily={FontFamily.semiBold} color="$primary">
                Back to Login
              </Text>
            </PressableScale>
          </YStack>
        )}
      </YStack>
    </AuthShell>
  );
}
