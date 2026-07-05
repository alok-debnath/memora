import { Feather } from "@/lib/icons";
import { useLocalSearchParams } from "expo-router";
import { useAppRouter as useRouter } from "@/hooks/useAppRouter";
import { useQuery } from "convex/react";
import React from "react";
import { ActivityIndicator, ScrollView, Linking, Pressable } from "react-native";
import { YStack, XStack, Text } from "tamagui";

import { api } from "@/convex/_generated/api";
import { FontFamily } from "@/constants/fonts";
import { useAppTheme } from "@/hooks/useAppTheme";

export default function SharedMemoryScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const theme = useAppTheme();
  const router = useRouter();

  const memory = useQuery(api.memories.getByShareToken, {
    shareToken: token ?? "",
  });

  if (memory === undefined) {
    return (
      <YStack
        flex={1}
        alignItems="center"
        justifyContent="center"
        padding={24}
        backgroundColor={theme.background.val}
      >
        <ActivityIndicator size="large" color={theme.primary.val} />
        <Text
          marginTop={12}
          fontSize={15}
          fontFamily={FontFamily.regular}
          color={theme.colorMuted.val}
        >
          Loading shared memory...
        </Text>
      </YStack>
    );
  }

  if (memory === null) {
    return (
      <YStack
        flex={1}
        alignItems="center"
        justifyContent="center"
        padding={24}
        backgroundColor={theme.background.val}
      >
        <Feather name="alert-circle" size={48} color={theme.colorMuted.val} />
        <Text marginTop={16} fontSize={22} fontFamily={FontFamily.bold} color={theme.color.val}>
          Memory Not Found
        </Text>
        <Text
          marginTop={8}
          fontSize={15}
          fontFamily={FontFamily.regular}
          textAlign="center"
          color={theme.colorMuted.val}
        >
          This shared memory may have expired or been removed.
        </Text>
        <Pressable
          style={{
            marginTop: 24,
            paddingHorizontal: 32,
            paddingVertical: 14,
            borderRadius: 14,
            backgroundColor: theme.primary.val,
          }}
          onPress={() => router.replace("/(protected)/(tabs)")}
        >
          <Text
            style={{
              color: theme.textInverse.val,
              fontSize: 16,
              fontFamily: FontFamily.semiBold,
            }}
          >
            Go Home
          </Text>
        </Pressable>
      </YStack>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background.val }}
      contentContainerStyle={{
        padding: 20,
        maxWidth: 600,
        alignSelf: "center",
        width: "100%",
      }}
    >
      <YStack alignItems="center" marginBottom={20}>
        <XStack
          flexDirection="row"
          alignItems="center"
          gap={6}
          paddingHorizontal={14}
          paddingVertical={6}
          borderRadius={20}
          backgroundColor={theme.primary.val + "15"}
        >
          <Feather name="share-2" size={14} color={theme.primary.val} />
          <Text fontSize={13} fontFamily={FontFamily.medium} style={{ color: theme.primary.val }}>
            Shared Memory
          </Text>
        </XStack>
      </YStack>

      <YStack
        borderRadius={16}
        borderWidth={1}
        padding={20}
        backgroundColor={theme.card.val}
        borderColor={theme.borderColor.val}
      >
        <Text
          fontSize={12}
          fontFamily={FontFamily.regular}
          marginBottom={10}
          color={theme.colorMuted.val}
        >
          Captured {new Date(memory._creationTime).toLocaleDateString()}
        </Text>
        <Text fontSize={24} fontFamily={FontFamily.bold} marginBottom={12} color={theme.color.val}>
          {memory.title}
        </Text>

        <Text
          fontSize={16}
          fontFamily={FontFamily.regular}
          lineHeight={24}
          marginBottom={16}
          color={theme.color.val}
        >
          {memory.content}
        </Text>

        {(memory.people?.length ?? 0) > 0 && (
          <YStack marginTop={12}>
            <Text
              fontSize={12}
              fontFamily={FontFamily.semiBold}
              marginBottom={4}
              color={theme.colorMuted.val}
            >
              People mentioned
            </Text>
            <Text fontSize={14} fontFamily={FontFamily.regular} color={theme.color.val}>
              {(memory.people ?? []).join(", ")}
            </Text>
          </YStack>
        )}

        {(memory.locations?.length ?? 0) > 0 && (
          <YStack marginTop={12}>
            <Text
              fontSize={12}
              fontFamily={FontFamily.semiBold}
              marginBottom={4}
              color={theme.colorMuted.val}
            >
              Locations
            </Text>
            <Text fontSize={14} fontFamily={FontFamily.regular} color={theme.color.val}>
              {(memory.locations ?? []).join(", ")}
            </Text>
          </YStack>
        )}

        {(memory.linkedUrls?.length ?? 0) > 0 && (
          <YStack marginTop={12}>
            <Text
              fontSize={12}
              fontFamily={FontFamily.semiBold}
              marginBottom={4}
              color={theme.colorMuted.val}
            >
              Links
            </Text>
            <YStack gap={8}>
              {(memory.linkedUrls ?? []).map((url: string) => (
                <Pressable
                  key={url}
                  onPress={() => Linking.openURL(url)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    borderRadius: 10,
                    marginTop: 6,
                    backgroundColor: theme.borderColor.val,
                  }}
                >
                  <Feather name="link" size={12} color={theme.primary.val} />
                  <Text
                    fontSize={13}
                    fontFamily={FontFamily.medium}
                    flex={1}
                    numberOfLines={1}
                    style={{ color: theme.primary.val }}
                  >
                    {url}
                  </Text>
                </Pressable>
              ))}
            </YStack>
          </YStack>
        )}

        {(memory.extractedActions?.length ?? 0) > 0 && (
          <YStack marginTop={12}>
            <Text
              fontSize={12}
              fontFamily={FontFamily.semiBold}
              marginBottom={4}
              color={theme.colorMuted.val}
            >
              Suggested Actions
            </Text>
            <YStack gap={8} marginTop={6}>
              {(memory.extractedActions ?? []).map((item: { action: string }, index: number) => (
                <XStack key={`${item.action}-${index}`} alignItems="center" gap={8}>
                  <Feather name="check-circle" size={14} color={theme.primary.val} />
                  <Text fontSize={14} fontFamily={FontFamily.regular} color={theme.color.val}>
                    {item.action}
                  </Text>
                </XStack>
              ))}
            </YStack>
          </YStack>
        )}
      </YStack>

      <YStack alignItems="center" marginTop={32} paddingBottom={40}>
        <Text fontSize={13} fontFamily={FontFamily.regular} color={theme.colorMuted.val}>
          Shared via Memora
        </Text>
      </YStack>
    </ScrollView>
  );
}
