import React, { useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { Text, XStack, YStack } from "tamagui";

import { AppButton } from "@/components/ui/AppButton";
import { AppIconButton } from "@/components/ui/AppIconButton";
import { AppListRow } from "@/components/ui/AppListRow";
import { AppScreen } from "@/components/ui/AppScreen";
import { Badge } from "@/components/ui/Badge";
import { PageHero } from "@/components/ui/PageHero";
import { Skeleton } from "@/components/ui/Skeleton";
import { SurfaceCard } from "@/components/ui/SurfaceCard";
import type { StatusTone } from "@/components/ui/themeHelpers";
import { withAlpha } from "@/components/ui/themeHelpers";
import { COMMAND_ENTRY } from "@/constants/appNavigation";
import { radius, spacing, typeScale } from "@/constants/uiTokens";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAppRouter } from "@/hooks/useAppRouter";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useAuth } from "@/hooks/useAuth";
import { Feather, type FeatherIconName } from "@/lib/icons";
import { useUIStore } from "@/store/ui";
import { getReminderDate } from "@/types/memoryKind";

const TODAY_FORMATTER = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  day: "numeric",
  month: "long",
});

function getGreeting(hour: number, firstName?: string) {
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return firstName ? `${greeting}, ${firstName}` : greeting;
}

function getFocusState(
  dueCount: number,
  upcomingCount: number,
): {
  title: string;
  badgeLabel: string;
  badgeTone: StatusTone;
  badgeIcon: FeatherIconName;
} {
  if (dueCount > 0) {
    return {
      title: dueCount === 1 ? "1 reminder needs attention" : `${dueCount} reminders need attention`,
      badgeLabel: "Due now",
      badgeTone: "warning",
      badgeIcon: "bell",
    };
  }

  if (upcomingCount > 0) {
    return {
      title: `Nothing urgent · ${upcomingCount} coming up`,
      badgeLabel: "Later",
      badgeTone: "neutral",
      badgeIcon: "calendar",
    };
  }

  return {
    title: "Nothing urgent",
    badgeLabel: "Clear",
    badgeTone: "success",
    badgeIcon: "check",
  };
}

/** Local-midnight epoch, so "written today" follows the device day, not UTC. */
function startOfLocalDay(atMs: number) {
  const day = new Date(atMs);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

export default function TodayScreen() {
  const theme = useAppTheme();
  const router = useAppRouter();
  const { user, token } = useAuth();
  const openCommand = useUIStore((state) => state.openCommand);
  const openHomeOverview = useUIStore((state) => state.openHomeOverview);
  const snapshot = useMemo(() => {
    const now = new Date();
    return {
      nowIso: now.toISOString(),
      nowMs: now.getTime(),
      label: TODAY_FORMATTER.format(now),
      hour: now.getHours(),
    };
  }, []);

  const dueRemindersResult = useQuery(
    api.memories.reminders,
    token ? { token, asOf: snapshot.nowIso } : "skip",
  );
  const upcomingRemindersResult = useQuery(
    api.memories.upcomingReminders,
    token ? { token, asOf: snapshot.nowIso, range: "week" } : "skip",
  );
  const stats = useQuery(api.memories.stats, token ? { token, asOf: snapshot.nowMs } : "skip");
  const flashbacksResult = useQuery(api.memories.flashbacks, token ? { token } : "skip");
  const journalResult = useQuery(api.diary.list, token ? { token, limit: 1 } : "skip");
  const nudgesResult = useQuery(api.nudges.list, token ? { token } : "skip");
  const dismissNudge = useMutation(api.nudges.dismiss);

  const loading = dueRemindersResult === undefined || upcomingRemindersResult === undefined;
  const dueReminders = (dueRemindersResult ?? []).filter((memory) => getReminderDate(memory));
  const upcomingReminders = upcomingRemindersResult ?? [];
  const reminderPreview = dueReminders[0] ?? upcomingReminders[0];
  const reminderPreviewTitle = reminderPreview?.title?.trim() || "Untitled reminder";
  const firstName = user?.name?.trim().split(/\s+/)[0];
  const greeting = getGreeting(snapshot.hour, firstName);
  const focusState = getFocusState(dueReminders.length, upcomingReminders.length);

  const flashback = flashbacksResult?.[0];
  const lastEntry = journalResult?.[0];
  const journaledToday =
    lastEntry !== undefined && lastEntry._creationTime >= startOfLocalDay(snapshot.nowMs);
  const nudge = nudgesResult?.[0];

  const handleDismissNudge = React.useCallback(
    (id: Id<"nudges">) => {
      if (!token) return;
      void dismissNudge({ token, id });
    },
    [dismissNudge, token],
  );

  return (
    <AppScreen
      safeTop={false}
      contentWidth="readable"
      hero={<PageHero eyebrow={snapshot.label} title="Today" accentStyle="none" />}
    >
      <SurfaceCard variant="glass" noPadding radius={radius.lg} shadowed>
        <YStack padding={spacing.md} gap={spacing.xs}>
          <XStack
            minHeight={40}
            paddingHorizontal={spacing.sm}
            alignItems="center"
            justifyContent="space-between"
            gap={spacing.md}
          >
            <YStack flex={1} minWidth={0} gap={1}>
              <Text
                fontFamily="$utility"
                fontSize={typeScale.caption}
                lineHeight={14}
                fontWeight="700"
                letterSpacing={1}
                textTransform="uppercase"
                color={theme.primary.val}
              >
                {greeting}
              </Text>
              <Text
                fontFamily="$heading"
                fontSize={typeScale.sectionTitle}
                lineHeight={22}
                fontWeight="700"
                color={theme.color.val}
              >
                {loading ? "Checking your day" : focusState.title}
              </Text>
            </YStack>
            {!loading ? (
              <Badge
                label={focusState.badgeLabel}
                tone={focusState.badgeTone}
                small
                icon={focusState.badgeIcon}
              />
            ) : null}
          </XStack>

          {stats ? (
            <Text
              paddingHorizontal={spacing.sm}
              fontFamily="$utility"
              fontSize={typeScale.metadata}
              color={theme.colorMuted.val}
            >
              {stats.streakDays > 0 ? `${stats.streakDays}-day streak · ` : ""}
              {stats.recentCount} captured this week · {stats.totalMemories} total
            </Text>
          ) : null}

          {loading ? (
            <YStack gap={spacing.sm} padding={spacing.sm}>
              <Skeleton height={52} borderRadius={radius.sm} />
              <Skeleton height={52} borderRadius={radius.sm} />
            </YStack>
          ) : (
            <YStack>
              <AppListRow
                icon="bell"
                iconColor={dueReminders.length > 0 ? theme.warning.val : undefined}
                title={reminderPreview ? `Reminder · ${reminderPreviewTitle}` : "Reminders"}
                trailing={
                  <Badge
                    label={
                      dueReminders.length > 0
                        ? `${dueReminders.length} due`
                        : upcomingReminders.length > 0
                          ? `${upcomingReminders.length} this week`
                          : "Clear"
                    }
                    tone={dueReminders.length > 0 ? "warning" : "neutral"}
                    small
                  />
                }
                onPress={() => router.push("/reminders" as never)}
              />
              <AppListRow
                icon="book-open"
                iconColor={journaledToday ? theme.success.val : undefined}
                title={journaledToday ? "Journal · Written today" : "Journal · Nothing yet today"}
                trailing={
                  <Badge
                    label={journaledToday ? "Done" : "Open"}
                    tone={journaledToday ? "success" : "neutral"}
                    small
                  />
                }
                onPress={() => router.push("/diary" as never)}
              />
              {flashback ? (
                <AppListRow
                  icon="rotate-ccw"
                  title={`On this day · ${flashback.title?.trim() || "Untitled memory"}`}
                  trailing={
                    <Badge
                      label={new Date(flashback._creationTime).getFullYear().toString()}
                      tone="neutral"
                      small
                    />
                  }
                  onPress={openHomeOverview}
                />
              ) : null}
            </YStack>
          )}
        </YStack>

        {nudge ? (
          <XStack
            alignItems="flex-start"
            gap={spacing.sm}
            marginHorizontal={spacing.md}
            marginBottom={spacing.md}
            padding={spacing.sm}
            borderRadius={radius.md}
            backgroundColor={withAlpha(theme.primary.val, "12")}
          >
            <Feather name="zap" size={16} color={theme.primary.val} style={{ marginTop: 2 }} />
            <YStack flex={1} minWidth={0} gap={2}>
              {nudge.title ? (
                <Text
                  fontFamily="$body"
                  fontSize={typeScale.body}
                  fontWeight="700"
                  color={theme.color.val}
                >
                  {nudge.title}
                </Text>
              ) : null}
              {nudge.message ? (
                <Text
                  fontFamily="$utility"
                  fontSize={typeScale.metadata}
                  lineHeight={18}
                  color={theme.colorMuted.val}
                >
                  {nudge.message}
                </Text>
              ) : null}
            </YStack>
            <AppIconButton
              icon="x"
              label="Dismiss suggestion"
              size="compact"
              variant="ghost"
              onPress={() => handleDismissNudge(nudge._id)}
            />
          </XStack>
        ) : null}

        <XStack
          flexWrap="wrap"
          gap={spacing.sm}
          padding={spacing.md}
          borderTopWidth={1}
          borderTopColor={theme.borderSubtle.val}
          backgroundColor={theme.backgroundStrong.val}
        >
          <AppButton
            title={COMMAND_ENTRY.label}
            icon={COMMAND_ENTRY.icon}
            onPress={openCommand}
            size="sm"
            style={{ flexGrow: 1 }}
          />
          <AppButton
            title="Journal"
            icon="book-open"
            onPress={() => router.push("/diary" as never)}
            variant="secondary"
            size="sm"
            style={{ flexGrow: 1 }}
          />
          <AppButton
            title="Overview"
            icon="arrow-up-right"
            onPress={openHomeOverview}
            variant="ghost"
            size="sm"
          />
        </XStack>
      </SurfaceCard>
    </AppScreen>
  );
}
