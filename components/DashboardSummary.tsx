import React from "react";
import { Feather, type FeatherIconName } from "@/lib/icons";
import { XStack, YStack, Text } from "tamagui";
import { Card } from "./ui/Card";
import { useAppTheme } from "@/hooks/useAppTheme";
import { statAccentColors } from "@/constants/colors";

interface StatCardProps {
  icon: FeatherIconName;
  label: string;
  value: number;
  color: string;
  index: number;
}

function StatCard({ icon, label, value, color }: StatCardProps) {
  const theme = useAppTheme();

  return (
    <YStack flex={1}>
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
    </YStack>
  );
}

interface DashboardSummaryProps {
  totalMemories: number;
  totalReminders: number;
  categories: number;
}

export function DashboardSummary({
  totalMemories,
  totalReminders,
  categories,
}: DashboardSummaryProps) {
  return (
    <XStack gap={10} paddingHorizontal={16}>
      <StatCard
        icon="layers"
        label="Memories"
        value={totalMemories}
        color={statAccentColors.memories}
        index={0}
      />
      <StatCard
        icon="bell"
        label="Reminders"
        value={totalReminders}
        color={statAccentColors.reminders}
        index={1}
      />
      <StatCard
        icon="folder"
        label="Categories"
        value={categories}
        color={statAccentColors.categories}
        index={2}
      />
    </XStack>
  );
}
