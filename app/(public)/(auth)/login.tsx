import React, { useState } from "react";
import { TextInput } from "react-native";
import { YStack, XStack, Text } from "tamagui";
import { router } from "expo-router";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useAuth } from "@/hooks/useAuth";
import { GradientButton } from "@/components/ui/GradientButton";
import { PressableScale } from "@/components/ui/PressableScale";
import { AuthShell } from "@/components/auth/AuthShell";
import { FontFamily } from "@/constants/fonts";

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
      subtitle="Sign in to your AI memory workspace."
      accentIcon="zap"
    >
      <YStack gap={16}>
          {error ? (
            <YStack
              padding={12}
              borderRadius={10}
              backgroundColor={theme.destructive.val + "15"}
            >
              <Text
                fontSize={13}
                fontFamily={FontFamily.medium}
                textAlign="center"
                color="$destructive"
              >
                {error}
              </Text>
            </YStack>
          ) : null}

          <YStack gap={6}>
            <Text
              fontSize={11}
              fontFamily={FontFamily.semiBold}
              fontWeight="600"
              letterSpacing={1}
              marginLeft={4}
              color="$colorMuted"
            >
              EMAIL
            </Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={theme.colorMuted.val}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              style={{
                borderRadius: 12,
                paddingHorizontal: 16,
                paddingVertical: 14,
                fontSize: 16,
                fontFamily: FontFamily.regular,
                borderWidth: 1,
                backgroundColor: theme.secondary.val,
                color: theme.color.val,
                borderColor: theme.borderColor.val,
              }}
            />
          </YStack>

          <YStack gap={6}>
            <Text
              fontSize={11}
              fontFamily={FontFamily.semiBold}
              fontWeight="600"
              letterSpacing={1}
              marginLeft={4}
              color="$colorMuted"
            >
              PASSWORD
            </Text>
            <XStack
              minHeight={52}
              borderRadius={12}
              borderWidth={1}
              paddingLeft={16}
              paddingRight={10}
              alignItems="center"
              backgroundColor="$secondary"
              borderColor="$borderColor"
            >
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Enter your password"
                placeholderTextColor={theme.colorMuted.val}
                secureTextEntry={!showPassword}
                autoComplete="password"
                style={{
                  flex: 1,
                  fontSize: 16,
                  fontFamily: FontFamily.regular,
                  paddingVertical: 14,
                  color: theme.color.val,
                }}
              />
              <PressableScale onPress={() => setShowPassword((value) => !value)} style={{ paddingHorizontal: 8, paddingVertical: 6 }}>
                <Text fontSize={13} fontFamily={FontFamily.semiBold} fontWeight="600" color="$colorMuted">
                  {showPassword ? "Hide" : "Show"}
                </Text>
              </PressableScale>
            </XStack>
          </YStack>

          <GradientButton
            title="Sign In"
            onPress={handleLogin}
            loading={isLoading}
            icon="log-in"
            style={{ marginTop: 8 }}
          />

          <PressableScale
            onPress={() => router.push("/(public)/(auth)/forgot-password")}
            style={{ alignSelf: "center", marginTop: 12 }}
          >
            <Text fontSize={14} fontFamily={FontFamily.semiBold} fontWeight="600" color="$colorMuted">
              Forgot password?
            </Text>
          </PressableScale>

          <XStack justifyContent="center" alignItems="center" gap={6} marginTop={16}>
            <Text fontSize={14} fontFamily={FontFamily.regular} color="$colorMuted">
              Don't have an account?
            </Text>
            <PressableScale onPress={() => router.push("/(public)/(auth)/signup")}>
              <Text fontSize={14} fontFamily={FontFamily.semiBold} fontWeight="600" color="$primary">
                Sign Up
              </Text>
            </PressableScale>
          </XStack>
      </YStack>
    </AuthShell>
  );
}
