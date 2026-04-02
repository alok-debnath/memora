import React from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, XStack, YStack } from "tamagui";

import { useIsLargeScreen } from "@/hooks/useIsLargeScreen";

type AuthShellProps = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  accentIcon?: keyof typeof Feather.glyphMap;
};

const features = [
  {
    icon: "mic",
    title: "Voice-first capture",
    description: "Turn spoken moments into structured notes without breaking the flow.",
  },
  {
    icon: "search",
    title: "Meaning search",
    description: "Find memories by intent, not only exact keywords or tags.",
  },
  {
    icon: "layers",
    title: "Connected memory graph",
    description: "People, places, reminders, and follow-ups stay linked together.",
  },
] as const;

function BrandMark({ icon }: { icon: keyof typeof Feather.glyphMap }) {
  return (
    <LinearGradient
      colors={["#F7C86A", "#E8911B", "#C7770A"] as const}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.brandMark}
    >
      <Feather name={icon} size={26} color="#FFFFFF" />
    </LinearGradient>
  );
}

function FeatureLine({
  icon,
  title,
  description,
}: (typeof features)[number]) {
  return (
    <XStack
      gap={14}
      alignItems="flex-start"
      backgroundColor="rgba(255,255,255,0.68)"
      borderRadius={22}
      padding={16}
      borderWidth={1}
      borderColor="rgba(255,255,255,0.48)"
    >
      <View style={styles.featureIcon}>
        <Feather name={icon} size={18} color="#8A5A0D" />
      </View>
      <YStack flex={1}>
        <Text fontSize={15} fontFamily="$heading" fontWeight="700" color="#141414">
          {title}
        </Text>
        <Text fontSize={13} lineHeight={19} color="#5F5B53" marginTop={3}>
          {description}
        </Text>
      </YStack>
    </XStack>
  );
}

function ShellFrame({
  title,
  subtitle,
  children,
  accentIcon,
}: AuthShellProps) {
  const insets = useSafeAreaInsets();

  return (
    <YStack flex={1} backgroundColor="$background">
      <View pointerEvents="none" style={styles.backgroundGlowOne} />
      <View pointerEvents="none" style={styles.backgroundGlowTwo} />
      <View pointerEvents="none" style={styles.backgroundGlowThree} />

      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top + 18,
          paddingBottom: insets.bottom + 28,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <YStack paddingHorizontal={20}>
          <YStack
            maxWidth={980}
            width="100%"
            alignSelf="center"
            borderRadius={32}
            overflow="hidden"
            borderWidth={1}
            borderColor="$borderColor"
            backgroundColor="$card"
            shadowColor="$shadowColor"
            shadowOffset={{ width: 0, height: 22 }}
            shadowOpacity={0.16}
            shadowRadius={40}
            elevation={8}
          >
            <LinearGradient
              colors={["rgba(255, 248, 234, 0.94)", "rgba(252, 246, 236, 0.92)", "rgba(255,255,255,0.92)"] as const}
              style={styles.frameGradient}
            >
              <View style={styles.frameTopLine} />

              <XStack flex={1} minHeight={Platform.OS === "web" ? 720 : undefined}>
                <YStack
                  flex={1.05}
                  padding={Platform.OS === "web" ? 36 : 24}
                  justifyContent="space-between"
                >
                  <YStack gap={18} maxWidth={480}>
                    <XStack alignItems="center" gap={12}>
                      <BrandMark icon={accentIcon ?? "zap"} />
                      <YStack>
                        <Text fontSize={12} letterSpacing={2.2} color="#7B5B24">
                          MEMORA
                        </Text>
                        <Text fontSize={13} color="#6A655C">
                          Private AI memory workspace
                        </Text>
                      </YStack>
                    </XStack>

                    <YStack gap={12} paddingTop={8}>
                      <Text
                        fontSize={Platform.OS === "web" ? 42 : 34}
                        lineHeight={Platform.OS === "web" ? 46 : 38}
                        fontFamily="$heading"
                        fontWeight="800"
                        color="#17130D"
                      >
                        Capture the day. Recall the signal.
                      </Text>
                      <Text
                        fontSize={16}
                        lineHeight={24}
                        color="#5A554D"
                        maxWidth={440}
                      >
                        {subtitle}
                      </Text>
                    </YStack>

                    <XStack flexWrap="wrap" gap={10}>
                      {["Private by default", "Voice-friendly", "Searchable by meaning"].map((item) => (
                        <YStack
                          key={item}
                          borderRadius={999}
                          paddingHorizontal={14}
                          paddingVertical={8}
                          backgroundColor="rgba(232,145,27,0.10)"
                          borderWidth={1}
                          borderColor="rgba(232,145,27,0.16)"
                        >
                          <Text fontSize={13} color="#7A4E08">
                            {item}
                          </Text>
                        </YStack>
                      ))}
                    </XStack>

                    <YStack gap={14} paddingTop={6}>
                      {features.map((feature) => (
                        <FeatureLine key={feature.title} {...feature} />
                      ))}
                    </YStack>
                  </YStack>

                  <XStack
                    marginTop={24}
                    alignItems="center"
                    justifyContent="space-between"
                    gap={16}
                    flexWrap="wrap"
                  >
                    <YStack>
                      <Text fontSize={12} letterSpacing={1.6} color="#8A7C67">
                        WHAT YOU GET
                      </Text>
                      <Text fontSize={14} color="#584E40" marginTop={4}>
                        A calmer entry point with clearer next steps.
                      </Text>
                    </YStack>
                    <XStack gap={10} flexWrap="wrap">
                      {["Memory graph", "Diary", "Review", "Chat"].map((item) => (
                        <YStack
                          key={item}
                          borderRadius={999}
                          paddingHorizontal={12}
                          paddingVertical={8}
                          backgroundColor="rgba(255,255,255,0.78)"
                          borderWidth={1}
                          borderColor="rgba(232,145,27,0.14)"
                        >
                          <Text fontSize={12} color="#5E5242">
                            {item}
                          </Text>
                        </YStack>
                      ))}
                    </XStack>
                  </XStack>
                </YStack>

                <YStack
                  flex={0.9}
                  padding={Platform.OS === "web" ? 26 : 20}
                  backgroundColor="rgba(255,255,255,0.72)"
                  borderLeftWidth={Platform.OS === "web" ? 1 : 0}
                  borderLeftColor="rgba(232,145,27,0.12)"
                  justifyContent="center"
                >
                  <KeyboardAvoidingView
                    behavior={Platform.OS === "ios" ? "padding" : undefined}
                    style={{ flex: 1 }}
                  >
                    <ScrollView
                      keyboardShouldPersistTaps="handled"
                      showsVerticalScrollIndicator={false}
                      contentContainerStyle={styles.formScroll}
                    >
                      <Animated.View
                        entering={FadeInUp.duration(400)}
                        style={styles.formCard}
                      >
                        <XStack
                          alignItems="center"
                          justifyContent="space-between"
                          marginBottom={18}
                        >
                          <YStack>
                            <Text
                              fontSize={12}
                              letterSpacing={2}
                              color="#8A7C67"
                            >
                              SIGN IN AREA
                            </Text>
                            <Text
                              fontSize={Platform.OS === "web" ? 30 : 28}
                              lineHeight={Platform.OS === "web" ? 34 : 32}
                              fontFamily="$heading"
                              fontWeight="800"
                              color="$color"
                              marginTop={6}
                            >
                              {title}
                            </Text>
                          </YStack>
                        </XStack>
                        <Text
                          fontSize={15}
                          lineHeight={22}
                          color="$colorMuted"
                          marginBottom={20}
                        >
                          {subtitle}
                        </Text>
                        {children}
                      </Animated.View>
                    </ScrollView>
                  </KeyboardAvoidingView>
                </YStack>
              </XStack>
            </LinearGradient>
          </YStack>
        </YStack>
      </ScrollView>
    </YStack>
  );
}

function MobileFrame({
  title,
  subtitle,
  children,
  accentIcon,
}: AuthShellProps) {
  const insets = useSafeAreaInsets();

  return (
    <YStack flex={1} backgroundColor="$background">
      <View pointerEvents="none" style={styles.backgroundGlowOne} />
      <View pointerEvents="none" style={styles.backgroundGlowTwo} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 24,
        }}
      >
        <YStack paddingHorizontal={18} gap={18}>
          <Animated.View entering={FadeInUp.duration(420)}>
            <YStack
              borderRadius={30}
              padding={18}
              borderWidth={1}
              borderColor="rgba(232,145,27,0.12)"
              backgroundColor="rgba(255,255,255,0.72)"
            >
              <XStack alignItems="center" gap={12} marginBottom={18}>
                <BrandMark icon={accentIcon ?? "zap"} />
                <YStack>
                  <Text fontSize={11} letterSpacing={2.1} color="#7B5B24">
                    MEMORA
                  </Text>
                  <Text fontSize={13} color="#6A655C">
                    Private AI memory workspace
                  </Text>
                </YStack>
              </XStack>

              <Text
                fontSize={32}
                lineHeight={36}
                fontFamily="$heading"
                fontWeight="800"
                color="#17130D"
              >
                Capture the day. Recall the signal.
              </Text>
              <Text
                fontSize={15}
                lineHeight={22}
                color="#5A554D"
                marginTop={10}
              >
                {subtitle}
              </Text>

              <XStack flexWrap="wrap" gap={8} marginTop={16}>
                {["Voice-first", "Private by default", "Meaning search"].map((item) => (
                  <YStack
                    key={item}
                    borderRadius={999}
                    paddingHorizontal={12}
                    paddingVertical={7}
                    backgroundColor="rgba(232,145,27,0.10)"
                    borderWidth={1}
                    borderColor="rgba(232,145,27,0.16)"
                  >
                    <Text fontSize={12} color="#7A4E08">
                      {item}
                    </Text>
                  </YStack>
                ))}
              </XStack>
            </YStack>
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(100).duration(420)}>
            <YStack
              borderRadius={28}
              padding={18}
              borderWidth={1}
              borderColor="$borderColor"
              backgroundColor="$card"
              shadowColor="$shadowColor"
              shadowOffset={{ width: 0, height: 16 }}
              shadowOpacity={0.1}
              shadowRadius={24}
              elevation={4}
            >
              <XStack alignItems="center" justifyContent="space-between" marginBottom={14}>
                <Text fontSize={12} letterSpacing={1.8} color="$colorMuted">
                  GET STARTED
                </Text>
                <Text fontSize={12} color="$colorMuted">
                  Clean, private, fast
                </Text>
              </XStack>
              {children}
            </YStack>
          </Animated.View>
        </YStack>
      </ScrollView>
    </YStack>
  );
}

export function AuthShell(props: AuthShellProps) {
  const isLargeScreen = useIsLargeScreen();

  return isLargeScreen ? <ShellFrame {...props} /> : <MobileFrame {...props} />;
}

const styles = StyleSheet.create({
  backgroundGlowOne: {
    position: "absolute",
    width: 420,
    height: 420,
    borderRadius: 420,
    top: -120,
    right: -140,
    backgroundColor: "rgba(232,145,27,0.12)",
    opacity: 0.9,
  },
  backgroundGlowTwo: {
    position: "absolute",
    width: 320,
    height: 320,
    borderRadius: 320,
    bottom: -120,
    left: -120,
    backgroundColor: "rgba(245,166,35,0.10)",
  },
  backgroundGlowThree: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 180,
    top: "34%",
    left: "50%",
    marginLeft: -90,
    backgroundColor: "rgba(255,255,255,0.38)",
  },
  frameGradient: {
    flex: 1,
  },
  frameTopLine: {
    height: 4,
    width: "100%",
    backgroundColor: "rgba(232,145,27,0.24)",
  },
  formScroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingVertical: 10,
  },
  formCard: {
    borderRadius: 26,
  },
  brandMark: {
    width: 58,
    height: 58,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#E8911B",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 4,
  },
  featureIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(232,145,27,0.10)",
  },
});
