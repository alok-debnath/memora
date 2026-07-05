import { Feather } from "@/lib/icons";
import * as Linking from "expo-linking";
import { useAppRouter as useRouter } from "@/hooks/useAppRouter";
import React, { useState } from "react";
import { Platform, View } from "react-native";
import { YStack, Text } from "tamagui";

import { AuthShell } from "@/components/auth/AuthShell";
import { AppButton } from "@/components/ui/AppButton";
import { AppTextField } from "@/components/ui/AppTextField";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { SurfaceCard } from "@/components/ui/SurfaceCard";
import { FontFamily } from "@/constants/fonts";
import { useAppTheme } from "@/hooks/useAppTheme";
import { authClient } from "@/lib/auth-client";

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
          : Linking.createURL("/reset-password", { scheme: "memora" });
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
        <AppButton
          title="Back"
          onPress={() => router.back()}
          icon="arrow-left"
          variant="secondary"
          size="sm"
          tone="neutral"
        />

        {error ? <InlineNotice tone="error" icon="alert-triangle" description={error} /> : null}

        {submitted ? (
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
              If an account exists with {email}, you’ll receive instructions to reset your password.
            </Text>
            <AppButton
              title="Back to Login"
              onPress={() => router.replace("/(public)/(auth)/login")}
              icon="arrow-left"
              variant="gradient"
              fullWidth
            />
          </YStack>
        ) : (
          <YStack gap={16}>
            <AppTextField
              label="Email address"
              placeholder="your@email.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              helperText="We’ll only send a link if the email matches an existing account."
            />

            <AppButton
              title={loading ? "Sending..." : "Send Reset Link"}
              onPress={handleSubmit}
              icon="send"
              loading={loading}
              disabled={!email.trim()}
              variant="gradient"
              fullWidth
            />

            <AppButton
              title="Back to Login"
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
