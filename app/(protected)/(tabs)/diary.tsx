import React, { useState } from "react";
import { Platform, TextInput, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { Feather } from "@/lib/icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInUp } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import type { DiaryEntry } from "@/types/memory";
import { DiaryEntryCard } from "@/components/DiaryEntryCard";
import { MoodTrendStrip } from "@/components/MoodTrendStrip";
import { VoiceRecorder } from "@/components/VoiceRecorder";
import { GradientButton } from "@/components/ui/GradientButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { XStack, YStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import { FontFamily } from "@/constants/fonts";
import { useTabBarBottomPadding } from "@/hooks/useTabBarBottomPadding";
import { useAppConfirm } from "@/components/ui/confirm/AppConfirmProvider";
import { AppTextField } from "@/components/ui/AppTextField";

type DiaryEntryItem = {
  _id: Id<"diaryEntries">;
  _creationTime: number;
  rawText: string;
  correctedText?: string;
  mood?: string;
  energyLevel?: string;
  topics: string[];
  summary?: string;
  structuredInsights?: Array<{ insight: string; category: string }>;
  habitsDetected?: Array<{
    habit: string;
    sentiment: "positive" | "negative" | "neutral";
    frequencyHint?: string;
  }>;
  personalityTraits?: Array<{ trait: string; evidence: string }>;
  likes?: string[];
  dislikes?: string[];
  actionItems?: string[];
};

export default function DiaryScreen() {
  const theme = useAppTheme();
  const { confirm } = useAppConfirm();
  const { user, token } = useAuth();
  const tabBarPadding = useTabBarBottomPadding();

  const entries = (useQuery(api.diary.list, token ? { token, limit: 100 } : "skip") ??
    []) as DiaryEntryItem[];
  const createEntry = useMutation(api.diary.create);
  const deleteEntry = useMutation(api.diary.remove);

  const [diaryText, setDiaryText] = useState("");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [isVoicePaused, setIsVoicePaused] = useState(false);
  const [mode, setMode] = useState<"voice" | "type">("voice");
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async () => {
    if (!diaryText.trim() || !token) return;
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    setIsSaving(true);
    try {
      await createEntry({ token, rawText: diaryText.trim() });
      setDiaryText("");
    } finally {
      setIsSaving(false);
    }
  };

  const handleVoiceComplete = async (text: string) => {
    if (!text.trim() || !token) return;
    setLiveTranscript("");
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    setIsSaving(true);
    try {
      await createEntry({ token, rawText: text.trim() });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: Id<"diaryEntries">) => {
    const confirmed = await confirm({
      title: "Delete Entry",
      message: "Are you sure?",
      confirmLabel: "Delete",
      tone: "destructive",
      icon: "trash-2",
    });
    if (confirmed) {
      deleteEntry({ token: token!, id });
    }
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.background.val }}
      edges={["top", "bottom"]}
    >
      <YStack flex={1} backgroundColor="$background">
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: tabBarPadding,
            paddingTop: 12,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View entering={FadeInUp.duration(400)}>
            <Card
              style={{
                marginBottom: 14,
                padding: 18,
                borderRadius: 24,
                backgroundColor: theme.card.val,
              }}
            >
              <XStack alignItems="flex-start" justifyContent="space-between" gap={12}>
                <YStack flex={1} gap={6}>
                  <Badge label="Daily capture" color={theme.primary.val} />
                  <Text
                    fontSize={28}
                    lineHeight={32}
                    fontFamily="$heading"
                    fontWeight="700"
                    color="$color"
                  >
                    AI Diary
                  </Text>
                  <Text fontSize={14} lineHeight={20} fontFamily="$body" color="$colorMuted">
                    Capture voice or typed reflections. Memora turns them into structured entries
                    and insights.
                  </Text>
                </YStack>
                <Pressable hitSlop={8}>
                  <Feather name="info" size={20} color={theme.colorMuted.val} />
                </Pressable>
              </XStack>
            </Card>
          </Animated.View>

          <Card
            style={{
              padding: 16,
              borderRadius: 24,
              backgroundColor: theme.card.val,
            }}
          >
            <XStack gap={8} marginBottom={14}>
              <Pressable
                onPress={() => setMode("voice")}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  paddingHorizontal: 14,
                  paddingVertical: 9,
                  borderRadius: 999,
                  backgroundColor: mode === "voice" ? theme.primary.val : theme.secondary.val,
                }}
              >
                <Feather
                  name="mic"
                  size={14}
                  color={mode === "voice" ? theme.textInverse.val : theme.colorMuted.val}
                />
                <Text
                  fontSize={13}
                  fontFamily="$body"
                  fontWeight="600"
                  color={mode === "voice" ? "$textInverse" : "$colorMuted"}
                >
                  Voice
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setMode("type")}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  paddingHorizontal: 14,
                  paddingVertical: 9,
                  borderRadius: 999,
                  backgroundColor: mode === "type" ? theme.primary.val : theme.secondary.val,
                }}
              >
                <Feather
                  name="edit-3"
                  size={14}
                  color={mode === "type" ? theme.textInverse.val : theme.colorMuted.val}
                />
                <Text
                  fontSize={13}
                  fontFamily="$body"
                  fontWeight="600"
                  color={mode === "type" ? "$textInverse" : "$colorMuted"}
                >
                  Type
                </Text>
              </Pressable>
            </XStack>

            {mode === "voice" ? (
              isSaving ? (
                <YStack alignItems="center" justifyContent="center" paddingVertical={28} gap={16}>
                  <ActivityIndicator size="large" color={theme.primary.val} />
                  <Text fontSize={14} fontFamily="$body" color="$colorMuted">
                    Saving entry...
                  </Text>
                </YStack>
              ) : (
                <YStack gap={12} paddingVertical={20}>
                  <VoiceRecorder
                    onTranscription={setLiveTranscript}
                    onTranscriptionComplete={handleVoiceComplete}
                    onPauseChange={setIsVoicePaused}
                    inputMode="auto"
                  />
                  {/* Hide while paused — VoiceRecorder shows the editable TextInput internally */}
                  {!isVoicePaused && liveTranscript.trim().length > 0 ? (
                    <YStack
                      backgroundColor="$card"
                      borderRadius={14}
                      borderWidth={1}
                      borderColor="$borderColor"
                      padding={14}
                      marginHorizontal={4}
                    >
                      <Text fontSize={14} fontFamily="$body" color="$color" lineHeight={21}>
                        {liveTranscript}
                      </Text>
                    </YStack>
                  ) : !isVoicePaused ? (
                    <Text fontSize={13} fontFamily="$body" color="$colorMuted" textAlign="center">
                      Tap to start — speak naturally. Entry is analyzed after you stop.
                    </Text>
                  ) : null}
                </YStack>
              )
            ) : (
              <>
                <AppTextField
                  value={diaryText}
                  onChangeText={setDiaryText}
                  label="Journal entry"
                  placeholder="Write about your day, thoughts, feelings, or anything on your mind..."
                  multiline
                  helperText="Memora will structure this into a searchable diary entry."
                  containerStyle={{ marginBottom: 12 }}
                  style={{ minHeight: 156, fontSize: 15, lineHeight: 22 }}
                />
                <GradientButton
                  title="Save & Analyze"
                  onPress={handleSubmit}
                  icon="send"
                  loading={isSaving}
                  style={{ marginTop: 12 }}
                />
              </>
            )}
          </Card>

          <YStack marginTop={16}>
            <MoodTrendStrip entries={entries} />
            <Text
              fontSize={11}
              fontFamily="$body"
              color="$colorMuted"
              letterSpacing={0.8}
              marginBottom={12}
              textTransform="uppercase"
            >
              Recent entries
            </Text>
            {entries.length === 0 ? (
              <EmptyState
                icon="book"
                title="No diary entries yet"
                description="Start speaking or typing to create your first entry."
              />
            ) : (
              <YStack gap={12}>
                {entries.map((entry, i: number) => (
                  <DiaryEntryCard
                    key={entry._id}
                    entry={
                      {
                        ...entry,
                        id: entry._id,
                        userId: user?._id ?? ("" as never),
                        mood: entry.mood as DiaryEntry["mood"],
                        energyLevel: entry.energyLevel as DiaryEntry["energyLevel"],
                        createdAt: new Date(entry._creationTime).toISOString(),
                        updatedAt: new Date(entry._creationTime).toISOString(),
                        habitsDetected: entry.habitsDetected ?? [],
                        personalityTraits: entry.personalityTraits ?? [],
                        likes: entry.likes ?? [],
                        dislikes: entry.dislikes ?? [],
                        actionItems: entry.actionItems ?? [],
                      } as DiaryEntry
                    }
                    onDelete={() => handleDelete(entry._id)}
                    index={i}
                  />
                ))}
              </YStack>
            )}
          </YStack>
        </ScrollView>
      </YStack>
    </SafeAreaView>
  );
}
