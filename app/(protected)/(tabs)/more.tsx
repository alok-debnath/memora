import React from "react";
import { useQuery } from "convex/react";
import { Text, YStack } from "tamagui";

import { AppListRow } from "@/components/ui/AppListRow";
import { AppScreen } from "@/components/ui/AppScreen";
import { PageHero } from "@/components/ui/PageHero";
import { SectionGrid } from "@/components/ui/Responsive";
import { SurfaceCard } from "@/components/ui/SurfaceCard";
import { SECONDARY_NAVIGATION } from "@/constants/appNavigation";
import { radius, spacing } from "@/constants/uiTokens";
import { api } from "@/convex/_generated/api";
import { useAppRouter } from "@/hooks/useAppRouter";
import { useAppTheme } from "@/hooks/useAppTheme";

/**
 * Compatibility destination for existing /more links. Primary navigation now
 * opens the adaptive app menu; this route renders the same canonical groups.
 */
export default function MoreScreen() {
  const theme = useAppTheme();
  const router = useAppRouter();
  const adminStatus = useQuery(api.auth.getAdminStatus);

  return (
    <AppScreen
      safeTop={false}
      hero={
        <PageHero
          eyebrow="Your archive"
          title="Explore Memora"
          description="Open your library, insights, account controls, and administration tools."
          icon="grid"
        />
      }
    >
      <SectionGrid minimumColumnWidth={300} maximumColumns={3} gap={spacing.lg}>
        {SECONDARY_NAVIGATION.map((section) => {
          const items = section.items.filter(
            (item) => !item.adminOnly || adminStatus?.isAdmin === true,
          );
          if (items.length === 0) return null;
          return (
            <YStack key={section.label} gap={spacing.sm}>
              <Text
                paddingHorizontal={spacing.xs}
                fontFamily="$utility"
                fontSize={10}
                fontWeight="700"
                letterSpacing={1}
                textTransform="uppercase"
                color={theme.colorMuted.val}
              >
                {section.label}
              </Text>
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
    </AppScreen>
  );
}
