import React from "react";
import { ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import Animated, { FadeInUp } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { XStack, YStack, Text } from "tamagui";

import { navigationAccentColors } from "@/constants/colors";
import { useAppTheme } from "@/hooks/useAppTheme";
import { PressableScale } from "@/components/ui/PressableScale";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { SurfaceCard } from "@/components/ui/SurfaceCard";
import { useTabBarBottomPadding } from "@/hooks/useTabBarBottomPadding";

interface MenuItem {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  description: string;
  route: string;
  color: string;
}

const menuItems: MenuItem[] = [
  { icon: "clock", label: "Timeline", description: "Chronological memory view", route: "/timeline", color: navigationAccentColors.timeline },
  { icon: "bell", label: "Reminders", description: "Upcoming and past reminders", route: "/reminders", color: navigationAccentColors.reminders },
  { icon: "paperclip", label: "Files", description: "Images and documents stored in Google Drive", route: "/documents", color: navigationAccentColors.documents },
  { icon: "share-2", label: "Knowledge Graph", description: "Visual memory connections", route: "/knowledge-graph", color: navigationAccentColors.knowledgeGraph },
  { icon: "bar-chart-2", label: "Statistics", description: "Memory analytics and trends", route: "/statistics", color: navigationAccentColors.statistics },
  { icon: "archive", label: "Data", description: "Deleted memories and clean-slate controls", route: "/data", color: navigationAccentColors.data },
  { icon: "user", label: "Profile", description: "Settings and preferences", route: "/profile", color: navigationAccentColors.profile },
];

export default function MoreScreen() {
  const theme = useAppTheme();
  const totalRoutes = menuItems.length;
  const tabBarPadding = useTabBarBottomPadding();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background.val }} edges={["top", "bottom"]}>
      <YStack
        flex={1}
        backgroundColor="$background"
        paddingHorizontal={16}
        paddingTop={12}
      >
        <Animated.View entering={FadeInUp.duration(420)}>
        <Card
          style={{
            marginBottom: 16,
            padding: 18,
            borderRadius: 26,
            backgroundColor: theme.card.val,
          }}
        >
          <XStack alignItems="flex-start" justifyContent="space-between" gap={12}>
            <YStack flex={1} gap={6}>
              <Badge label="Navigation" color={theme.primary.val} />
              <Text fontSize={28} lineHeight={32} fontFamily="$heading" fontWeight="700" color="$color">
                Explore the vault
              </Text>
              <Text fontSize={14} lineHeight={20} fontFamily="$body" color="$colorMuted">
                Jump into timelines, analytics, reminders, data controls, and profile settings from one place.
              </Text>
            </YStack>
            <YStack
              width={52}
              height={52}
              borderRadius={18}
              alignItems="center"
              justifyContent="center"
              backgroundColor={theme.primary.val + "18"}
            >
              <Feather name="compass" size={22} color={theme.primary.val} />
            </YStack>
          </XStack>
          <XStack gap={10} marginTop={16} flexWrap="wrap">
            <Badge label={`${totalRoutes} sections`} color={theme.primary.val} />
            <Badge label="Fast actions" tone="neutral" />
          </XStack>
        </Card>
      </Animated.View>

        <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: tabBarPadding }} showsVerticalScrollIndicator={false}>
          {menuItems.map((item, i) => (
            <Animated.View key={item.route} entering={FadeInUp.delay(i * 60).duration(400)}>
              <PressableScale
                onPress={() => router.push(item.route as never)}
                style={{ borderRadius: 22 }}
              >
                <SurfaceCard padding={16} style={{ borderRadius: 22 }}>
                  <XStack alignItems="center" gap={14}>
                    <YStack
                      width={46}
                      height={46}
                      borderRadius={14}
                      backgroundColor={item.color + "15"}
                      alignItems="center"
                      justifyContent="center"
                    >
                      <Feather name={item.icon} size={22} color={item.color} />
                    </YStack>
                    <YStack flex={1}>
                      <Text fontSize={16} fontFamily="$body" fontWeight="600" color="$color">
                        {item.label}
                      </Text>
                      <Text fontSize={13} fontFamily="$body" color="$colorMuted" marginTop={2}>
                        {item.description}
                      </Text>
                    </YStack>
                    <Feather name="chevron-right" size={18} color={theme.colorMuted.val} />
                  </XStack>
                </SurfaceCard>
              </PressableScale>
            </Animated.View>
          ))}
        </ScrollView>
      </YStack>
    </SafeAreaView>
  );
}
