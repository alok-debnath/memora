import { Link, Stack } from "expo-router";
import { StyleSheet } from "react-native";
import { Text, YStack } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";

export default function NotFoundScreen() {
  const theme = useAppTheme();

  return (
    <>
      <Stack.Screen options={{ title: "Oops!" }} />
      <YStack style={styles.container} backgroundColor="$background">
        <Text style={styles.title} color="$color">This screen doesn&apos;t exist.</Text>

        <Link href="/" style={styles.link}>
          <Text style={styles.linkText} color={theme.primary.val}>Go to home screen!</Text>
        </Link>
      </YStack>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
  linkText: {
    fontSize: 14,
  },
});
