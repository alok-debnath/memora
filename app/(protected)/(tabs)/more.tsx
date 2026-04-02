import React from "react";
import { ScrollView, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import Animated, { FadeInUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { XStack, YStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import { PressableScale } from "@/components/ui/PressableScale";

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
  { icon: "user", label: "Profile", description: "Settings and preferences", route: "/profile", color: "#8B5CF6" },
];

export default function MoreScreen() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const webTopPadding = Platform.OS === "web" ? 67 : 0;

  return (
    <YStack
      flex={1}
      backgroundColor="$background"
      paddingHorizontal={16}
      paddingTop={insets.top + webTopPadding + 16}
    >
      <Text fontSize={26} fontFamily="$body" fontWeight="700" color="$color" marginBottom={20}>
        More
      </Text>

      <ScrollView contentContainerStyle={{ gap: 10 }} showsVerticalScrollIndicator={false}>
        {menuItems.map((item, i) => (
          <Animated.View key={item.route} entering={FadeInUp.delay(i * 60).duration(400)}>
            <PressableScale
              onPress={() => (router.navigate as (href: string) => void)(item.route)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                padding: 16,
                borderRadius: 16,
                borderWidth: 0.5,
                gap: 14,
                backgroundColor: theme.card.val,
                borderColor: theme.borderColor.val,
              }}
            >
              <YStack
                width={44}
                height={44}
                borderRadius={12}
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
  );
}
