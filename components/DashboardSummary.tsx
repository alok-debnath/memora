import React from "react";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeInUp } from "react-native-reanimated";
import { XStack, YStack, Text } from "tamagui";
import { Card } from "./ui/Card";
import { useAppTheme } from "@/hooks/useAppTheme";

interface StatCardProps {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: number;
  color: string;
  index: number;
}

function StatCard({ icon, label, value, color, index }: StatCardProps) {
  const theme = useAppTheme();

  return (
    <Animated.View entering={FadeInUp.delay(100 + index * 80).duration(400)} style={{ flex: 1 }}>
      <Card
        style={{
          alignItems: "center",
          paddingVertical: 16,
          paddingHorizontal: 12,
          borderRadius: 20,
          backgroundColor: theme.card.val,
        }}
      >
        <YStack
          width={40}
          height={40}
          borderRadius={12}
          backgroundColor={color + "18"}
          alignItems="center"
          justifyContent="center"
          marginBottom={8}
        >
          <Feather name={icon} size={19} color={color} />
        </YStack>
        <Text fontSize={22} fontFamily="$heading" fontWeight="700" color="$color" marginBottom={2}>
          {value}
        </Text>
        <Text fontSize={11} fontFamily="$body" fontWeight="600" color="$colorMuted">
          {label}
        </Text>
      </Card>
    </Animated.View>
  );
}

interface DashboardSummaryProps {
  totalMemories: number;
  totalReminders: number;
  categories: number;
}

export function DashboardSummary({ totalMemories, totalReminders, categories }: DashboardSummaryProps) {
  return (
    <XStack gap={10} paddingHorizontal={16}>
      <StatCard icon="layers" label="Memories" value={totalMemories} color="#3B82F6" index={0} />
      <StatCard icon="bell" label="Reminders" value={totalReminders} color="#F59E0B" index={1} />
      <StatCard icon="folder" label="Categories" value={categories} color="#10B981" index={2} />
    </XStack>
  );
}
