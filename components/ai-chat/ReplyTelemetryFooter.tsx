import { Pressable } from "react-native";
import { Text, XStack } from "tamagui";
import { FontFamily } from "@/constants/fonts";
import { withAlpha } from "@/components/ui/themeHelpers";
import { useAppTheme } from "@/hooks/useAppTheme";
import { Feather } from "@/lib/icons";
import { useUIStore } from "@/store/ui";
import type { CardFlow } from "./types";

export function ReplyTelemetryFooter({ turns, flow }: { turns?: number; flow?: CardFlow }) {
  const theme = useAppTheme();
  const openTurnBreakdown = useUIStore((state) => state.openTurnBreakdown);
  const chatTurnId = flow?.chatTurnId;

  if (!chatTurnId || !turns) return null;

  const turnLabel = `${turns} backend ${turns === 1 ? "turn" : "turns"}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${turnLabel}. Open turn breakdown`}
      onPress={() => openTurnBreakdown(chatTurnId)}
      style={({ pressed }) => ({ alignSelf: "flex-start", opacity: pressed ? 0.66 : 1 })}
    >
      <XStack
        alignItems="center"
        gap={5}
        marginTop={6}
        paddingHorizontal={8}
        paddingVertical={4}
        borderRadius={999}
        backgroundColor={withAlpha(theme.primary.val, "10")}
        borderWidth={1}
        borderColor={withAlpha(theme.primary.val, "24")}
      >
        <Feather name="cpu" size={11} color={theme.primary.val} />
        <Text fontSize={11} fontFamily={FontFamily.semiBold} color={theme.primary.val}>
          {turnLabel}
        </Text>
        <Text fontSize={11} fontFamily={FontFamily.regular} color={theme.colorMuted.val}>
          Details
        </Text>
      </XStack>
    </Pressable>
  );
}
