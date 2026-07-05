import { Link, Stack } from "expo-router";
import { Text, YStack } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";

export default function NotFoundScreen() {
  const theme = useAppTheme();

  return (
    <>
      <Stack.Screen options={{ title: "Oops!" }} />
      <YStack
        flex={1}
        alignItems="center"
        justifyContent="center"
        padding={20}
        backgroundColor={theme.background.val}
      >
        <Text fontSize={20} fontWeight="700" color={theme.color.val}>
          This screen doesn&apos;t exist.
        </Text>

        <Link href="/" style={{ marginTop: 15, paddingVertical: 15 }}>
          <Text fontSize={14} color={theme.primary.val}>
            Go to home screen!
          </Text>
        </Link>
      </YStack>
    </>
  );
}
