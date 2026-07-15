import React from "react";
import { ActivityIndicator } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { Text, XStack, YStack } from "tamagui";

import { api } from "@/convex/_generated/api";
import { Card } from "@/components/ui/Card";
import { AppButton } from "@/components/ui/AppButton";
import { Badge } from "@/components/ui/Badge";
import { useAppToast } from "@/components/ui/toast";
import { useAdminState } from "@/components/admin/AdminStateContext";
import { AlertBanner } from "@/components/admin/AlertBanner";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useSemanticColors } from "@/hooks/useSemanticColors";

function formatCompact(value: number) {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(
    value,
  );
}

export default function AdminSystemScreen() {
  const theme = useAppTheme();
  const semantic = useSemanticColors();
  const { showToast } = useAppToast();
  const { range, setSelectedEntity } = useAdminState();

  const health = useQuery(api.admin.systemHealth, { range });
  const incidents = useQuery(api.admin.listAlertIncidents, {
    status: "open",
    paginationOpts: { numItems: 20, cursor: null },
  });
  const rules = useQuery(api.admin.listAlertRules, {});

  const evaluateRules = useMutation(api.admin.evaluateAlertRules);
  const upsertAlertRule = useMutation(api.admin.upsertAlertRule);
  const setIncidentStatus = useMutation(api.admin.setIncidentStatus);
  const runMaintenanceJob = useMutation(api.admin.runMaintenanceJob);

  if (!health) {
    return (
      <YStack alignItems="center" paddingVertical={40}>
        <ActivityIndicator color={semantic.status.info} />
      </YStack>
    );
  }

  return (
    <>
      <YStack>
        <XStack gap={10} flexWrap="wrap">
          <Card style={{ borderRadius: 16, flex: 1, minWidth: 220 }}>
            <YStack gap={5}>
              <Text fontSize={12} color={theme.colorMuted.val}>
                AI failure rate
              </Text>
              <Text fontSize={24} fontFamily="$heading" fontWeight="700" color={theme.color.val}>
                {(health.snapshot.aiFailureRate * 100).toFixed(2)}%
              </Text>
            </YStack>
          </Card>
          <Card style={{ borderRadius: 16, flex: 1, minWidth: 220 }}>
            <YStack gap={5}>
              <Text fontSize={12} color={theme.colorMuted.val}>
                Search latency
              </Text>
              <Text fontSize={24} fontFamily="$heading" fontWeight="700" color={theme.color.val}>
                {Math.round(health.snapshot.avgSearchLatencyMs)}ms
              </Text>
            </YStack>
          </Card>
          <Card style={{ borderRadius: 16, flex: 1, minWidth: 220 }}>
            <YStack gap={5}>
              <Text fontSize={12} color={theme.colorMuted.val}>
                Active embedding rebuilds
              </Text>
              <Text fontSize={24} fontFamily="$heading" fontWeight="700" color={theme.color.val}>
                {formatCompact(health.embeddingRebuilds.active)}
              </Text>
            </YStack>
          </Card>
        </XStack>
      </YStack>

      {(health.systemAlerts ?? []).length > 0 ? (
        <Card style={{ borderRadius: 16 }}>
          <YStack gap={10}>
            <Text fontSize={16} fontFamily="$heading" fontWeight="700" color={theme.color.val}>
              Operational Alerts
            </Text>
            {health.systemAlerts.map((alert) => (
              <AlertBanner
                key={alert.key}
                alert={{
                  key: alert.key,
                  severity: alert.severity,
                  title: alert.title,
                  message: alert.message,
                  updatedAt: alert.updatedAt,
                }}
              />
            ))}
          </YStack>
        </Card>
      ) : null}

      <Card style={{ borderRadius: 16 }}>
        <YStack gap={10}>
          <Text fontSize={16} fontFamily="$heading" fontWeight="700" color={theme.color.val}>
            Alert Rules
          </Text>
          <XStack gap={8} flexWrap="wrap">
            <AppButton
              title="Evaluate now"
              size="sm"
              onPress={async () => {
                const result = await evaluateRules({ range });
                showToast({
                  title: "Evaluation complete",
                  message: `${result.triggered} rules triggered`,
                  tone: "success",
                });
              }}
            />
            <AppButton
              title="Add failure-rate rule"
              size="sm"
              variant="secondary"
              onPress={async () => {
                await upsertAlertRule({
                  key: "ai_failure_rate_warning",
                  title: "AI failure rate warning",
                  description: "Triggers when AI failures are too high.",
                  metricKey: "ai_failure_rate",
                  comparison: "gt",
                  threshold: 0.08,
                  severity: "warning",
                  enabled: true,
                });
                showToast({ title: "Rule saved", tone: "success" });
              }}
            />
          </XStack>
          <YStack gap={8}>
            {(rules ?? []).map((rule: any) => (
              <XStack key={rule.key} alignItems="center" justifyContent="space-between">
                <YStack>
                  <Text fontSize={13} fontWeight="700" color={theme.color.val}>
                    {rule.title}
                  </Text>
                  <Text fontSize={11} color={theme.colorMuted.val}>
                    {rule.metricKey} {rule.comparison} {rule.threshold}
                  </Text>
                </YStack>
                <Badge label={rule.severity} color={semantic.status.warning} />
              </XStack>
            ))}
          </YStack>
        </YStack>
      </Card>

      <Card style={{ borderRadius: 16 }}>
        <YStack gap={10}>
          <Text fontSize={16} fontFamily="$heading" fontWeight="700" color={theme.color.val}>
            Open Incidents
          </Text>
          {(incidents?.page ?? []).length === 0 ? (
            <Text fontSize={13} color={theme.colorMuted.val}>
              No open incidents.
            </Text>
          ) : (
            (incidents?.page ?? []).map((incident: any) => (
              <XStack key={incident._id} alignItems="center" justifyContent="space-between" gap={8}>
                <YStack flex={1}>
                  <Text fontSize={13} fontWeight="700" color={theme.color.val}>
                    {incident.ruleKey}
                  </Text>
                  <Text fontSize={11} color={theme.colorMuted.val}>
                    {incident.metricKey}: {incident.value.toFixed(3)} threshold {incident.threshold}
                  </Text>
                </YStack>
                <AppButton
                  title="Acknowledge"
                  size="sm"
                  variant="ghost"
                  onPress={async () => {
                    setSelectedEntity({ type: "incident", id: String(incident._id) });
                    await setIncidentStatus({ incidentId: incident._id, status: "acknowledged" });
                    showToast({ title: "Incident updated", tone: "success" });
                  }}
                />
              </XStack>
            ))
          )}
        </YStack>
      </Card>

      <Card style={{ borderRadius: 16 }}>
        <YStack gap={10}>
          <Text fontSize={16} fontFamily="$heading" fontWeight="700" color={theme.color.val}>
            Maintenance Jobs
          </Text>
          {health.jobs.map((job: any) => (
            <XStack key={job.key} alignItems="center" justifyContent="space-between" gap={8}>
              <YStack flex={1}>
                <Text fontSize={13} fontWeight="700" color={theme.color.val}>
                  {job.title}
                </Text>
                <Text fontSize={11} color={theme.colorMuted.val}>
                  {job.detail}
                </Text>
              </YStack>
              <AppButton
                title="Run"
                size="sm"
                onPress={async () => {
                  await runMaintenanceJob({ job: job.key as any });
                  showToast({ title: "Job queued", message: job.title, tone: "success" });
                }}
              />
            </XStack>
          ))}
        </YStack>
      </Card>
    </>
  );
}
