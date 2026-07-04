import { Stack } from "expo-router";
import { useTheme } from "tamagui";

export default function PublicLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        freezeOnBlur: true,
        contentStyle: { backgroundColor: theme.background?.val },
      }}
    >
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="shared/[token]" />
    </Stack>
  );
}
