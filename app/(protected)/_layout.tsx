import { Redirect, Stack, usePathname, useRouter } from "expo-router";
import { ActivityIndicator, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Text, XStack, YStack, useTheme } from "tamagui";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppButton } from "@/components/ui/AppButton";
import { useAuth } from "@/hooks/useAuth";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useIsLargeScreen } from "@/hooks/useIsLargeScreen";
import { ProtectedSheetHost } from "@/components/sheets/ProtectedSheetHost";
import { useUIStore } from "@/store/ui";

const NAV_ITEMS = [
  {
    name: "index" as const,
    title: "Home",
    icon: "home" as const,
  },
  {
    name: "diary" as const,
    title: "Diary",
    icon: "book-open" as const,
  },
  {
    name: "review" as const,
    title: "Review",
    icon: "refresh-cw" as const,
  },
  {
    name: "more" as const,
    title: "More",
    icon: "more-horizontal" as const,
  },
] as const;

function isTabPath(pathname: string) {
  return (
    pathname === "/" || pathname === "/diary" || pathname === "/review" || pathname === "/more"
  );
}

function DesktopProtectedShell() {
  const theme = useAppTheme();
  const router = useRouter();
  const pathname = usePathname();
  const openCommand = useUIStore((s) => s.openCommand);

  const isActive = (name: string) => {
    if (name === "index") return pathname === "/";
    if (name === "more") return !isTabPath(pathname);
    return pathname === `/${name}` || pathname.startsWith(`/${name}/`);
  };

  const navigateTo = (name: string) => {
    const path = name === "index" ? "/" : `/${name}`;
    (router.navigate as (href: string) => void)(path);
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.background.val }}
      edges={["top", "bottom"]}
    >
      <XStack flex={1} backgroundColor="$background">
        <YStack
          width={292}
          borderRightWidth={1}
          borderRightColor="$borderColor"
          backgroundColor="$background"
          paddingHorizontal={20}
          paddingTop={18}
          paddingBottom={20}
        >
          <YStack
            borderRadius={28}
            padding={18}
            marginBottom={18}
            backgroundColor="$card"
            borderWidth={1}
            borderColor="$borderColor"
            gap={16}
          >
            <XStack alignItems="center" gap={12}>
              <YStack
                width={40}
                height={40}
                borderRadius={14}
                backgroundColor={theme.primary.val + "18"}
                alignItems="center"
                justifyContent="center"
              >
                <Feather name="layers" size={20} color={theme.primary.val} />
              </YStack>
              <YStack flex={1}>
                <Text fontSize={22} fontFamily="$heading" fontWeight="700" color="$color">
                  Memora
                </Text>
                <Text fontSize={12} color="$colorMuted">
                  Memory studio
                </Text>
              </YStack>
            </XStack>
            <YStack
              borderRadius={18}
              padding={14}
              backgroundColor={theme.primary.val + "10"}
              gap={8}
            >
              <Text
                fontSize={11}
                letterSpacing={1}
                textTransform="uppercase"
                color="$primary"
                fontWeight="700"
              >
                Quick Capture
              </Text>
              <Text fontSize={13} lineHeight={19} color="$colorMuted">
                Keep the main workspace pinned while you browse secondary pages and settings.
              </Text>
            </YStack>
          </YStack>

          <YStack gap={8}>
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
                    paddingVertical: 14,
                    paddingHorizontal: 14,
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: active ? theme.primary.val + "22" : "transparent",
                    backgroundColor: active ? theme.primary.val + "12" : "transparent",
                  }}
                >
                  <YStack
                    width={36}
                    height={36}
                    borderRadius={12}
                    alignItems="center"
                    justifyContent="center"
                    backgroundColor={active ? theme.primary.val + "18" : theme.secondary.val}
                  >
                    <Feather
                      name={item.icon}
                      size={18}
                      color={active ? theme.primary.val : theme.colorMuted.val}
                    />
                  </YStack>
                  <YStack flex={1} gap={2}>
                    <Text
                      fontSize={15}
                      fontFamily="$body"
                      fontWeight={active ? "700" : "500"}
                      color={active ? "$primary" : "$color"}
                    >
                      {item.title}
                    </Text>
                    <Text fontSize={12} color="$colorMuted">
                      {item.title === "Home"
                        ? "Live memories and reminders"
                        : item.title === "Diary"
                          ? "Structured daily reflection"
                          : item.title === "Review"
                            ? "Spaced repetition queue"
                            : "Secondary pages and settings"}
                    </Text>
                  </YStack>
                </Pressable>
              );
            })}
          </YStack>

          <YStack flex={1} />

          <AppButton
            title="New Memory"
            onPress={openCommand}
            icon="plus"
            variant="gradient"
            fullWidth
          />
        </YStack>

        <YStack flex={1} padding={14}>
          <YStack
            flex={1}
            borderRadius={32}
            overflow="hidden"
            borderWidth={1}
            borderColor="$borderColor"
            backgroundColor="$background"
          >
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: theme.background?.val },
              }}
            />
          </YStack>
        </YStack>
      </XStack>
    </SafeAreaView>
  );
}

export default function ProtectedLayout() {
  const theme = useTheme();
  const { user, isLoading, hasSeenOnboarding } = useAuth();
  const isLargeScreen = useIsLargeScreen();
  const pathname = usePathname();

  if (!hasSeenOnboarding) {
    return null;
  }

  if (isLoading) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" backgroundColor="$background">
        <ActivityIndicator size="large" color={theme.primary?.val} />
      </YStack>
    );
  }

  if (!user) {
    return <Redirect href="/(public)/(auth)/login" />;
  }

  if (isLargeScreen && !isTabPath(pathname)) {
    return (
      <>
        <DesktopProtectedShell />
        <ProtectedSheetHost />
      </>
    );
  }

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.background?.val },
        }}
      />
      <ProtectedSheetHost />
    </>
  );
}
