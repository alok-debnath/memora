import React from "react";
import { useMutation, useQuery } from "convex/react";
import { XStack, YStack } from "tamagui";

import { api } from "@/convex/_generated/api";
import { AppButton } from "@/components/ui/AppButton";
import { useAppConfirm } from "@/components/ui/confirm/AppConfirmProvider";
import { useAppToast } from "@/components/ui/toast";
import { useAdminState } from "@/components/admin/AdminStateContext";
import { AdminStatTile } from "@/components/admin/AdminStatTile";
import {
  AdminDataRow,
  AdminEmptyState,
  AdminLoadingState,
  AdminMetricGrid,
  AdminPanel,
  AdminSectionHeader,
} from "@/components/admin/AdminWorkspace";
import { formatCompactNumber, formatUsdMicros } from "@/components/admin/charts/palette";

export default function AdminAiOpsScreen() {
  const { showToast } = useAppToast();
  const { confirm } = useAppConfirm();
  const { range, refreshKey, setSelectedEntity } = useAdminState();
  const data = useQuery(api.admin.aiOpsOverview, { range, refreshKey });
  const setRouting = useMutation(api.aiProviders.setAdminRouting);

  if (!data) return <AdminLoadingState label="Loading AI operations" />;

  const requests = data.providers.reduce((sum, row) => sum + row.requests, 0);
  const errors = data.providers.reduce((sum, row) => sum + row.errors, 0);
  const cost = data.providers.reduce((sum, row) => sum + row.costUsdMicros, 0);
  const failureRate = requests > 0 ? errors / requests : 0;

  return (
    <YStack gap={12}>
      <AdminMetricGrid>
        <AdminStatTile
          label="AI requests"
          value={formatCompactNumber(requests)}
          hint={`${formatCompactNumber(errors)} failed`}
        />
        <AdminStatTile
          label="Failure rate"
          value={`${(failureRate * 100).toFixed(2)}%`}
          goodWhenDown
        />
        <AdminStatTile label="AI cost" value={formatUsdMicros(cost)} />
        <AdminStatTile
          label="Active routes"
          value={String(data.routing.filter((route) => route.enabled).length)}
        />
      </AdminMetricGrid>

      <XStack gap={12} flexWrap="wrap" alignItems="flex-start">
        <YStack flex={1} minWidth={280}>
          <AdminPanel padding={0}>
            <YStack padding={14}>
              <AdminSectionHeader title="Providers" detail="Reliability, latency, and cost" />
            </YStack>
            {data.providers.length === 0 ? (
              <AdminEmptyState title="No provider traffic" />
            ) : (
              data.providers.map((row) => (
                <AdminDataRow
                  key={row.key}
                  title={row.key}
                  subtitle={`${formatCompactNumber(row.requests)} requests`}
                  metrics={[
                    { label: "Latency", value: `${Math.round(row.avgLatencyMs)}ms` },
                    { label: "Cost", value: formatUsdMicros(row.costUsdMicros) },
                    {
                      label: "Failure",
                      value: `${(row.failureRate * 100).toFixed(2)}%`,
                      tone: row.failureRate > 0.08 ? "danger" : "default",
                    },
                  ]}
                  action={
                    <AppButton
                      title="Inspect"
                      size="sm"
                      variant="ghost"
                      onPress={() => setSelectedEntity({ type: "provider", id: row.key })}
                    />
                  }
                />
              ))
            )}
          </AdminPanel>
        </YStack>

        <YStack flex={1} minWidth={280}>
          <AdminPanel padding={0}>
            <YStack padding={14}>
              <AdminSectionHeader title="Models" detail="Highest-volume routes" />
            </YStack>
            {data.topModels.length === 0 ? (
              <AdminEmptyState title="No model traffic" />
            ) : (
              data.topModels.slice(0, 10).map((row) => (
                <AdminDataRow
                  key={`${row.provider}:${row.model}`}
                  title={row.model}
                  subtitle={`${row.provider} · ${formatCompactNumber(row.requests)} calls`}
                  metrics={[
                    { label: "Cost", value: formatUsdMicros(row.costUsdMicros) },
                    {
                      label: "Failure",
                      value: `${(row.failureRate * 100).toFixed(1)}%`,
                      tone: row.failureRate > 0.08 ? "danger" : "default",
                    },
                  ]}
                  action={
                    <AppButton
                      title="Inspect"
                      size="sm"
                      variant="ghost"
                      onPress={() =>
                        setSelectedEntity({ type: "model", id: `${row.provider}:${row.model}` })
                      }
                    />
                  }
                />
              ))
            )}
          </AdminPanel>
        </YStack>
      </XStack>

      <AdminPanel padding={0}>
        <YStack padding={14}>
          <AdminSectionHeader
            title="Routing controls"
            detail="Disabling a route requires confirmation"
          />
        </YStack>
        {data.routing.map((route) => (
          <AdminDataRow
            key={route.capability}
            title={route.capability}
            subtitle={`${route.provider} / ${route.model}${route.fallbackEnabled && route.fallbackProvider && route.fallbackModel ? ` · fallback ${route.fallbackProvider}/${route.fallbackModel}` : ""}`}
            metrics={[
              {
                label: "Status",
                value: route.enabled ? "Enabled" : "Disabled",
                tone: route.enabled ? "default" : "danger",
              },
            ]}
            action={
              <AppButton
                title={route.enabled ? "Disable" : "Enable"}
                size="sm"
                variant={route.enabled ? "danger" : "primary"}
                onPress={async () => {
                  if (route.enabled) {
                    const accepted = await confirm({
                      title: `Disable ${route.capability} routing?`,
                      message:
                        "Requests for this capability will stop using this route until it is enabled again.",
                      confirmLabel: "Disable routing",
                      tone: "destructive",
                      icon: "slash",
                    });
                    if (!accepted) return;
                  }
                  await setRouting({
                    capability: route.capability as any,
                    provider: route.provider as any,
                    model: route.model,
                    enabled: !route.enabled,
                    fallbackProvider: route.fallbackProvider as any,
                    fallbackModel: route.fallbackModel,
                    fallbackEnabled: route.fallbackEnabled,
                  });
                  showToast({
                    title: `Routing ${route.enabled ? "disabled" : "enabled"}`,
                    message: route.capability,
                    tone: "success",
                  });
                }}
              />
            }
          />
        ))}
      </AdminPanel>
    </YStack>
  );
}
