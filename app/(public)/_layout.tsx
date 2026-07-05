import { Stack } from "expo-router";
import { useAppTheme } from "@/hooks/useAppTheme";

export default function PublicLayout() {
  const theme = useAppTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        freezeOnBlur: true,
        contentStyle: { backgroundColor: theme.background.val },
      }}
    >
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="shared/[token]" />
    </Stack>
  );
}
