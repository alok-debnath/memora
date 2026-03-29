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

export default function SignupScreen() {
  const theme = useAppTheme();
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
      subtitle="Start capturing memories with AI from the first note."
      accentIcon="user-plus"
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
              NAME
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Your full name"
              placeholderTextColor={theme.colorMuted.val}
              autoCapitalize="words"
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
                placeholder="At least 8 characters"
                placeholderTextColor={theme.colorMuted.val}
                secureTextEntry={!showPassword}
                autoComplete="new-password"
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

          <YStack gap={6}>
            <Text
              fontSize={11}
              fontFamily={FontFamily.semiBold}
              fontWeight="600"
              letterSpacing={1}
              marginLeft={4}
              color="$colorMuted"
            >
              CONFIRM PASSWORD
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
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Re-enter your password"
                placeholderTextColor={theme.colorMuted.val}
                secureTextEntry={!showConfirmPassword}
                autoComplete="new-password"
                style={{
                  flex: 1,
                  fontSize: 16,
                  fontFamily: FontFamily.regular,
                  paddingVertical: 14,
                  color: theme.color.val,
                }}
              />
              <PressableScale onPress={() => setShowConfirmPassword((value) => !value)} style={{ paddingHorizontal: 8, paddingVertical: 6 }}>
                <Text fontSize={13} fontFamily={FontFamily.semiBold} fontWeight="600" color="$colorMuted">
                  {showConfirmPassword ? "Hide" : "Show"}
                </Text>
              </PressableScale>
            </XStack>
          </YStack>

          <GradientButton
            title="Create Account"
            onPress={handleSignup}
            loading={isLoading}
            icon="user-plus"
            style={{ marginTop: 8 }}
          />

          <XStack justifyContent="center" alignItems="center" gap={6} marginTop={16}>
            <Text fontSize={14} fontFamily={FontFamily.regular} color="$colorMuted">
              Already have an account?
            </Text>
            <PressableScale onPress={() => router.back()}>
              <Text fontSize={14} fontFamily={FontFamily.semiBold} fontWeight="600" color="$primary">
                Sign In
              </Text>
            </PressableScale>
          </XStack>
      </YStack>
    </AuthShell>
  );
}
