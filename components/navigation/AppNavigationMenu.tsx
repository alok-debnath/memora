import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutDown,
  ReduceMotion,
} from "react-native-reanimated";
import { useQuery } from "convex/react";
import { Text, XStack, YStack } from "tamagui";

import { AppIconButton } from "@/components/ui/AppIconButton";
import { AppListRow } from "@/components/ui/AppListRow";
import { appShadow } from "@/components/ui/themeHelpers";
import { SECONDARY_NAVIGATION } from "@/constants/appNavigation";
import { radius, spacing } from "@/constants/uiTokens";
import { api } from "@/convex/_generated/api";
import { useAppRouter } from "@/hooks/useAppRouter";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useUIStore } from "@/store/ui";

export function AppNavigationMenu() {
  const theme = useAppTheme();
  const router = useAppRouter();
  const visible = useUIStore((state) => state.navigationMenuOpen);
  const close = useUIStore((state) => state.closeNavigationMenu);
  const adminStatus = useQuery(api.auth.getAdminStatus);

  const navigate = React.useCallback(
    (href: string) => {
      close();
      router.push(href as never);
    },
    [close, router],
  );

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={close}>
      <View style={styles.root}>
        <Animated.View
          entering={FadeIn.duration(180).reduceMotion(ReduceMotion.System)}
          exiting={FadeOut.duration(140).reduceMotion(ReduceMotion.System)}
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.overlay.val }]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={close}
            accessibilityLabel="Close menu"
          />
        </Animated.View>
        <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]} pointerEvents="box-none">
          <Animated.View
            entering={FadeInDown.duration(240).reduceMotion(ReduceMotion.System)}
            exiting={FadeOutDown.duration(180).reduceMotion(ReduceMotion.System)}
            style={[
              styles.panel,
              {
                backgroundColor: theme.background.val,
                borderColor: theme.borderSubtle.val,
                ...appShadow(theme.shadowColor.val, "lg"),
              },
            ]}
          >
            <XStack
              alignItems="center"
              justifyContent="space-between"
              gap={spacing.md}
              paddingHorizontal={spacing.lg}
              paddingTop={spacing.lg}
              paddingBottom={spacing.md}
              borderBottomWidth={1}
              borderBottomColor={theme.borderSubtle.val}
            >
              <YStack flex={1} gap={2}>
                <Text
                  fontFamily="$utility"
                  fontSize={10}
                  fontWeight="700"
                  letterSpacing={1.1}
                  textTransform="uppercase"
                  color={theme.primary.val}
                >
                  Your archive
                </Text>
                <Text fontFamily="$heading" fontSize={24} fontWeight="700" color={theme.color.val}>
                  Explore Memora
                </Text>
              </YStack>
              <AppIconButton icon="x" label="Close menu" onPress={close} variant="soft" />
            </XStack>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
              {SECONDARY_NAVIGATION.map((section) => {
                const items = section.items.filter(
                  (item) => !item.adminOnly || adminStatus?.isAdmin === true,
                );
                if (items.length === 0) return null;
                return (
                  <YStack key={section.label} gap={spacing.xs}>
                    <Text
                      paddingHorizontal={spacing.xs}
                      fontFamily="$utility"
                      fontSize={10}
                      fontWeight="700"
                      letterSpacing={1}
                      textTransform="uppercase"
                      color={theme.colorMuted.val}
                    >
                      {section.label}
                    </Text>
                    <YStack
                      borderWidth={1}
                      borderColor={theme.borderSubtle.val}
                      borderRadius={radius.lg}
                      padding={spacing.xs}
                      backgroundColor={theme.backgroundStrong.val}
                    >
                      {items.map((item) => (
                        <AppListRow
                          key={item.id}
                          icon={item.icon}
                          title={item.label}
                          description={item.detail}
                          onPress={() => navigate(item.href)}
                        />
                      ))}
                    </YStack>
                  </YStack>
                );
              })}
            </ScrollView>
          </Animated.View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

export function AppMenuButton() {
  const open = useUIStore((state) => state.openNavigationMenu);
  return <AppIconButton icon="grid" label="Open app menu" onPress={open} variant="soft" />;
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  safeArea: { flex: 1, justifyContent: "flex-end" },
  panel: {
    width: "100%",
    maxHeight: "88%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    overflow: "hidden",
  },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
});
