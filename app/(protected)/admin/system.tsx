import React from "react";
import { useMutation, useQuery } from "convex/react";
import { XStack, YStack } from "tamagui";

import { api } from "@/convex/_generated/api";
import { AppButton } from "@/components/ui/AppButton";
import { useAppToast } from "@/components/ui/toast";
import { useAdminState } from "@/components/admin/AdminStateContext";
import { AdminStatTile } from "@/components/admin/AdminStatTile";
import { AlertBanner } from "@/components/admin/AlertBanner";
import {
  AdminDataRow,
  AdminEmptyState,
  AdminLoadingState,
  AdminMetricGrid,
  AdminPanel,
  AdminSectionHeader,
} from "@/components/admin/AdminWorkspace";
import { formatCompactNumber } from "@/components/admin/charts/palette";

export default function AdminSystemScreen() {
  const { showToast } = useAppToast();
  const { range, refreshKey, setSelectedEntity } = useAdminState();
  const health = useQuery(api.admin.systemHealth, { range, refreshKey });
  const incidents = useQuery(api.admin.listAlertIncidents, {
    status: "open",
    paginationOpts: { numItems: 20, cursor: null },
    refreshKey,
  });
  const rules = useQuery(api.admin.listAlertRules, {});
  const evaluateRules = useMutation(api.admin.evaluateAlertRules);
  const upsertAlertRule = useMutation(api.admin.upsertAlertRule);
  const setIncidentStatus = useMutation(api.admin.setIncidentStatus);
  const runMaintenanceJob = useMutation(api.admin.runMaintenanceJob);

  if (!health) return <AdminLoadingState label="Loading system health" />;

  return (
    <YStack gap={12}>
      <AdminMetricGrid>
        <AdminStatTile
          label="AI failure rate"
          value={`${(health.snapshot.aiFailureRate * 100).toFixed(2)}%`}
          goodWhenDown
        />
        <AdminStatTile
          label="Search latency"
          value={`${Math.round(health.snapshot.avgSearchLatencyMs)}ms`}
          goodWhenDown
        />
        <AdminStatTile
          label="Embedding rebuilds"
          value={formatCompactNumber(health.embeddingRebuilds.active)}
        />
        <AdminStatTile
          label="Open incidents"
          value={formatCompactNumber(incidents?.page.length ?? 0)}
        />
      </AdminMetricGrid>

      {health.systemAlerts.length > 0 ? (
        <AdminPanel>
          <YStack gap={10}>
            <AdminSectionHeader title="Health signals" detail="Current platform-generated alerts" />
            {health.systemAlerts.map((alert) => (
              <AlertBanner key={alert.key} alert={alert} />
            ))}
          </YStack>
        </AdminPanel>
      ) : null}

      <AdminPanel padding={0}>
        <YStack padding={14}>
          <AdminSectionHeader
            title="Active incidents"
            detail="Open threshold breaches ordered by recency"
          />
        </YStack>
        {(incidents?.page ?? []).length === 0 ? (
          <AdminEmptyState
            title="No open incidents"
            detail="All monitored thresholds are within their acknowledged state."
            icon="check-circle"
          />
        ) : (
          incidents?.page.map((incident) => (
            <AdminDataRow
              key={incident._id}
              title={incident.ruleKey}
              subtitle={`${incident.metricKey} breached its configured threshold`}
              metrics={[
                { label: "Observed", value: incident.value.toFixed(3), tone: "danger" },
                { label: "Threshold", value: String(incident.threshold) },
              ]}
              action={
                <AppButton
                  title="Acknowledge"
                  size="sm"
                  variant="secondary"
                  onPress={async () => {
                    setSelectedEntity({ type: "incident", id: String(incident._id) });
                    await setIncidentStatus({ incidentId: incident._id, status: "acknowledged" });
                    showToast({ title: "Incident acknowledged", tone: "success" });
                  }}
                />
              }
            />
          ))
        )}
      </AdminPanel>

      <AdminPanel padding={0}>
        <YStack padding={14} gap={10}>
          <AdminSectionHeader
            title="Alert rules"
            detail="Enabled operational thresholds"
            action={
              <XStack gap={6} flexWrap="wrap">
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
                  title="Add failure rule"
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
            }
          />
        </YStack>
        {(rules ?? []).length === 0 ? (
          <AdminEmptyState title="No alert rules" />
        ) : (
          rules?.map((rule) => (
            <AdminDataRow
              key={rule.key}
              title={rule.title}
              subtitle={rule.description}
              metrics={[
                { label: "Metric", value: rule.metricKey },
                { label: "Condition", value: `${rule.comparison} ${rule.threshold}` },
                {
                  label: "Severity",
                  value: rule.severity,
                  tone: rule.severity === "critical" ? "danger" : "default",
                },
              ]}
            />
          ))
        )}
      </AdminPanel>

      <AdminPanel padding={0}>
        <YStack padding={14}>
          <AdminSectionHeader
            title="Maintenance actions"
            detail="Non-destructive background jobs"
          />
        </YStack>
        {health.jobs.map((job) => (
          <AdminDataRow
            key={job.key}
            title={job.title}
            subtitle={job.detail}
            action={
              <AppButton
                title="Run"
                size="sm"
                variant="secondary"
                onPress={async () => {
                  await runMaintenanceJob({ job: job.key as any });
                  showToast({ title: "Job queued", message: job.title, tone: "success" });
                }}
              />
            }
          />
        ))}
      </AdminPanel>
    </YStack>
  );
}
