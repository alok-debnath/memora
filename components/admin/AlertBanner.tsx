import React from "react";
import { XStack, YStack, Text } from "tamagui";

import { Feather } from "@/lib/icons";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useSemanticColors } from "@/hooks/useSemanticColors";
import { withAlpha } from "@/components/ui/themeHelpers";

export type OperationalAlert = {
  key: string;
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  updatedAt: number;
};

/** Colored operational alert row (systemAlerts + anomaly strips). Icon + label, never color alone. */
export function AlertBanner({ alert }: { alert: OperationalAlert }) {
  const theme = useAppTheme();
  const semantic = useSemanticColors();
  const color =
    alert.severity === "critical"
      ? semantic.status.error
      : alert.severity === "warning"
        ? semantic.status.warning
        : semantic.status.info;
  const icon =
    alert.severity === "critical"
      ? ("alert-octagon" as const)
      : alert.severity === "warning"
        ? ("alert-triangle" as const)
        : ("info" as const);

  return (
    <XStack
      alignItems="flex-start"
      gap={10}
      padding={12}
      borderRadius={14}
      backgroundColor={withAlpha(color, "10")}
      borderWidth={1}
      borderColor={withAlpha(color, "28")}
    >
      <Feather name={icon} size={15} color={color} style={{ marginTop: 1 }} />
      <YStack flex={1} gap={2}>
        <XStack alignItems="center" justifyContent="space-between" gap={8}>
          <Text fontSize={13} fontFamily="$body" fontWeight="700" color={theme.color.val}>
            {alert.title}
          </Text>
          <Text
            fontSize={10}
            fontFamily="$body"
            fontWeight="700"
            color={color}
            textTransform="uppercase"
          >
            {alert.severity}
          </Text>
        </XStack>
        <Text fontSize={12} fontFamily="$body" lineHeight={17} color={theme.colorMuted.val}>
          {alert.message}
        </Text>
        <Text fontSize={10} fontFamily="$body" color={theme.colorMuted.val}>
          {new Date(alert.updatedAt).toLocaleString()}
        </Text>
      </YStack>
    </XStack>
  );
}
