/* Hallmark · genre: technical-editorial · macrostructure: Workbench · designed-as-app */
import React from "react";
import { ScrollView, StyleSheet } from "react-native";
import { usePathname } from "expo-router";
import { Text, XStack, YStack } from "tamagui";

import { Feather } from "@/lib/icons";
import { appRouter as router } from "@/lib/appRouter";
import { AppButton } from "@/components/ui/AppButton";
import { MorePageScaffold } from "@/components/ui/MorePageScaffold";
import { PressableScale } from "@/components/ui/PressableScale";
import { SelectionTabs } from "@/components/ui/SelectionTabs";
import { withAlpha } from "@/components/ui/themeHelpers";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminPanel } from "@/components/admin/AdminWorkspace";
import { useAdminState } from "@/components/admin/AdminStateContext";
import { ADMIN_ROUTES } from "@/components/admin/adminNavigation";
import { control, spacing } from "@/constants/uiTokens";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";

const RANGE_OPTIONS = [
  { value: "7d" as const, label: "7D" },
  { value: "30d" as const, label: "30D" },
  { value: "90d" as const, label: "90D" },
  { value: "365d" as const, label: "1Y" },
];
const COMPARE_OPTIONS = [
  { value: "previous" as const, label: "Previous" },
  { value: "off" as const, label: "Current only" },
];
const SEGMENT_OPTIONS = [
  { value: "billing" as const, label: "Billing" },
  { value: "behavior" as const, label: "Behavior" },
  { value: "lifecycle" as const, label: "Lifecycle" },
  { value: "provider" as const, label: "Provider" },
  { value: "capability" as const, label: "Capability" },
];

function resolveWorkflow(pathname: string) {
  if (pathname === "/admin/analytics") return "analytics" as const;
  if (pathname === "/admin/users") return "users" as const;
  if (pathname === "/admin/ai-ops") return "ai-ops" as const;
  if (pathname === "/admin/system") return "system" as const;
  if (pathname === "/admin/audit") return "audit" as const;
  return "overview" as const;
}

function RouteControl({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();
  const theme = useAppTheme();
  const routes = ADMIN_ROUTES.map((route) => {
    const active = pathname === route.href;
    return (
      <PressableScale
        key={route.href}
        onPress={() => router.replace(route.href as never)}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        accessibilityLabel={`${route.label} admin workspace`}
      >
        <XStack
          minHeight={control.minimumHitSize}
          minWidth={compact ? undefined : 148}
          paddingHorizontal={12}
          alignItems="center"
          gap={8}
          borderRadius={12}
          backgroundColor={active ? withAlpha(theme.primary.val, "14") : "transparent"}
          borderWidth={StyleSheet.hairlineWidth}
          borderColor={active ? withAlpha(theme.primary.val, "70") : "transparent"}
        >
          <Feather
            name={route.icon}
            size={14}
            color={active ? theme.primary.val : theme.colorMuted.val}
          />
          <Text
            fontSize={12}
            fontWeight={active ? "700" : "500"}
            color={active ? theme.primary.val : theme.colorMuted.val}
            numberOfLines={1}
          >
            {route.label}
          </Text>
        </XStack>
      </PressableScale>
    );
  });

  if (compact) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 6 }}
      >
        {routes}
      </ScrollView>
    );
  }
  return <YStack gap={4}>{routes}</YStack>;
}

function Toolbar({ pathname }: { pathname: string }) {
  const theme = useAppTheme();
  const responsive = useResponsiveLayout();
  const {
    range,
    setRange,
    compareMode,
    setCompareMode,
    segmentFamily,
    setSegmentFamily,
    triggerRefresh,
  } = useAdminState();
  const showCompare = pathname === "/admin" || pathname === "/admin/analytics";
  const showSegment = pathname === "/admin/analytics";

  const group = (label: string, controlNode: React.ReactNode) => (
    <YStack gap={5} minWidth={responsive.isCompact ? "100%" : undefined}>
      <Text
        fontSize={10}
        lineHeight={12}
        letterSpacing={0.7}
        textTransform="uppercase"
        color={theme.colorMuted.val}
      >
        {label}
      </Text>
      {controlNode}
    </YStack>
  );

  return (
    <AdminPanel padding={12}>
      <XStack gap={12} alignItems="flex-end" flexWrap="wrap">
        {group(
          "Period",
          <SelectionTabs
            options={RANGE_OPTIONS}
            value={range}
            onChange={setRange}
            size="compact"
            accessibilityLabel="Analytics period"
          />,
        )}
        {showCompare
          ? group(
              "Compare",
              <SelectionTabs
                options={COMPARE_OPTIONS}
                value={compareMode}
                onChange={setCompareMode}
                size="compact"
                accessibilityLabel="Comparison mode"
              />,
            )
          : null}
        {showSegment
          ? group(
              "Segment",
              <SelectionTabs
                options={SEGMENT_OPTIONS}
                value={segmentFamily}
                onChange={setSegmentFamily}
                size="compact"
                accessibilityLabel="Analytics segment"
              />,
            )
          : null}
        <YStack marginLeft={responsive.isExpanded ? "auto" : 0}>
          <AppButton
            title="Refresh"
            icon="refresh-cw"
            onPress={triggerRefresh}
            variant="secondary"
            size="sm"
          />
        </YStack>
      </XStack>
    </AdminPanel>
  );
}

export function AdminLayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const responsive = useResponsiveLayout();
  const { setActiveWorkflow } = useAdminState();
  const workflow = resolveWorkflow(pathname);

  React.useEffect(() => setActiveWorkflow(workflow), [setActiveWorkflow, workflow]);

  return (
    <MorePageScaffold title="Admin" fallbackHref="/more" staticHeader widthMode="workspace">
      <AdminGuard>
        {!responsive.isExpanded ? <RouteControl compact /> : null}
        <XStack gap={spacing.md} alignItems="flex-start">
          {responsive.isExpanded ? (
            <AdminPanel padding={8}>
              <YStack paddingHorizontal={10} paddingVertical={8} gap={2}>
                <Text fontSize={10} textTransform="uppercase" letterSpacing={0.8} fontWeight="700">
                  Operations
                </Text>
                <Text fontSize={11} color="$colorMuted">
                  Admin workspace
                </Text>
              </YStack>
              <RouteControl />
            </AdminPanel>
          ) : null}
          <YStack flex={1} minWidth={0} gap={12}>
            <Toolbar pathname={pathname} />
            {children}
          </YStack>
        </XStack>
      </AdminGuard>
    </MorePageScaffold>
  );
}
