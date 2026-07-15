import React, { Suspense, lazy } from "react";
import { Pressable, ScrollView } from "react-native";
import { usePathname } from "expo-router";
import { useQuery } from "convex/react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, XStack, YStack } from "tamagui";

import { api } from "@/convex/_generated/api";
import { Feather } from "@/lib/icons";
import { appRouter } from "@/lib/appRouter";
import { APP_NAVIGATION, isNavigationItemActive } from "@/constants/appNavigation";
import { radius, spacing } from "@/constants/uiTokens";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import { useUIStore } from "@/store/ui";
import { withAlpha } from "@/components/ui/themeHelpers";
import { PressableScale } from "@/components/ui/PressableScale";

const ChatDock = lazy(() =>
  import("@/components/chat-sheet/ChatDock").then((module) => ({ default: module.ChatDock })),
);

export function ProtectedAppShell({ children }: { children: React.ReactNode }) {
  const theme = useAppTheme();
  const pathname = usePathname();
  const responsive = useResponsiveLayout();
  const openCommand = useUIStore((state) => state.openCommand);
  const commandOpen = useUIStore((state) => state.sheets.unifiedCommand.open);
  const adminStatus = useQuery(api.auth.getAdminStatus);
  const rail = responsive.navigationMode === "rail";

  if (responsive.navigationMode === "bottom") return <>{children}</>;

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.background.val }}
      edges={["top", "bottom"]}
    >
      <XStack flex={1} backgroundColor={theme.background.val}>
        <YStack
          width={responsive.navigationWidth}
          borderRightWidth={1}
          borderRightColor={theme.borderSubtle.val}
          backgroundColor={theme.backgroundStrong.val}
          paddingHorizontal={rail ? spacing.sm : spacing.md}
          paddingVertical={spacing.md}
        >
          <XStack
            height={54}
            alignItems="center"
            justifyContent={rail ? "center" : "flex-start"}
            gap={spacing.md}
            paddingHorizontal={rail ? 0 : spacing.sm}
            marginBottom={spacing.md}
          >
            <YStack
              width={40}
              height={40}
              borderRadius={radius.sm}
              backgroundColor={theme.surfaceAccent.val}
              borderWidth={1}
              borderColor={withAlpha(theme.primary.val, "2C")}
              alignItems="center"
              justifyContent="center"
            >
              <Feather name="archive" size={18} color={theme.primary.val} />
            </YStack>
            {!rail ? (
              <YStack flex={1} minWidth={0}>
                <Text fontFamily="$heading" fontSize={22} fontWeight="800" color={theme.color.val}>
                  Memora
                </Text>
                <Text fontSize={11} fontFamily="$utility" color={theme.colorMuted.val}>
                  Your living archive
                </Text>
              </YStack>
            ) : null}
          </XStack>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: spacing.md }}
          >
            <YStack gap={rail ? spacing.sm : spacing.lg}>
              {APP_NAVIGATION.map((section) => {
                const items = section.items.filter(
                  (item) => !item.adminOnly || adminStatus?.isAdmin === true,
                );
                if (items.length === 0) return null;

                return (
                  <YStack key={section.label} gap={spacing.xs}>
                    {!rail ? (
                      <Text
                        paddingHorizontal={spacing.sm}
                        fontFamily="$utility"
                        fontSize={10}
                        letterSpacing={1.1}
                        textTransform="uppercase"
                        fontWeight="700"
                        color={theme.colorMuted.val}
                      >
                        {section.label}
                      </Text>
                    ) : null}
                    {items.map((item) => {
                      const active = isNavigationItemActive(pathname, item.href);
                      return (
                        <Pressable
                          key={item.href}
                          onPress={() => appRouter.navigate(item.href as never)}
                          accessibilityRole="link"
                          accessibilityLabel={`${item.label}. ${item.detail}`}
                          accessibilityState={{ selected: active }}
                          style={({ pressed }) => ({
                            minHeight: rail ? 44 : 54,
                            borderRadius: radius.md,
                            opacity: pressed ? 0.78 : 1,
                            backgroundColor: active ? theme.surfaceAccent.val : "transparent",
                            borderWidth: 1,
                            borderColor: active
                              ? withAlpha(theme.primary.val, "28")
                              : "transparent",
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: rail ? "center" : "flex-start",
                            gap: spacing.md,
                            paddingHorizontal: rail ? 0 : spacing.sm,
                          })}
                        >
                          <YStack
                            width={rail ? 38 : 34}
                            height={rail ? 38 : 34}
                            borderRadius={radius.sm}
                            alignItems="center"
                            justifyContent="center"
                            backgroundColor={
                              active ? withAlpha(theme.primary.val, "18") : theme.secondary.val
                            }
                          >
                            <Feather
                              name={item.icon}
                              size={17}
                              color={active ? theme.primary.val : theme.colorMuted.val}
                            />
                          </YStack>
                          {!rail ? (
                            <YStack flex={1} minWidth={0} gap={1}>
                              <Text
                                fontSize={14}
                                fontWeight={active ? "700" : "600"}
                                color={theme.color.val}
                                numberOfLines={1}
                              >
                                {item.label}
                              </Text>
                              <Text
                                fontFamily="$utility"
                                fontSize={10}
                                color={theme.colorMuted.val}
                                numberOfLines={1}
                              >
                                {item.detail}
                              </Text>
                            </YStack>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </YStack>
                );
              })}
            </YStack>
          </ScrollView>

          <PressableScale onPress={openCommand} accessibilityLabel="Capture a new memory">
            <XStack
              minHeight={48}
              borderRadius={radius.md}
              alignItems="center"
              justifyContent="center"
              gap={spacing.sm}
              paddingHorizontal={rail ? 0 : spacing.md}
              backgroundColor={theme.primary.val}
            >
              <Feather name="plus" size={19} color={theme.textInverse.val} />
              {!rail ? (
                <Text color={theme.textInverse.val} fontWeight="700" fontSize={14}>
                  New memory
                </Text>
              ) : null}
            </XStack>
          </PressableScale>
        </YStack>

        <YStack flex={1} minWidth={0} padding={responsive.isWide ? spacing.md : spacing.sm}>
          <YStack
            flex={1}
            minWidth={0}
            overflow="hidden"
            borderRadius={responsive.isWide ? 26 : radius.lg}
            borderWidth={1}
            borderColor={theme.borderSubtle.val}
            backgroundColor={theme.background.val}
          >
            {children}
          </YStack>
        </YStack>
        {responsive.isWide && commandOpen ? (
          <Suspense fallback={null}>
            <ChatDock />
          </Suspense>
        ) : null}
      </XStack>
    </SafeAreaView>
  );
}
