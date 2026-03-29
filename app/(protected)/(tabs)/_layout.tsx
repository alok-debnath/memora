import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import * as Haptics from "expo-haptics";
import { Tabs, useRouter, usePathname, Slot } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView, type SFSymbol } from "expo-symbols";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Platform, Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useAnimatedStyle,
  withTiming,
  useSharedValue,
} from "react-native-reanimated";
import { XStack, YStack, Text } from "tamagui";

import { UnifiedCommandPanel } from "@/components/UnifiedCommandPanel";
import Colors from "@/constants/colors";
import { FontFamily } from "@/constants/fonts";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useIsLargeScreen } from "@/hooks/useIsLargeScreen";

type MaterialIconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

const NAV_ITEMS = [
  {
    name: "index",
    title: "Home",
    icon: "home" as const,
    sfIcon: "house" as SFSymbol,
    sfIconActive: "house.fill" as SFSymbol,
    mdIcon: "home-outline" as MaterialIconName,
  },
  {
    name: "diary",
    title: "Diary",
    icon: "book-open" as const,
    sfIcon: "book" as SFSymbol,
    sfIconActive: "book.fill" as SFSymbol,
    mdIcon: "book-open-outline" as MaterialIconName,
  },
  {
    name: "review",
    title: "Review",
    icon: "refresh-cw" as const,
    sfIcon: "brain.head.profile" as SFSymbol,
    sfIconActive: "brain.head.profile.fill" as SFSymbol,
    mdIcon: "head-lightbulb-outline" as MaterialIconName,
  },
  {
    name: "more",
    title: "More",
    icon: "more-horizontal" as const,
    sfIcon: "ellipsis.circle" as SFSymbol,
    sfIconActive: "ellipsis.circle.fill" as SFSymbol,
    mdIcon: "dots-horizontal-circle-outline" as MaterialIconName,
  },
] as const;

function CenterFab({ onPress }: { onPress: () => void }) {
  const scale = useSharedValue(1);
  const theme = useAppTheme();

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <YStack flex={1} alignItems="center" justifyContent="center">
      <Animated.View style={[{ position: "relative", top: -22 }, animStyle]}>
        <Pressable
          onPress={onPress}
          onPressIn={() => {
            scale.value = withTiming(0.94, { duration: 120 });
          }}
          onPressOut={() => {
            scale.value = withTiming(1, { duration: 140 });
          }}
          style={{
            width: 58,
            height: 58,
            borderRadius: 29,
            backgroundColor: theme.primary.val,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: theme.primary.val,
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.45,
            shadowRadius: 14,
            elevation: 10,
          }}
        >
          <Feather name="plus" size={26} color="#FFFFFF" />
        </Pressable>
      </Animated.View>
    </YStack>
  );
}

function IOSNativeTabLayout() {
  const [showCommand, setShowCommand] = useState(false);

  return (
    <>
      <NativeTabs>
        {NAV_ITEMS.map((item) => (
          <NativeTabs.Trigger key={item.name} name={item.name}>
            <NativeTabs.Trigger.Icon
              sf={{ default: item.sfIcon, selected: item.sfIconActive }}
            />
            <NativeTabs.Trigger.Label>{item.title}</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
        ))}
      </NativeTabs>
      <UnifiedCommandPanel visible={showCommand} onClose={() => setShowCommand(false)} />
    </>
  );
}

function AndroidNativeTabLayout() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const [showCommand, setShowCommand] = useState(false);

  return (
    <>
      <NativeTabs
        backgroundColor={theme.card.val}
        iconColor={{ default: theme.colorMuted.val, selected: theme.primary.val }}
        labelStyle={{
          fontFamily: FontFamily.medium,
          fontSize: 11,
          fontWeight: "500",
          color: theme.colorMuted.val,
        }}
        disableIndicator
        rippleColor={theme.primary.val + "18"}
        backBehavior="history"
        labelVisibilityMode="labeled"
      >
        {NAV_ITEMS.map((item) => (
          <NativeTabs.Trigger key={item.name} name={item.name}>
            <NativeTabs.Trigger.Icon
              src={{
                default: (
                  <NativeTabs.Trigger.VectorIcon
                    family={MaterialCommunityIcons}
                    name={item.mdIcon}
                  />
                ),
                selected: (
                  <NativeTabs.Trigger.VectorIcon
                    family={MaterialCommunityIcons}
                    name={item.mdIcon}
                  />
                ),
              }}
            />
            <NativeTabs.Trigger.Label
              selectedStyle={{ color: theme.primary.val, fontWeight: "600" }}
            >
              {item.title}
            </NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
        ))}
      </NativeTabs>

      <YStack
        pointerEvents="box-none"
        position="absolute"
        left={0}
        right={0}
        bottom={insets.bottom + 42}
        alignItems="center"
      >
        <CenterFab
          onPress={() => {
            Haptics.selectionAsync();
            setShowCommand(true);
          }}
        />
      </YStack>

      <UnifiedCommandPanel visible={showCommand} onClose={() => setShowCommand(false)} />
    </>
  );
}

function DesktopSidebarLayout() {
  const theme = useAppTheme();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [showCommand, setShowCommand] = useState(false);

  const isActive = (name: string) => {
    if (name === "index") return pathname === "/" || pathname === "/index";
    return pathname === `/${name}` || pathname.startsWith(`/${name}/`);
  };

  const navigateTo = (name: string) => {
    const path = name === "index" ? "/" : `/${name}`;
    (router.navigate as (href: string) => void)(path);
  };

  return (
    <XStack flex={1} backgroundColor="$background">
      <YStack
        width={260}
        borderRightWidth={1}
        borderRightColor="$borderColor"
        backgroundColor="$card"
        paddingHorizontal={16}
        paddingTop={insets.top + 20}
        paddingBottom={insets.bottom + 20}
      >
        <XStack alignItems="center" gap={10} paddingHorizontal={12} marginBottom={32}>
          <YStack
            width={32}
            height={32}
            borderRadius={10}
            backgroundColor={Colors.primary + "15"}
            alignItems="center"
            justifyContent="center"
          >
            <Feather name="layers" size={18} color={Colors.primary} />
          </YStack>
          <Text fontSize={20} fontFamily="$body" fontWeight="700" color="$color">
            Memora
          </Text>
        </XStack>

        <YStack gap={2}>
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.name);
            return (
              <Pressable
                key={item.name}
                onPress={() => navigateTo(item.name)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: 12,
                  backgroundColor: active ? Colors.primary + "12" : "transparent",
                }}
              >
                <Feather
                  name={item.icon}
                  size={18}
                  color={active ? Colors.primary : theme.colorMuted.val}
                />
                <Text
                  fontSize={14}
                  fontFamily="$body"
                  fontWeight={active ? "600" : "400"}
                  color={active ? "$primary" : "$color"}
                >
                  {item.title}
                </Text>
              </Pressable>
            );
          })}
        </YStack>

        <YStack flex={1} />

        <Pressable
          onPress={() => setShowCommand(true)}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            paddingVertical: 12,
            borderRadius: 14,
            backgroundColor: Colors.primary,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Feather name="plus" size={20} color="#FFFFFF" />
          <Text fontSize={14} fontFamily="$body" fontWeight="600" color="#FFFFFF">
            New Memory
          </Text>
        </Pressable>
      </YStack>

      <YStack flex={1}>
        <Slot />
      </YStack>

      <UnifiedCommandPanel visible={showCommand} onClose={() => setShowCommand(false)} />
    </XStack>
  );
}

function MobileTabLayout() {
  const theme = useAppTheme();
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";
  const [showCommand, setShowCommand] = useState(false);
  const webBarHeight = 60;

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: theme.primary.val,
          tabBarInactiveTintColor: theme.colorMuted.val,
          tabBarLabelStyle: isWeb ? styles.webLabel : styles.iosLabel,
          tabBarItemStyle: isWeb ? styles.webTabItem : undefined,
          tabBarStyle: isWeb
            ? [
                styles.webTabBar,
                {
                  backgroundColor: theme.card.val,
                  borderTopColor: theme.borderColor.val,
                  height: webBarHeight,
                },
              ]
            : [styles.iosTabBar, { borderTopColor: theme.borderColor.val }],
          tabBarBackground: () =>
            isIOS ? (
              <BlurView
                intensity={80}
                tint={theme.background.val === "#0F0F1A" ? "dark" : "light"}
                style={StyleSheet.absoluteFill}
              />
            ) : null,
        }}
      >
        {NAV_ITEMS.slice(0, 2).map((item) => (
          <Tabs.Screen
            key={item.name}
            name={item.name}
            options={{
              title: item.title,
              tabBarIcon: ({ color, focused }) =>
                isIOS ? (
                  <SymbolView
                    name={focused ? item.sfIconActive : item.sfIcon}
                    tintColor={color}
                    size={22}
                  />
                ) : (
                  <Feather name={item.icon} size={20} color={color} />
                ),
            }}
          />
        ))}

        <Tabs.Screen
          name="__fab"
          options={{
            title: "",
            tabBarLabel: () => null,
            tabBarButton: () => <CenterFab onPress={() => setShowCommand(true)} />,
          }}
          listeners={{
            tabPress: (e) => {
              e.preventDefault();
              setShowCommand(true);
            },
          }}
        />

        {NAV_ITEMS.slice(2).map((item) => (
          <Tabs.Screen
            key={item.name}
            name={item.name}
            options={{
              title: item.title,
              tabBarIcon: ({ color, focused }) =>
                isIOS ? (
                  <SymbolView
                    name={focused ? item.sfIconActive : item.sfIcon}
                    tintColor={color}
                    size={22}
                  />
                ) : (
                  <Feather name={item.icon} size={20} color={color} />
                ),
            }}
          />
        ))}
      </Tabs>

      <UnifiedCommandPanel visible={showCommand} onClose={() => setShowCommand(false)} />
    </>
  );
}

export default function TabLayout() {
  const isLargeScreen = useIsLargeScreen();

  if (isLargeScreen) return <DesktopSidebarLayout />;
  if (Platform.OS === "android") return <AndroidNativeTabLayout />;
  if (Platform.OS === "ios" && isLiquidGlassAvailable()) return <IOSNativeTabLayout />;
  return <MobileTabLayout />;
}

const styles = StyleSheet.create({
  iosTabBar: {
    position: "absolute",
    backgroundColor: "transparent",
    borderTopWidth: StyleSheet.hairlineWidth,
    elevation: 0,
  },
  iosLabel: { fontFamily: FontFamily.medium, fontSize: 10, fontWeight: "500" },
  webTabBar: {
    borderTopWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  webTabItem: { justifyContent: "center" },
  webLabel: { fontFamily: FontFamily.medium, fontSize: 11, fontWeight: "500" },
});
