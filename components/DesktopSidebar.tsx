import React from "react";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { YStack, XStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import { PressableScale } from "./ui/PressableScale";
import { FontFamily } from "@/constants/fonts";

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
  { icon: "bar-chart-2", label: "Statistics", key: "statistics" },
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
        {isActive && (
          <YStack
            width={6}
            height={6}
            borderRadius={3}
            backgroundColor="$primary"
          />
        )}
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
      <XStack alignItems="center" gap={10} marginBottom={8} paddingHorizontal={8}>
        <LinearGradient
          colors={["#E8911B", "#D4710F"]}
          style={{ width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" }}
        >
          <Feather name="zap" size={20} color="#FFFFFF" />
        </LinearGradient>
        <Text fontSize={20} fontFamily={FontFamily.bold} fontWeight="700" color="$color">Memora</Text>
      </XStack>

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

      <PressableScale onPress={onNewNote} style={{ marginBottom: 20, borderRadius: 12, shadowColor: "#E8911B", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 6 }}>
        <LinearGradient
          colors={["#E8911B", "#D4710F"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 12 }}
        >
          <Feather name="plus" size={18} color="#FFFFFF" />
          <Text style={{ color: "#FFFFFF", fontSize: 14, fontFamily: FontFamily.semiBold, fontWeight: "600" }}>New Memory</Text>
        </LinearGradient>
      </PressableScale>

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
