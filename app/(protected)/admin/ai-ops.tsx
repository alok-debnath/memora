import React from "react";
import { ActivityIndicator } from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";
import { useMutation, useQuery } from "convex/react";
import { Text, XStack, YStack } from "tamagui";

import { api } from "@/convex/_generated/api";
import { Card } from "@/components/ui/Card";
import { AppButton } from "@/components/ui/AppButton";
import { PressableScale } from "@/components/ui/PressableScale";
import { useAppToast } from "@/components/ui/toast";
import { useAdminState } from "@/components/admin/AdminStateContext";
import { integrationAccentColors, statusAccentColors } from "@/constants/colors";

function formatCompact(value: number) {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(
    value,
  );
}

function formatUsdMicros(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value / 1_000_000);
}

function getDynamicColumnWidth(
  values: string[],
  options: { min: number; max: number; perChar: number },
) {
  const longest = values.reduce((current, item) => Math.max(current, item.length), 0);
  return Math.min(options.max, Math.max(options.min, longest * options.perChar + 14));
}

const TABLE_GAP = 8;
const PROVIDER_PRIMARY_MAX_WIDTH = 88;
const MODEL_PRIMARY_MAX_WIDTH = 98;

export default function AdminAiOpsScreen() {
  const { showToast } = useAppToast();
  const { range, refreshKey, setSelectedEntity } = useAdminState();

  const data = useQuery(api.admin.aiOpsOverview, { range, refreshKey });
  const setRouting = useMutation(api.aiProviders.setAdminRouting);
  const providerRows = data?.providers ?? [];
  const modelRows = data?.topModels ?? [];

  const providerCostColumnWidth = React.useMemo(
    () =>
      getDynamicColumnWidth(
        ["Cost", ...providerRows.map((row: any) => formatUsdMicros(row.costUsdMicros))],
        { min: 56, max: 86, perChar: 7.2 },
      ),
    [providerRows],
  );
  const providerFailureColumnWidth = React.useMemo(
    () =>
      getDynamicColumnWidth(
        ["Failure", ...providerRows.map((row: any) => `${(row.failureRate * 100).toFixed(2)}%`)],
        { min: 62, max: 96, perChar: 7.2 },
      ),
    [providerRows],
  );
  const providerActionColumnWidth = React.useMemo(
    () =>
      getDynamicColumnWidth(["Action", ...providerRows.map(() => "Inspect")], {
        min: 60,
        max: 78,
        perChar: 6.8,
      }),
    [providerRows],
  );

  const modelCostColumnWidth = React.useMemo(
    () =>
      getDynamicColumnWidth(
        ["Cost", ...modelRows.map((row: any) => formatUsdMicros(row.costUsdMicros))],
        { min: 56, max: 86, perChar: 7.2 },
      ),
    [modelRows],
  );
  const modelFailureColumnWidth = React.useMemo(
    () =>
      getDynamicColumnWidth(
        ["Failure", ...modelRows.map((row: any) => `${(row.failureRate * 100).toFixed(1)}% fail`)],
        { min: 66, max: 102, perChar: 7.2 },
      ),
    [modelRows],
  );
  const modelActionColumnWidth = React.useMemo(
    () =>
      getDynamicColumnWidth(["Action", ...modelRows.map(() => "Inspect")], {
        min: 60,
        max: 78,
        perChar: 6.8,
      }),
    [modelRows],
  );

  if (!data) {
    return (
      <YStack alignItems="center" paddingVertical={40}>
        <ActivityIndicator color={integrationAccentColors.openai} />
      </YStack>
    );
  }

  return (
    <>
      <Animated.View entering={FadeInUp.duration(260)}>
        <XStack gap={10} flexWrap="wrap">
          <Card style={{ borderRadius: 24, flex: 1, minWidth: 260 }}>
            <YStack gap={10}>
              <Text fontSize={16} fontFamily="$heading" fontWeight="700" color="$color">
                Provider Reliability
              </Text>
              <YStack gap={10}>
                <XStack alignItems="center" gap={TABLE_GAP}>
                  <YStack
                    flexGrow={1}
                    flexShrink={1}
                    flexBasis={0}
                    maxWidth={PROVIDER_PRIMARY_MAX_WIDTH}
                    minWidth={0}
                  >
                    <Text fontSize={11} fontWeight="700" color="$colorMuted">
                      Provider
                    </Text>
                  </YStack>
                  <YStack width={providerCostColumnWidth} alignItems="flex-end">
                    <Text fontSize={11} fontWeight="700" color="$colorMuted">
                      Cost
                    </Text>
                  </YStack>
                  <YStack width={providerFailureColumnWidth} alignItems="flex-end">
                    <Text fontSize={11} fontWeight="700" color="$colorMuted">
                      Failure
                    </Text>
                  </YStack>
                  <YStack width={providerActionColumnWidth} alignItems="center">
                    <Text fontSize={11} fontWeight="700" color="$colorMuted">
                      Action
                    </Text>
                  </YStack>
                </XStack>
                {data.providers.map((row: any) => (
                  <XStack key={row.key} alignItems="center" gap={TABLE_GAP}>
                    <YStack
                      flexGrow={1}
                      flexShrink={1}
                      flexBasis={0}
                      maxWidth={PROVIDER_PRIMARY_MAX_WIDTH}
                      minWidth={0}
                    >
                      <Text fontSize={13} fontWeight="700" color="$color">
                        {row.key}
                      </Text>
                      <Text fontSize={11} color="$colorMuted">
                        {formatCompact(row.requests)} calls · {Math.round(row.avgLatencyMs)}ms avg
                      </Text>
                    </YStack>
                    <YStack width={providerCostColumnWidth} alignItems="flex-end">
                      <Text fontSize={12} fontWeight="700" color="$color">
                        {formatUsdMicros(row.costUsdMicros)}
                      </Text>
                    </YStack>
                    <YStack width={providerFailureColumnWidth} alignItems="flex-end">
                      <Text
                        fontSize={12}
                        fontWeight="700"
                        color={
                          row.failureRate > 0.08
                            ? statusAccentColors.error
                            : statusAccentColors.success
                        }
                      >
                        {(row.failureRate * 100).toFixed(2)}%
                      </Text>
                    </YStack>
                    <YStack width={providerActionColumnWidth} alignItems="center">
                      <PressableScale
                        onPress={() => setSelectedEntity({ type: "provider", id: row.key })}
                      >
                        <Text
                          fontSize={13}
                          lineHeight={16}
                          color={statusAccentColors.warningStrong}
                          fontFamily="$body"
                          fontWeight="700"
                        >
                          Inspect
                        </Text>
                      </PressableScale>
                    </YStack>
                  </XStack>
                ))}
              </YStack>
            </YStack>
          </Card>

          <Card style={{ borderRadius: 24, flex: 1, minWidth: 260 }}>
            <YStack gap={10}>
              <Text fontSize={16} fontFamily="$heading" fontWeight="700" color="$color">
                Top Models
              </Text>
              <YStack gap={10}>
                <XStack alignItems="center" gap={TABLE_GAP}>
                  <YStack
                    flexGrow={1}
                    flexShrink={1}
                    flexBasis={0}
                    maxWidth={MODEL_PRIMARY_MAX_WIDTH}
                    minWidth={0}
                  >
                    <Text fontSize={11} fontWeight="700" color="$colorMuted">
                      Model
                    </Text>
                  </YStack>
                  <YStack width={modelCostColumnWidth} alignItems="flex-end">
                    <Text fontSize={11} fontWeight="700" color="$colorMuted">
                      Cost
                    </Text>
                  </YStack>
                  <YStack width={modelFailureColumnWidth} alignItems="flex-end">
                    <Text fontSize={11} fontWeight="700" color="$colorMuted">
                      Failure
                    </Text>
                  </YStack>
                  <YStack width={modelActionColumnWidth} alignItems="center">
                    <Text fontSize={11} fontWeight="700" color="$colorMuted">
                      Action
                    </Text>
                  </YStack>
                </XStack>
                {data.topModels.slice(0, 10).map((row: any) => (
                  <XStack key={`${row.provider}:${row.model}`} alignItems="center" gap={TABLE_GAP}>
                    <YStack
                      flexGrow={1}
                      flexShrink={1}
                      flexBasis={0}
                      maxWidth={MODEL_PRIMARY_MAX_WIDTH}
                      minWidth={0}
                    >
                      <Text fontSize={13} fontWeight="700" color="$color">
                        {row.model}
                      </Text>
                      <Text fontSize={11} color="$colorMuted">
                        {row.provider} · {formatCompact(row.requests)} calls
                      </Text>
                    </YStack>
                    <YStack width={modelCostColumnWidth} alignItems="flex-end">
                      <Text fontSize={12} fontWeight="700" color="$color">
                        {formatUsdMicros(row.costUsdMicros)}
                      </Text>
                    </YStack>
                    <YStack width={modelFailureColumnWidth} alignItems="flex-end">
                      <Text fontSize={11} color="$colorMuted">
                        {(row.failureRate * 100).toFixed(1)}% fail
                      </Text>
                    </YStack>
                    <YStack width={modelActionColumnWidth} alignItems="center">
                      <PressableScale
                        onPress={() =>
                          setSelectedEntity({ type: "model", id: `${row.provider}:${row.model}` })
                        }
                      >
                        <Text
                          fontSize={13}
                          lineHeight={16}
                          color={statusAccentColors.warningStrong}
                          fontFamily="$body"
                          fontWeight="700"
                        >
                          Inspect
                        </Text>
                      </PressableScale>
                    </YStack>
                  </XStack>
                ))}
              </YStack>
            </YStack>
          </Card>
        </XStack>
      </Animated.View>

      <Card style={{ borderRadius: 24 }}>
        <YStack gap={10}>
          <Text fontSize={16} fontFamily="$heading" fontWeight="700" color="$color">
            Routing Controls
          </Text>
          {data.routing.map((route: any) => (
            <XStack
              key={route.capability}
              alignItems="center"
              justifyContent="space-between"
              gap={8}
            >
              <YStack flex={1}>
                <Text fontSize={13} fontWeight="700" color="$color">
                  {route.capability}
                </Text>
                <Text fontSize={11} color="$colorMuted">
                  {route.provider} / {route.model}
                  {route.fallbackEnabled && route.fallbackProvider && route.fallbackModel
                    ? ` · fallback ${route.fallbackProvider}/${route.fallbackModel}`
                    : ""}
                </Text>
              </YStack>
              <AppButton
                title={route.enabled ? "Disable" : "Enable"}
                size="sm"
                variant={route.enabled ? "secondary" : "primary"}
                onPress={async () => {
                  await setRouting({
                    capability: route.capability,
                    provider: route.provider,
                    model: route.model,
                    enabled: !route.enabled,
                    fallbackProvider: route.fallbackProvider,
                    fallbackModel: route.fallbackModel,
                    fallbackEnabled: route.fallbackEnabled,
                  });
                  showToast({
                    title: `Routing ${!route.enabled ? "enabled" : "disabled"}`,
                    message: `${route.capability}`,
                    tone: "success",
                  });
                }}
              />
            </XStack>
          ))}
        </YStack>
      </Card>
    </>
  );
}
