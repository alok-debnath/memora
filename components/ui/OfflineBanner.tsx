import React from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { XStack, Text } from "tamagui";

import { Feather } from "@/lib/icons";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { withAlpha } from "@/components/ui/themeHelpers";

/** Slim top banner while the device is offline. Convex resyncs automatically on reconnect. */
export function OfflineBanner() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { isOffline } = useNetworkStatus();

  if (!isOffline) return null;

  return (
    <Animated.View
      entering={FadeInUp.duration(200)}
      exiting={FadeOutUp.duration(200)}
      style={{
        position: "absolute",
        top: insets.top + 4,
        left: 16,
        right: 16,
        zIndex: 2000,
        elevation: 2000,
      }}
      pointerEvents="none"
    >
      <XStack
        alignItems="center"
        justifyContent="center"
        gap={8}
        paddingVertical={8}
        paddingHorizontal={14}
        borderRadius={999}
        backgroundColor={withAlpha(theme.backgroundStrong.val, "F0")}
        borderWidth={1}
        borderColor={theme.borderColor.val}
      >
        <Feather name="wifi-off" size={13} color={theme.colorMuted.val} />
        <Text fontSize={12} fontFamily="$body" fontWeight="600" color={theme.colorMuted.val}>
          You're offline — changes sync when you're back
        </Text>
      </XStack>
    </Animated.View>
  );
}
