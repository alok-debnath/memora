import React, { useMemo } from "react";
import { useQuery } from "convex/react";
import { Text, YStack } from "tamagui";

import { PrimaryPageHeader } from "@/components/navigation/PrimaryPageHeader";
import { AppListRow } from "@/components/ui/AppListRow";
import { AppButton } from "@/components/ui/AppButton";
import { AppScreen, SectionCard } from "@/components/ui/AppScreen";
import { ResponsiveStatGrid, SectionGrid } from "@/components/ui/Responsive";
import { Skeleton } from "@/components/ui/Skeleton";
import { api } from "@/convex/_generated/api";
import { useAppRouter } from "@/hooks/useAppRouter";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useAuth } from "@/hooks/useAuth";
import { useUIStore } from "@/store/ui";
import { getReminderDate } from "@/types/memoryKind";

export default function TodayScreen() {
  const theme = useAppTheme();
  const router = useAppRouter();
  const { user, token } = useAuth();
  const openCommand = useUIStore((state) => state.openCommand);
  const openHomeOverview = useUIStore((state) => state.openHomeOverview);
  const snapshot = useMemo(() => ({ nowIso: new Date().toISOString(), nowMs: Date.now() }), []);

  const dueRemindersResult = useQuery(
    api.memories.reminders,
    token ? { token, asOf: snapshot.nowIso } : "skip",
  );
  const upcomingRemindersResult = useQuery(
    api.memories.upcomingReminders,
    token ? { token, asOf: snapshot.nowIso, range: "week" } : "skip",
  );
  const reviewCardsResult = useQuery(api.review.getDue, token ? { token, limit: 50 } : "skip");
  const statsResult = useQuery(
    api.memories.stats,
    token ? { token, asOf: snapshot.nowMs } : "skip",
  );

  const loading =
    dueRemindersResult === undefined ||
    upcomingRemindersResult === undefined ||
    reviewCardsResult === undefined ||
    statsResult === undefined;
  const dueReminders = (dueRemindersResult ?? []).filter((memory) => getReminderDate(memory));
  const upcomingReminders = upcomingRemindersResult ?? [];
  const reviewCards = reviewCardsResult ?? [];
  const stats = statsResult ?? null;
  const firstName = user?.name?.split(" ")[0] || "there";

  return (
    <AppScreen
      safeTop={false}
      contentWidth="workspace"
      hero={
        <PrimaryPageHeader
          eyebrow="Daily rhythm"
          title="Today"
          description={`${firstName}, here is what deserves your attention now.`}
        />
      }
    >
      <SectionGrid minimumColumnWidth={320} maximumColumns={2} gap={14}>
        <SectionCard title="Needs attention" eyebrow="Now" emphasis="primary">
          {loading ? (
            <YStack gap={10}>
              <Skeleton height={58} borderRadius={14} />
              <Skeleton height={58} borderRadius={14} />
            </YStack>
          ) : (
            <YStack gap={4}>
              <AppListRow
                icon="bell"
                title={
                  dueReminders.length > 0
                    ? `${dueReminders.length} reminder${dueReminders.length === 1 ? "" : "s"} due`
                    : "No reminders due"
                }
                description={
                  dueReminders[0]?.title ??
                  (upcomingReminders.length > 0
                    ? `${upcomingReminders.length} coming up this week`
                    : "Your schedule is clear")
                }
                onPress={() => router.push("/reminders" as never)}
              />
              <AppListRow
                icon="refresh-cw"
                title={
                  reviewCards.length > 0
                    ? `${reviewCards.length} review card${reviewCards.length === 1 ? "" : "s"} ready`
                    : "Review queue is clear"
                }
                description={
                  reviewCards.length > 0
                    ? "A short review keeps important memories available"
                    : "Nothing needs reinforcement right now"
                }
                onPress={() => router.push("/review" as never)}
              />
            </YStack>
          )}
        </SectionCard>

        <SectionCard title="Capture the day" eyebrow="One next step" emphasis="supporting">
          <Text fontSize={13} lineHeight={19} color={theme.colorMuted.val}>
            Save what happened, or take a quiet moment to reflect. Everything else can wait.
          </Text>
          <YStack gap={8}>
            <AppButton title="Capture a memory" icon="plus" onPress={openCommand} fullWidth />
            <AppButton
              title="Write in Journal"
              icon="book-open"
              onPress={() => router.push("/diary" as never)}
              variant="secondary"
              fullWidth
            />
          </YStack>
        </SectionCard>
      </SectionGrid>

      <SectionCard
        title="Weekly pulse"
        eyebrow="At a glance"
        emphasis="quiet"
        action={
          <AppButton
            title="Open overview"
            icon="arrow-up-right"
            onPress={openHomeOverview}
            variant="ghost"
            size="sm"
          />
        }
      >
        {loading ? (
          <Skeleton height={62} borderRadius={14} />
        ) : (
          <ResponsiveStatGrid
            maximumColumns={3}
            minimumColumnWidth={105}
            items={[
              { label: "Captured", value: stats?.recentCount ?? 0 },
              { label: "Upcoming", value: upcomingReminders.length },
              { label: "All memories", value: stats?.totalMemories ?? 0 },
            ]}
          />
        )}
      </SectionCard>
    </AppScreen>
  );
}
