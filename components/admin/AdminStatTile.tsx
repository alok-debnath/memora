import React from "react";
import { XStack, YStack, Text } from "tamagui";

import { Feather } from "@/lib/icons";
import { Card } from "@/components/ui/Card";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useSemanticColors } from "@/hooks/useSemanticColors";

/**
 * KPI tile: label, headline value, optional delta vs the previous period.
 * Delta color follows direction semantics (goodWhenDown for failure-rate
 * style metrics).
 */
export function AdminStatTile({
  label,
  value,
  hint,
  deltaPct,
  goodWhenDown = false,
}: {
  label: string;
  value: string;
  hint?: string;
  /** Fractional change vs previous period, e.g. 0.12 = +12%. */
  deltaPct?: number;
  goodWhenDown?: boolean;
}) {
  const theme = useAppTheme();
  const semantic = useSemanticColors();

  const hasDelta = typeof deltaPct === "number" && Number.isFinite(deltaPct) && deltaPct !== 0;
  const isUp = (deltaPct ?? 0) > 0;
  const isGood = goodWhenDown ? !isUp : isUp;

  return (
    <Card style={{ borderRadius: 16, flex: 1, minWidth: 150 }}>
      <Text fontSize={12} fontFamily="$body" color={theme.colorMuted.val}>
        {label}
      </Text>
      <Text
        marginTop={4}
        fontSize={24}
        fontFamily="$heading"
        fontWeight="700"
        color={theme.color.val}
      >
        {value}
      </Text>
      <XStack marginTop={2} alignItems="center" gap={6}>
        {hasDelta ? (
          <XStack alignItems="center" gap={2}>
            <Feather
              name={isUp ? "arrow-up-right" : "arrow-down-right"}
              size={11}
              color={isGood ? semantic.status.success : semantic.status.error}
            />
            <Text
              fontSize={11}
              fontFamily="$body"
              fontWeight="700"
              color={isGood ? semantic.status.success : semantic.status.error}
            >
              {Math.abs(deltaPct * 100).toFixed(1)}%
            </Text>
          </XStack>
        ) : null}
        {hint ? (
          <Text fontSize={11} fontFamily="$body" color={theme.colorMuted.val}>
            {hint}
          </Text>
        ) : null}
      </XStack>
    </Card>
  );
}
