import React from "react";
import { Feather, type FeatherIconName } from "@/lib/icons";
import { appRouter as router } from "@/lib/appRouter";
import { XStack, YStack, Text } from "tamagui";
import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import { navigationAccentColors } from "@/constants/colors";
import { useAppTheme } from "@/hooks/useAppTheme";
import { PressableScale } from "@/components/ui/PressableScale";
import { AppScreen } from "@/components/ui/AppScreen";
import { PageHero } from "@/components/ui/PageHero";
import { SurfaceCard } from "@/components/ui/SurfaceCard";
import { withAlpha } from "@/components/ui/themeHelpers";

interface MenuItem {
  icon: FeatherIconName;
  label: string;
  description: string;
  route: string;
  color: string;
}

const menuItems: MenuItem[] = [
  {
    icon: "clock",
    label: "Timeline",
    description: "Chronological memory view",
    route: "/timeline",
    color: navigationAccentColors.timeline,
  },
  {
    icon: "bell",
    label: "Reminders",
    description: "Upcoming and past reminders",
    route: "/reminders",
    color: navigationAccentColors.reminders,
  },
  {
    icon: "paperclip",
    label: "Files",
    description: "Images and documents stored in Google Drive",
    route: "/documents",
    color: navigationAccentColors.documents,
  },
  {
    icon: "share-2",
    label: "Knowledge Graph",
    description: "Visual memory connections",
    route: "/knowledge-graph",
    color: navigationAccentColors.knowledgeGraph,
  },
  {
    icon: "bar-chart-2",
    label: "Analytics",
    description: "Usage, AI spend, storage, and trends",
    route: "/statistics",
    color: navigationAccentColors.statistics,
  },
  {
    icon: "archive",
    label: "Data",
    description: "Deleted memories and clean-slate controls",
    route: "/data",
    color: navigationAccentColors.data,
  },
  {
    icon: "user",
    label: "Profile",
    description: "Settings and preferences",
    route: "/profile",
    color: navigationAccentColors.profile,
  },
];

const adminItem: MenuItem = {
  icon: "shield",
  label: "Admin Console",
  description: "AI routing, model config, and platform settings",
  route: "/admin",
  color: navigationAccentColors.admin,
};

export default function MoreScreen() {
  const theme = useAppTheme();
  const adminStatus = useQuery(api.auth.getAdminStatus);
  const isAdmin = adminStatus?.isAdmin === true;

  const groupedItems = [
    { label: "Library", items: menuItems.slice(0, 3) },
    { label: "Insights", items: menuItems.slice(3, 5) },
    { label: "Settings", items: isAdmin ? [...menuItems.slice(5), adminItem] : menuItems.slice(5) },
  ];

  return (
    <AppScreen
      hero={
        <PageHero
          eyebrow="Navigation"
          title="Explore the vault"
          description="Jump into timelines, analytics, reminders, data controls, and profile settings from one place."
          icon="compass"
        />
      }
    >
      <YStack gap={16}>
        {groupedItems.map((group) => (
          <React.Fragment key={group.label}>
            <YStack gap={6}>
              <Text
                fontSize={11}
                fontFamily="$body"
                fontWeight="700"
                color="$colorMuted"
                textTransform="uppercase"
                marginLeft={4}
              >
                {group.label}
              </Text>
              <SurfaceCard variant="frosted" padding={0} radius={18} style={{ overflow: "hidden" }}>
                {group.items.map((item, i) => {
                  const isLast = i === group.items.length - 1;
                  return (
                    <PressableScale
                      key={item.route}
                      onPress={() => router.push(item.route as never)}
                    >
                      <XStack
                        alignItems="center"
                        gap={12}
                        paddingHorizontal={14}
                        paddingVertical={12}
                        borderBottomWidth={isLast ? 0 : 1}
                        borderBottomColor="$borderSubtle"
                      >
                        <YStack
                          width={32}
                          height={32}
                          borderRadius={9}
                          backgroundColor={item.color}
                          alignItems="center"
                          justifyContent="center"
                        >
                          <Feather name={item.icon} size={16} color={theme.textInverse.val} />
                        </YStack>
                        <YStack flex={1} minWidth={0} gap={1}>
                          <XStack alignItems="center" gap={8}>
                            <Text fontSize={15} fontFamily="$body" fontWeight="600" color="$color">
                              {item.label}
                            </Text>
                            {item.route === "/admin" && (
                              <YStack
                                backgroundColor={withAlpha(navigationAccentColors.admin, "18")}
                                borderRadius={7}
                                paddingHorizontal={7}
                                paddingVertical={2}
                              >
                                <Text
                                  fontSize={9}
                                  fontFamily="$body"
                                  fontWeight="700"
                                  color={navigationAccentColors.admin}
                                  textTransform="uppercase"
                                  letterSpacing={0.8}
                                >
                                  Admin
                                </Text>
                              </YStack>
                            )}
                          </XStack>
                          <Text
                            fontSize={12}
                            fontFamily="$body"
                            color="$colorMuted"
                            numberOfLines={1}
                          >
                            {item.description}
                          </Text>
                        </YStack>
                        <Feather name="chevron-right" size={16} color={theme.colorMuted.val} />
                      </XStack>
                    </PressableScale>
                  );
                })}
              </SurfaceCard>
            </YStack>
          </React.Fragment>
        ))}
      </YStack>
    </AppScreen>
  );
}
