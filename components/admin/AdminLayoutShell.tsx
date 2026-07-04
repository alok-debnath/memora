import React from "react";
import { ScrollView, StyleSheet } from "react-native";
import { usePathname } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@/lib/icons";
import { Text, XStack, YStack } from "tamagui";

import { appRouter as router } from "@/lib/appRouter";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PressableScale } from "@/components/ui/PressableScale";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { MorePageScaffold } from "@/components/ui/MorePageScaffold";
import { withAlpha } from "@/components/ui/themeHelpers";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { useAdminState } from "@/components/admin/AdminStateContext";
import { ADMIN_ROUTES, ADMIN_ROUTE_META } from "@/components/admin/adminNavigation";
import { useAppTheme } from "@/hooks/useAppTheme";
import { navigationAccentColors, statusAccentColors } from "@/constants/colors";

const RANGE_OPTIONS = [
  { value: "7d" as const, label: "7D" },
  { value: "30d" as const, label: "30D" },
  { value: "90d" as const, label: "90D" },
  { value: "365d" as const, label: "1Y" },
];

const COMPARE_OPTIONS = [
  { value: "previous" as const, label: "With Previous Period" },
  { value: "off" as const, label: "Current Period Only" },
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

export function AdminLayoutShell({ children }: { children: React.ReactNode }) {
  const theme = useAppTheme();
  const pathname = usePathname();
  const {
    range,
    setRange,
    compareMode,
    setCompareMode,
    segmentFamily,
    setSegmentFamily,
    triggerRefresh,
    setActiveWorkflow,
  } = useAdminState();

  const meta = ADMIN_ROUTE_META[pathname] ?? ADMIN_ROUTE_META["/admin"];
  const showSegmentFilter = pathname === "/admin/analytics";
  const showCompareFilter = pathname === "/admin" || pathname === "/admin/analytics";
  const workflow = resolveWorkflow(pathname);
  const [tabsViewportWidth, setTabsViewportWidth] = React.useState(0);
  const [tabsContentWidth, setTabsContentWidth] = React.useState(0);
  const [tabsScrollX, setTabsScrollX] = React.useState(0);

  React.useEffect(() => {
    setActiveWorkflow(workflow);
  }, [workflow, setActiveWorkflow]);

  const tabsOverflow = tabsContentWidth > tabsViewportWidth + 4;
  const showLeftFade = tabsOverflow && tabsScrollX > 8;
  const showRightFade = tabsOverflow && tabsScrollX < tabsContentWidth - tabsViewportWidth - 8;

  return (
    <MorePageScaffold
      title="Admin"
      backHref="/more"
      staticHeader
      scrollProps={{ contentContainerStyle: { gap: 14 } }}
    >
      <AdminGuard>
        <YStack>
          <Card style={{ borderRadius: 26 }}>
            <XStack alignItems="flex-start" justifyContent="space-between" gap={10}>
              <YStack gap={6} flex={1}>
                <Badge label="Admin Control Center" color={navigationAccentColors.admin} />
                <Text
                  fontSize={26}
                  lineHeight={30}
                  fontFamily="$heading"
                  fontWeight="700"
                  color="$color"
                >
                  {meta.title}
                </Text>
                <Text fontSize={13} lineHeight={19} color="$colorMuted">
                  {meta.subtitle}
                </Text>
              </YStack>
              <YStack
                width={48}
                height={48}
                borderRadius={16}
                alignItems="center"
                justifyContent="center"
                backgroundColor={navigationAccentColors.admin + "18"}
              >
                <Feather name="shield" size={20} color={navigationAccentColors.admin} />
              </YStack>
            </XStack>
          </Card>
        </YStack>

        <YStack>
          <Card style={{ borderRadius: 22, padding: 12 }}>
            <YStack position="relative" marginHorizontal={-12}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingHorizontal: 12 }}
                onLayout={(event) => setTabsViewportWidth(event.nativeEvent.layout.width)}
                onContentSizeChange={(width) => setTabsContentWidth(width)}
                onScroll={(event) => setTabsScrollX(event.nativeEvent.contentOffset.x)}
                scrollEventThrottle={16}
              >
                {ADMIN_ROUTES.map((route) => {
                  const active = pathname === route.href;
                  return (
                    <PressableScale
                      key={route.href}
                      onPress={() => router.push(route.href as never)}
                    >
                      <XStack
                        alignItems="center"
                        gap={7}
                        paddingHorizontal={12}
                        paddingVertical={9}
                        borderRadius={12}
                        borderWidth={1}
                        borderColor={
                          active
                            ? navigationAccentColors.admin
                            : withAlpha(theme.shadowColor.val, "22")
                        }
                        backgroundColor={
                          active ? navigationAccentColors.admin + "18" : "transparent"
                        }
                      >
                        <Feather
                          name={route.icon}
                          size={13}
                          color={active ? navigationAccentColors.admin : statusAccentColors.neutral}
                        />
                        <Text
                          fontSize={12}
                          fontFamily="$body"
                          fontWeight={active ? "700" : "500"}
                          color={active ? navigationAccentColors.admin : "$colorMuted"}
                        >
                          {route.label}
                        </Text>
                      </XStack>
                    </PressableScale>
                  );
                })}
              </ScrollView>

              {showLeftFade ? (
                <>
                  <XStack
                    pointerEvents="none"
                    position="absolute"
                    left={0}
                    top={0}
                    bottom={0}
                    width={48}
                    zIndex={5}
                  >
                    <LinearGradient
                      colors={[
                        withAlpha(theme.surfaceElevated.val, "FF"),
                        withAlpha(theme.surfaceElevated.val, "F2"),
                        withAlpha(theme.surfaceElevated.val, "B8"),
                        withAlpha(theme.surfaceElevated.val, "00"),
                      ]}
                      start={{ x: 0, y: 0.5 }}
                      end={{ x: 1, y: 0.5 }}
                      style={StyleSheet.absoluteFill}
                    />
                  </XStack>
                  <YStack
                    pointerEvents="none"
                    position="absolute"
                    left={0}
                    top="50%"
                    marginTop={-13}
                    width={18}
                    height={26}
                    borderRadius={10}
                    alignItems="center"
                    justifyContent="center"
                    backgroundColor={withAlpha(theme.surfaceElevated.val, "E8")}
                    borderWidth={1}
                    borderColor={withAlpha(theme.borderStrong.val, "70")}
                    zIndex={6}
                  >
                    <Feather
                      name="chevron-left"
                      size={13}
                      color={withAlpha(theme.color.val, "C8")}
                    />
                  </YStack>
                </>
              ) : null}

              {showRightFade ? (
                <>
                  <XStack
                    pointerEvents="none"
                    position="absolute"
                    right={0}
                    top={0}
                    bottom={0}
                    width={48}
                    zIndex={5}
                  >
                    <LinearGradient
                      colors={[
                        withAlpha(theme.surfaceElevated.val, "00"),
                        withAlpha(theme.surfaceElevated.val, "B8"),
                        withAlpha(theme.surfaceElevated.val, "F2"),
                        withAlpha(theme.surfaceElevated.val, "FF"),
                      ]}
                      start={{ x: 0, y: 0.5 }}
                      end={{ x: 1, y: 0.5 }}
                      style={StyleSheet.absoluteFill}
                    />
                  </XStack>
                  <YStack
                    pointerEvents="none"
                    position="absolute"
                    right={0}
                    top="50%"
                    marginTop={-13}
                    width={18}
                    height={26}
                    borderRadius={10}
                    alignItems="center"
                    justifyContent="center"
                    backgroundColor={withAlpha(theme.surfaceElevated.val, "E8")}
                    borderWidth={1}
                    borderColor={withAlpha(theme.borderStrong.val, "70")}
                    zIndex={6}
                  >
                    <Feather
                      name="chevron-right"
                      size={13}
                      color={withAlpha(theme.color.val, "C8")}
                    />
                  </YStack>
                </>
              ) : null}
            </YStack>
          </Card>
        </YStack>

        <YStack>
          <Card style={{ borderRadius: 22 }}>
            <YStack gap={10}>
              <SegmentedControl options={RANGE_OPTIONS} value={range} onChange={setRange} />
              {showCompareFilter ? (
                <>
                  <SegmentedControl
                    options={COMPARE_OPTIONS}
                    value={compareMode}
                    onChange={setCompareMode}
                  />
                  <Text fontSize={11} color="$colorMuted">
                    With previous period overlays last window values on charts for direct
                    comparison.
                  </Text>
                </>
              ) : null}
              <XStack gap={8} alignItems="center">
                <YStack flex={1}>
                  <Text fontSize={11} color="$colorMuted">
                    Refresh reloads current admin data immediately.
                  </Text>
                </YStack>
                <PressableScale onPress={triggerRefresh}>
                  <XStack
                    alignItems="center"
                    gap={6}
                    paddingHorizontal={12}
                    paddingVertical={9}
                    borderRadius={12}
                    borderWidth={1}
                    borderColor={withAlpha(theme.shadowColor.val, "22")}
                  >
                    <Feather name="refresh-cw" size={13} color={statusAccentColors.neutral} />
                    <Text fontSize={12} fontFamily="$body" fontWeight="600" color="$colorMuted">
                      Refresh
                    </Text>
                  </XStack>
                </PressableScale>
              </XStack>
              {showSegmentFilter ? (
                <SegmentedControl
                  options={SEGMENT_OPTIONS}
                  value={segmentFamily}
                  onChange={setSegmentFamily}
                />
              ) : null}
            </YStack>
          </Card>
        </YStack>

        {children}
      </AdminGuard>
    </MorePageScaffold>
  );
}
