import React, { useCallback, useMemo, useState } from "react";
import { Platform, Pressable, ActivityIndicator } from "react-native";
import { Feather } from "@/lib/icons";
import * as Haptics from "expo-haptics";
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
import { AppScreen, SectionCard } from "@/components/ui/AppScreen";
import { PageHero } from "@/components/ui/PageHero";
import { SurfaceCard } from "@/components/ui/SurfaceCard";
import { XStack, YStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
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

  const handleDelete = useCallback(
    async (id: Id<"diaryEntries">) => {
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
    },
    [confirm, deleteEntry, token],
  );

  const handleDeleteEntry = useCallback(
    (id: string) => handleDelete(id as Id<"diaryEntries">),
    [handleDelete],
  );

  const diaryEntries = useMemo<DiaryEntry[]>(
    () =>
      entries.map(
        (entry) =>
          ({
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
          }) as DiaryEntry,
      ),
    [entries, user?._id],
  );

  return (
    <AppScreen
      safeTop={false}
      hero={
        <PageHero
          eyebrow="Daily capture"
          title="AI Diary"
          description="Capture voice or typed reflections. Memora turns them into structured entries and insights."
          icon="book-open"
        />
      }
    >
      <SurfaceCard variant="solid" radius={16} padding={14}>
        <YStack gap={12}>
          <XStack gap={8}>
            <Pressable
              onPress={() => setMode("voice")}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 7,
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
                color={mode === "voice" ? theme.textInverse.val : theme.colorMuted.val}
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
                paddingHorizontal: 12,
                paddingVertical: 7,
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
                color={mode === "type" ? theme.textInverse.val : theme.colorMuted.val}
              >
                Type
              </Text>
            </Pressable>
          </XStack>

          {mode === "voice" ? (
            isSaving ? (
              <YStack alignItems="center" justifyContent="center" paddingVertical={28} gap={16}>
                <ActivityIndicator size="large" color={theme.primary.val} />
                <Text fontSize={14} fontFamily="$body" color={theme.colorMuted.val}>
                  Saving entry...
                </Text>
              </YStack>
            ) : (
              <YStack gap={12} paddingVertical={12}>
                <VoiceRecorder
                  onTranscription={setLiveTranscript}
                  onTranscriptionComplete={handleVoiceComplete}
                  onPauseChange={setIsVoicePaused}
                  inputMode="auto"
                />
                {/* Hide while paused — VoiceRecorder shows the editable TextInput internally */}
                {!isVoicePaused && liveTranscript.trim().length > 0 ? (
                  <YStack
                    backgroundColor={theme.card.val}
                    borderRadius={14}
                    borderWidth={1}
                    borderColor={theme.borderColor.val}
                    padding={14}
                    marginHorizontal={4}
                  >
                    <Text fontSize={14} fontFamily="$body" color={theme.color.val} lineHeight={21}>
                      {liveTranscript}
                    </Text>
                  </YStack>
                ) : !isVoicePaused ? (
                  <Text
                    fontSize={13}
                    fontFamily="$body"
                    color={theme.colorMuted.val}
                    textAlign="center"
                  >
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
        </YStack>
      </SurfaceCard>

      <MoodTrendStrip entries={entries} />

      <SectionCard title="Recent entries">
        {entries.length === 0 ? (
          <EmptyState
            icon="book"
            title="No diary entries yet"
            description="Start speaking or typing to create your first entry."
          />
        ) : (
          <YStack gap={12}>
            {diaryEntries.map((entry, i: number) => (
              <DiaryEntryCard key={entry.id} entry={entry} onDelete={handleDeleteEntry} index={i} />
            ))}
          </YStack>
        )}
      </SectionCard>
    </AppScreen>
  );
}
