import React from "react";
import { ActivityIndicator } from "react-native";
import { Text, YStack } from "tamagui";
import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import { Card } from "@/components/ui/Card";
import { useAppTheme } from "@/hooks/useAppTheme";

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const theme = useAppTheme();
  const adminStatus = useQuery(api.auth.getAdminStatus);

  if (adminStatus === undefined) {
    return (
      <YStack alignItems="center" paddingVertical={36}>
        <ActivityIndicator color={theme.destructive.val} />
      </YStack>
    );
  }

  if (!adminStatus.isAdmin) {
    return (
      <Card style={{ borderRadius: 24 }}>
        <YStack gap={10} alignItems="center" paddingVertical={18}>
          <Text fontSize={18} fontFamily="$heading" fontWeight="700" color={theme.color.val}>
            Admin access required
          </Text>
          <Text fontSize={13} lineHeight={18} color={theme.colorMuted.val} textAlign="center">
            This section is restricted to admin accounts.
          </Text>
        </YStack>
      </Card>
    );
  }

  return <>{children}</>;
}
