import React, { useCallback } from "react";
import { Feather } from "@/lib/icons";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "convex/react";
import { ActivityIndicator, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Text, XStack, YStack } from "tamagui";

import { AppButton } from "@/components/ui/AppButton";
import { Badge } from "@/components/ui/Badge";
import { PressableScale } from "@/components/ui/PressableScale";
import { SurfaceCard } from "@/components/ui/SurfaceCard";
import { withAlpha } from "@/components/ui/themeHelpers";
import { api } from "@/convex/_generated/api";
import { spacing, radius } from "@/constants/uiTokens";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useIsLargeScreen } from "@/hooks/useIsLargeScreen";
import { useAppRouter as useRouter } from "@/hooks/useAppRouter";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

type ActionItem = {
  action: string;
};

function CenterState({
  icon,
  title,
  description,
  loading,
  action,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  title: string;
  description: string;
  loading?: boolean;
  action?: React.ReactNode;
}) {
  const theme = useAppTheme();

  return (
    <YStack
      flex={1}
      alignItems="center"
      justifyContent="center"
      padding={spacing.xl}
      backgroundColor={theme.background.val}
    >
      <SurfaceCard
        tone="elevated"
        variant="solid"
        shadowed={false}
        radius={radius.lg}
        padding={spacing.xl}
        style={{ width: "100%", maxWidth: 420 }}
      >
        <YStack alignItems="center" gap={spacing.md}>
          <YStack
            width={52}
            height={52}
            borderRadius={radius.md}
            alignItems="center"
            justifyContent="center"
            backgroundColor={theme.surfaceAccent.val}
            borderWidth={1}
            borderColor={withAlpha(theme.primary.val, "24")}
          >
            {loading ? (
              <ActivityIndicator size="small" color={theme.primary.val} />
            ) : (
              <Feather name={icon} size={22} color={theme.primary.val} />
            )}
          </YStack>
          <YStack gap={spacing.xs} alignItems="center">
            <Text color={theme.color.val} fontFamily="$heading" fontSize={22} fontWeight="800">
              {title}
            </Text>
            <Text color={theme.colorMuted.val} fontSize={14} lineHeight={21} textAlign="center">
              {description}
            </Text>
          </YStack>
          {action}
        </YStack>
      </SurfaceCard>
    </YStack>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  const theme = useAppTheme();

  return (
    <YStack gap={spacing.xs}>
      <Text
        color={theme.colorMuted.val}
        fontSize={11}
        fontWeight="700"
        textTransform="uppercase"
        letterSpacing={0.8}
      >
        {label}
      </Text>
      <Text color={theme.color.val} fontSize={14} lineHeight={20}>
        {value}
      </Text>
    </YStack>
  );
}

export default function SharedMemoryScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const theme = useAppTheme();
  const router = useRouter();
  const isLargeScreen = useIsLargeScreen();
  const shareToken = typeof token === "string" ? token : "";

  const memory = useQuery(api.memories.getByShareToken, shareToken ? { shareToken } : "skip");

  const openUrl = useCallback((url: string) => {
    Linking.openURL(url);
  }, []);

  if (!shareToken) {
    return (
      <CenterState
        icon="alert-circle"
        title="Invalid share link"
        description="This link is missing the token needed to open a shared memory."
        action={
          <AppButton
            title="Go home"
            onPress={() => router.replace("/(protected)/(tabs)")}
            icon="home"
            variant="primary"
            fullWidth
          />
        }
      />
    );
  }

  if (memory === undefined) {
    return (
      <CenterState
        icon="share-2"
        title="Opening memory"
        description="Loading the shared memory."
        loading
      />
    );
  }

  if (memory === null) {
    return (
      <CenterState
        icon="alert-circle"
        title="Memory not found"
        description="This shared memory may have expired or been removed."
        action={
          <AppButton
            title="Go home"
            onPress={() => router.replace("/(protected)/(tabs)")}
            icon="home"
            variant="primary"
            fullWidth
          />
        }
      />
    );
  }

  const people = memory.people ?? [];
  const locations = memory.locations ?? [];
  const links = memory.linkedUrls ?? [];
  const actions = memory.extractedActions ?? [];
  const hasDetails = people.length > 0 || locations.length > 0;
  const capturedDate = dateFormatter.format(new Date(memory._creationTime));

  return (
    <YStack flex={1} backgroundColor={theme.background.val}>
      <SafeAreaView style={{ flex: 1, backgroundColor: "transparent" }} edges={["top", "bottom"]}>
        <KeyboardAwareScrollViewCompat
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: isLargeScreen ? spacing.xxl : spacing.lg,
            paddingVertical: isLargeScreen ? spacing.xxl : spacing.xl,
          }}
        >
          <Animated.View
            entering={FadeInDown.duration(240).springify().damping(22).stiffness(220)}
            style={{ width: "100%", maxWidth: 720, alignSelf: "center" }}
          >
            <YStack gap={spacing.lg}>
              <XStack alignItems="center" justifyContent="space-between" gap={spacing.md}>
                <Badge label="Shared memory" tone="neutral" icon="share-2" />
                <Text color={theme.colorMuted.val} fontSize={12}>
                  Memora
                </Text>
              </XStack>

              <SurfaceCard
                tone="elevated"
                variant="solid"
                shadowed={false}
                radius={radius.lg}
                padding={isLargeScreen ? spacing.xl : spacing.lg}
              >
                <YStack gap={spacing.lg}>
                  <YStack gap={spacing.sm}>
                    <Text color={theme.colorMuted.val} fontSize={12}>
                      Captured {capturedDate}
                    </Text>
                    <Text
                      color={theme.color.val}
                      fontFamily="$heading"
                      fontSize={isLargeScreen ? 32 : 26}
                      lineHeight={isLargeScreen ? 37 : 31}
                      fontWeight="800"
                    >
                      {memory.title}
                    </Text>
                  </YStack>

                  <Text color={theme.color.val} fontSize={16} lineHeight={25}>
                    {memory.content}
                  </Text>

                  {hasDetails ? (
                    <YStack
                      gap={spacing.md}
                      paddingTop={spacing.lg}
                      borderTopWidth={1}
                      borderColor={theme.borderColor.val}
                    >
                      {people.length > 0 ? (
                        <DetailRow label="People" value={people.join(", ")} />
                      ) : null}
                      {locations.length > 0 ? (
                        <DetailRow label="Locations" value={locations.join(", ")} />
                      ) : null}
                    </YStack>
                  ) : null}

                  {links.length > 0 ? (
                    <YStack gap={spacing.sm}>
                      <Text
                        color={theme.colorMuted.val}
                        fontSize={11}
                        fontWeight="700"
                        textTransform="uppercase"
                        letterSpacing={0.8}
                      >
                        Links
                      </Text>
                      <YStack gap={spacing.sm}>
                        {links.map((url: string) => (
                          <PressableScale key={url} onPress={() => openUrl(url)} scale={0.99}>
                            <XStack
                              alignItems="center"
                              gap={spacing.sm}
                              paddingHorizontal={spacing.md}
                              paddingVertical={spacing.sm}
                              borderRadius={radius.sm}
                              backgroundColor={theme.surfaceAccent.val}
                              borderWidth={1}
                              borderColor={withAlpha(theme.primary.val, "20")}
                            >
                              <Feather name="link" size={14} color={theme.primary.val} />
                              <Text
                                color={theme.primary.val}
                                fontSize={13}
                                fontWeight="600"
                                flex={1}
                                numberOfLines={1}
                              >
                                {url}
                              </Text>
                            </XStack>
                          </PressableScale>
                        ))}
                      </YStack>
                    </YStack>
                  ) : null}

                  {actions.length > 0 ? (
                    <YStack gap={spacing.sm}>
                      <Text
                        color={theme.colorMuted.val}
                        fontSize={11}
                        fontWeight="700"
                        textTransform="uppercase"
                        letterSpacing={0.8}
                      >
                        Suggested actions
                      </Text>
                      <YStack gap={spacing.sm}>
                        {actions.map((item: ActionItem, index: number) => (
                          <XStack
                            key={`${item.action}-${index}`}
                            alignItems="center"
                            gap={spacing.sm}
                          >
                            <Feather name="check-circle" size={15} color={theme.primary.val} />
                            <Text color={theme.color.val} fontSize={14} lineHeight={20} flex={1}>
                              {item.action}
                            </Text>
                          </XStack>
                        ))}
                      </YStack>
                    </YStack>
                  ) : null}
                </YStack>
              </SurfaceCard>
            </YStack>
          </Animated.View>
        </KeyboardAwareScrollViewCompat>
      </SafeAreaView>
    </YStack>
  );
}
