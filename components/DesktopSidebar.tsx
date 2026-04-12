import React from "react";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { YStack, XStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import { PressableScale } from "./ui/PressableScale";
import { FontFamily } from "@/constants/fonts";
import { AppButton } from "./ui/AppButton";
import { SurfaceCard } from "./ui/SurfaceCard";
import { brandGradients } from "@/constants/colors";

interface NavItem {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  key: string;
}

const mainItems: NavItem[] = [
  { icon: "home", label: "Home", key: "index" },
  { icon: "book", label: "Diary", key: "diary" },
  { icon: "repeat", label: "Review", key: "review" },
];

const moreItems: NavItem[] = [
  { icon: "clock", label: "Timeline", key: "timeline" },
  { icon: "bell", label: "Reminders", key: "reminders" },
  { icon: "file-text", label: "Documents", key: "documents" },
  { icon: "share-2", label: "Knowledge Graph", key: "knowledge-graph" },
  { icon: "bar-chart-2", label: "Analytics", key: "statistics" },
  { icon: "user", label: "Profile", key: "profile" },
];

interface DesktopSidebarProps {
  activeRoute: string;
  onNavigate: (route: string) => void;
  onNewNote: () => void;
  userName?: string;
}

export function DesktopSidebar({
  activeRoute,
  onNavigate,
  onNewNote,
  userName,
}: DesktopSidebarProps) {
  const theme = useAppTheme();

  const renderNavItem = (item: NavItem) => {
    const isActive = activeRoute === item.key;
    return (
      <PressableScale
        key={item.key}
        onPress={() => onNavigate(item.key)}
        style={[
          {
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderRadius: 10,
            marginBottom: 2,
          },
          isActive ? { backgroundColor: theme.primary.val + "15" } : undefined,
        ]}
      >
        <Feather
          name={item.icon}
          size={20}
          color={isActive ? theme.primary.val : theme.colorMuted.val}
        />
        <Text
          flex={1}
          fontSize={14}
          color={isActive ? "$primary" : "$color"}
          fontFamily={isActive ? FontFamily.semiBold : FontFamily.regular}
        >
          {item.label}
        </Text>
        {isActive && <YStack width={6} height={6} borderRadius={3} backgroundColor="$primary" />}
      </PressableScale>
    );
  };

  return (
    <YStack
      width={260}
      borderRightWidth={0.5}
      paddingTop={20}
      paddingHorizontal={16}
      backgroundColor="$card"
      borderRightColor="$borderColor"
    >
      <SurfaceCard tone="accent" padding={14} style={{ marginBottom: 12 }}>
        <XStack alignItems="center" gap={10}>
          <LinearGradient
            colors={[brandGradients.warm[1], brandGradients.warm[0]]}
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Feather name="zap" size={20} color={theme.textInverse.val} />
          </LinearGradient>
          <Text fontSize={20} fontFamily={FontFamily.bold} fontWeight="700" color="$color">
            Memora
          </Text>
        </XStack>
      </SurfaceCard>

      {userName && (
        <Text
          fontSize={13}
          fontFamily={FontFamily.regular}
          paddingHorizontal={8}
          marginBottom={16}
          color="$colorMuted"
        >
          Hey, {userName}
        </Text>
      )}

      <AppButton
        title="New Memory"
        onPress={onNewNote}
        icon="plus"
        variant="gradient"
        style={{ marginBottom: 20, alignSelf: "stretch" }}
        fullWidth
      />

      <YStack marginBottom={20}>
        <Text
          fontSize={10}
          fontFamily={FontFamily.semiBold}
          fontWeight="600"
          letterSpacing={1.2}
          marginBottom={6}
          marginLeft={8}
          color="$colorMuted"
        >
          MAIN
        </Text>
        {mainItems.map(renderNavItem)}
      </YStack>

      <YStack marginBottom={20}>
        <Text
          fontSize={10}
          fontFamily={FontFamily.semiBold}
          fontWeight="600"
          letterSpacing={1.2}
          marginBottom={6}
          marginLeft={8}
          color="$colorMuted"
        >
          MORE
        </Text>
        {moreItems.map(renderNavItem)}
      </YStack>
    </YStack>
  );
}
