import React, { useState } from "react";
import { TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
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
      subtitle="Sign in to continue."
      accentIcon="zap"
    >
      <YStack gap={18}>
        {error ? (
          <XStack
            gap={10}
            alignItems="flex-start"
            padding={14}
            borderRadius={16}
            backgroundColor={theme.destructive.val + "12"}
            borderWidth={1}
            borderColor={theme.destructive.val + "22"}
          >
            <View style={{ marginTop: 1 }}>
              <Feather name="alert-triangle" size={16} color={theme.destructive.val} />
            </View>
            <Text fontSize={13} lineHeight={19} fontFamily={FontFamily.medium} color="$destructive" flex={1}>
              {error}
            </Text>
          </XStack>
        ) : null}

        <YStack gap={7}>
          <Text fontSize={11} fontFamily={FontFamily.semiBold} letterSpacing={1.2} color="$colorMuted">
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
            textContentType="emailAddress"
            returnKeyType="next"
            style={{
              borderRadius: 16,
              paddingHorizontal: 16,
              paddingVertical: 15,
              fontSize: 16,
              fontFamily: FontFamily.regular,
              borderWidth: 1,
              backgroundColor: theme.card.val,
              color: theme.color.val,
              borderColor: theme.borderColor.val,
            }}
          />
        </YStack>

        <YStack gap={7}>
          <Text fontSize={11} fontFamily={FontFamily.semiBold} letterSpacing={1.2} color="$colorMuted">
            PASSWORD
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
              value={password}
              onChangeText={setPassword}
              placeholder="Enter your password"
              placeholderTextColor={theme.colorMuted.val}
              secureTextEntry={!showPassword}
              autoComplete="password"
              textContentType="password"
              returnKeyType="go"
              style={{
                flex: 1,
                fontSize: 16,
                fontFamily: FontFamily.regular,
                paddingVertical: 15,
                color: theme.color.val,
              }}
            />
            <PressableScale
              onPress={() => setShowPassword((value) => !value)}
              style={{ paddingHorizontal: 10, paddingVertical: 8 }}
            >
              <Text fontSize={13} fontFamily={FontFamily.semiBold} color="$colorMuted">
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
