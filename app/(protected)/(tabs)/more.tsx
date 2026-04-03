import React from "react";
import { ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import Animated, { FadeInUp } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { XStack, YStack, Text } from "tamagui";

import { useAppTheme } from "@/hooks/useAppTheme";
import { PressableScale } from "@/components/ui/PressableScale";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

interface MenuItem {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  description: string;
  route: string;
  color: string;
}

const menuItems: MenuItem[] = [
  { icon: "clock", label: "Timeline", description: "Chronological memory view", route: "/timeline", color: "#6366F1" },
  { icon: "bell", label: "Reminders", description: "Upcoming and past reminders", route: "/reminders", color: "#F59E0B" },
  { icon: "file-text", label: "Documents", description: "Document vault with AI extraction", route: "/documents", color: "#3B82F6" },
  { icon: "share-2", label: "Knowledge Graph", description: "Visual memory connections", route: "/knowledge-graph", color: "#10B981" },
  { icon: "bar-chart-2", label: "Statistics", description: "Memory analytics and trends", route: "/statistics", color: "#EC4899" },
  { icon: "archive", label: "Data", description: "Deleted memories and clean-slate controls", route: "/data", color: "#D97706" },
  { icon: "user", label: "Profile", description: "Settings and preferences", route: "/profile", color: "#8B5CF6" },
];

export default function MoreScreen() {
  const theme = useAppTheme();
  const totalRoutes = menuItems.length;

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
            <Badge label="Fast actions" />
          </XStack>
        </Card>
      </Animated.View>

        <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
          {menuItems.map((item, i) => (
            <Animated.View key={item.route} entering={FadeInUp.delay(i * 60).duration(400)}>
              <PressableScale
                onPress={() => router.push(item.route as never)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  padding: 16,
                  borderRadius: 22,
                  borderWidth: 1,
                  gap: 14,
                  backgroundColor: theme.card.val,
                  borderColor: theme.borderColor.val,
                  shadowColor: "#000",
                  shadowOpacity: 0.05,
                  shadowRadius: 12,
                  shadowOffset: { width: 0, height: 8 },
                }}
              >
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
              </PressableScale>
            </Animated.View>
          ))}
          <YStack height={100} />
        </ScrollView>
      </YStack>
    </SafeAreaView>
  );
}
