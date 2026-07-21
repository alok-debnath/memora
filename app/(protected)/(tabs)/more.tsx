import React from "react";
import { useQuery } from "convex/react";
import { Text, XStack, YStack } from "tamagui";

import { AppListRow } from "@/components/ui/AppListRow";
import { AppScreen } from "@/components/ui/AppScreen";
import { useAppConfirm } from "@/components/ui/confirm/AppConfirmProvider";
import { PageHero } from "@/components/ui/PageHero";
import { PressableScale } from "@/components/ui/PressableScale";
import { SectionGrid } from "@/components/ui/Responsive";
import { SurfaceCard } from "@/components/ui/SurfaceCard";
import { withAlpha } from "@/components/ui/themeHelpers";
import { SECONDARY_NAVIGATION } from "@/constants/appNavigation";
import { radius, spacing, typeScale } from "@/constants/uiTokens";
import { api } from "@/convex/_generated/api";
import { useAppRouter } from "@/hooks/useAppRouter";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useAuth } from "@/hooks/useAuth";
import { Feather } from "@/lib/icons";

function initialsFrom(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.trim() || "";
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const letters = parts.length === 1 ? parts[0].slice(0, 2) : `${parts[0][0]}${parts[1][0]}`;
  return letters.toUpperCase();
}

function SectionHeading({ label }: { label: string }) {
  const theme = useAppTheme();

  return (
    <Text
      paddingHorizontal={spacing.xs}
      fontFamily="$utility"
      fontSize={10}
      fontWeight="700"
      letterSpacing={1}
      textTransform="uppercase"
      color={theme.colorMuted.val}
    >
      {label}
    </Text>
  );
}

/**
 * Root of the "More" tab: the mobile home for everything the desktop sidebar
 * lists directly. Replaces the navigation modal this app used to open.
 */
export default function MoreScreen() {
  const theme = useAppTheme();
  const router = useAppRouter();
  const { user, logout } = useAuth();
  const { confirm } = useAppConfirm();
  const adminStatus = useQuery(api.auth.getAdminStatus);

  const handleSignOut = React.useCallback(async () => {
    const confirmed = await confirm({
      title: "Sign out",
      message: "You'll need to sign in again to reach your memories on this device.",
      confirmLabel: "Sign out",
      tone: "destructive",
      icon: "log-out",
    });
    if (!confirmed) return;
    await logout();
  }, [confirm, logout]);

  return (
    <AppScreen
      safeTop={false}
      hero={<PageHero eyebrow="Your archive" title="More" accentStyle="none" />}
    >
      <YStack gap={spacing.lg}>
        <PressableScale
          onPress={() => router.push("/profile" as never)}
          accessibilityRole="link"
          accessibilityLabel="Open your profile"
        >
          <SurfaceCard variant="glass" padding={spacing.md} radius={radius.lg} shadowed>
            <XStack alignItems="center" gap={spacing.md}>
              <YStack
                width={52}
                height={52}
                borderRadius={radius.pill}
                alignItems="center"
                justifyContent="center"
                backgroundColor={withAlpha(theme.primary.val, "1F")}
                borderWidth={1}
                borderColor={withAlpha(theme.primary.val, "2C")}
              >
                <Text
                  fontFamily="$heading"
                  fontSize={typeScale.bodyLarge}
                  fontWeight="800"
                  color={theme.primary.val}
                >
                  {initialsFrom(user?.name, user?.email)}
                </Text>
              </YStack>
              <YStack flex={1} minWidth={0} gap={2}>
                <Text
                  fontFamily="$heading"
                  fontSize={typeScale.sectionTitle}
                  fontWeight="700"
                  color={theme.color.val}
                  numberOfLines={1}
                >
                  {user?.name?.trim() || "Your profile"}
                </Text>
                <Text
                  fontFamily="$utility"
                  fontSize={typeScale.metadata}
                  color={theme.colorMuted.val}
                  numberOfLines={1}
                >
                  {user?.email ?? "Identity and integrations"}
                </Text>
              </YStack>
              <Feather name="chevron-right" size={20} color={theme.colorMuted.val} />
            </XStack>
          </SurfaceCard>
        </PressableScale>

        <SectionGrid minimumColumnWidth={300} maximumColumns={3} gap={spacing.lg}>
          {SECONDARY_NAVIGATION.map((section) => {
            const items = section.items.filter(
              (item) => !item.adminOnly || adminStatus?.isAdmin === true,
            );
            if (items.length === 0) return null;
            return (
              <YStack key={section.label} gap={spacing.sm}>
                <SectionHeading label={section.label} />
                <SurfaceCard variant="solid" padding={spacing.xs} radius={radius.lg}>
                  {items.map((item) => (
                    <AppListRow
                      key={item.id}
                      icon={item.icon}
                      title={item.label}
                      description={item.detail}
                      onPress={() => router.push(item.href as never)}
                    />
                  ))}
                </SurfaceCard>
              </YStack>
            );
          })}
        </SectionGrid>

        <SurfaceCard variant="solid" padding={spacing.xs} radius={radius.lg}>
          <AppListRow
            icon="log-out"
            title="Sign out"
            description={user?.email ?? undefined}
            destructive
            showChevron={false}
            onPress={handleSignOut}
          />
        </SurfaceCard>
      </YStack>
    </AppScreen>
  );
}
