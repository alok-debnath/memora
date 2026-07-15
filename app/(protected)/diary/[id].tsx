import React, { useCallback, useState } from "react";
import { ActivityIndicator } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { XStack, YStack, Text } from "tamagui";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Feather } from "@/lib/icons";
import { useAuth } from "@/hooks/useAuth";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useSemanticColors } from "@/hooks/useSemanticColors";
import { useAppRouter as useRouter } from "@/hooks/useAppRouter";
import { useAppConfirm } from "@/components/ui/confirm/AppConfirmProvider";
import { AppScreen, SectionCard } from "@/components/ui/AppScreen";
import { AppButton } from "@/components/ui/AppButton";
import { AppTextField } from "@/components/ui/AppTextField";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SurfaceCard } from "@/components/ui/SurfaceCard";
import { AdaptiveGrid } from "@/components/ui/Responsive";
import { moodIcons, moodLabels, type Mood } from "@/constants/categories";

function formatFullDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function DiaryEntryScreen() {
  const theme = useAppTheme();
  const semantic = useSemanticColors();
  const router = useRouter();
  const { confirm } = useAppConfirm();
  const { token } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();

  const entry = useQuery(api.diary.getEntry, token && id ? { token, id } : "skip");
  const updateEntry = useMutation(api.diary.update);
  const deleteEntry = useMutation(api.diary.remove);

  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const startEditing = useCallback(() => {
    if (!entry) return;
    setEditText(entry.rawText ?? entry.correctedText ?? "");
    setIsEditing(true);
  }, [entry]);

  const handleSave = useCallback(async () => {
    if (!token || !entry || !editText.trim()) return;
    setIsSaving(true);
    try {
      await updateEntry({ token, id: entry._id, rawText: editText.trim() });
      setIsEditing(false);
      setShowRaw(false);
    } finally {
      setIsSaving(false);
    }
  }, [token, entry, editText, updateEntry]);

  const handleDelete = useCallback(async () => {
    if (!token || !entry) return;
    const confirmed = await confirm({
      title: "Delete Entry",
      message: "This diary entry will be permanently deleted.",
      confirmLabel: "Delete",
      tone: "destructive",
      icon: "trash-2",
    });
    if (!confirmed) return;
    await deleteEntry({ token, id: entry._id as Id<"diaryEntries"> });
    router.back();
  }, [token, entry, confirm, deleteEntry, router]);

  if (entry === undefined) {
    return (
      <AppScreen title="Diary entry" showBack fallbackHref="/diary">
        <YStack alignItems="center" paddingVertical={60}>
          <ActivityIndicator size="large" color={theme.primary.val} />
        </YStack>
      </AppScreen>
    );
  }

  if (entry === null) {
    return (
      <AppScreen title="Diary entry" showBack fallbackHref="/diary">
        <EmptyState
          icon="book"
          title="Entry not found"
          description="This diary entry doesn't exist or was deleted."
        />
      </AppScreen>
    );
  }

  const mood = entry.mood as Mood | undefined;
  const moodColor = mood ? semantic.mood[mood] : undefined;
  const isProcessing = !entry.summary && entry.embeddingState !== "ready";
  const displayText = showRaw
    ? (entry.rawText ?? "")
    : (entry.correctedText ?? entry.rawText ?? "");
  const hasBothVersions = !!entry.correctedText && !!entry.rawText;

  return (
    <AppScreen title="Diary entry" showBack fallbackHref="/diary">
      <YStack gap={14}>
        <SurfaceCard variant="solid" radius={16} padding={16}>
          <YStack gap={12}>
            <XStack alignItems="center" justifyContent="space-between" gap={8} flexWrap="wrap">
              <Text fontSize={13} fontFamily="$body" fontWeight="600" color={theme.colorMuted.val}>
                {formatFullDate(entry._creationTime)}
              </Text>
              <XStack gap={6} alignItems="center" flexWrap="wrap">
                {mood ? (
                  <XStack
                    backgroundColor={(moodColor ?? "") + "18"}
                    alignItems="center"
                    paddingHorizontal={10}
                    paddingVertical={5}
                    borderRadius={999}
                    gap={4}
                  >
                    <Feather name={moodIcons[mood]} size={13} color={moodColor} />
                    <Text fontSize={12} fontFamily="$body" fontWeight="600" color={moodColor}>
                      {moodLabels[mood]}
                    </Text>
                  </XStack>
                ) : null}
                {entry.energyLevel ? (
                  <Badge
                    label={`Energy ${entry.energyLevel}`}
                    color={
                      entry.energyLevel === "high"
                        ? semantic.status.success
                        : entry.energyLevel === "medium"
                          ? semantic.status.warning
                          : semantic.status.error
                    }
                    small
                  />
                ) : null}
                {isProcessing ? (
                  <Badge label="Analyzing…" color={semantic.status.info} small />
                ) : null}
              </XStack>
            </XStack>

            {isEditing ? (
              <YStack gap={12}>
                <AppTextField
                  value={editText}
                  onChangeText={setEditText}
                  label="Entry text"
                  multiline
                  helperText="Saving re-runs Memora's analysis on the new text."
                  style={{ minHeight: 180, fontSize: 15, lineHeight: 22 }}
                />
                <XStack gap={10}>
                  <AppButton
                    title="Cancel"
                    variant="secondary"
                    onPress={() => setIsEditing(false)}
                    style={{ flex: 1 }}
                  />
                  <AppButton
                    title="Save & Reanalyze"
                    icon="check"
                    onPress={handleSave}
                    loading={isSaving}
                    disabled={!editText.trim()}
                    style={{ flex: 1 }}
                  />
                </XStack>
              </YStack>
            ) : (
              <YStack gap={10}>
                <Text fontSize={15} fontFamily="$body" lineHeight={23} color={theme.color.val}>
                  {displayText}
                </Text>
                {hasBothVersions ? (
                  <XStack>
                    <AppButton
                      title={showRaw ? "Show corrected" : "Show original"}
                      variant="ghost"
                      size="sm"
                      icon={showRaw ? "check-circle" : "file-text"}
                      onPress={() => setShowRaw((value) => !value)}
                    />
                  </XStack>
                ) : null}
              </YStack>
            )}
          </YStack>
        </SurfaceCard>

        {!isEditing ? (
          <XStack gap={10}>
            <AppButton
              title="Edit"
              icon="edit-3"
              variant="secondary"
              onPress={startEditing}
              style={{ flex: 1 }}
            />
            <AppButton
              title="Delete"
              icon="trash-2"
              variant="secondary"
              tone="error"
              onPress={handleDelete}
              style={{ flex: 1 }}
            />
          </XStack>
        ) : null}

        <AdaptiveGrid minimumColumnWidth={360} maximumColumns={2} gap={14}>
          {entry.summary ? (
            <SectionCard title="Summary" eyebrow="AI analysis">
              <Text fontSize={14} fontFamily="$body" lineHeight={21} color={theme.color.val}>
                {entry.summary}
              </Text>
            </SectionCard>
          ) : null}

          {(entry.topics?.length ?? 0) > 0 ? (
            <SectionCard title="Topics">
              <XStack flexWrap="wrap" gap={8}>
                {entry.topics!.map((topic) => (
                  <Badge key={topic} label={topic} small />
                ))}
              </XStack>
            </SectionCard>
          ) : null}

          {(entry.structuredInsights?.length ?? 0) > 0 ? (
            <SectionCard title="Insights">
              <YStack gap={10}>
                {entry.structuredInsights!.map((insight, index) => (
                  <XStack key={index} alignItems="flex-start" gap={8}>
                    <Feather name="star" size={13} color={theme.primary.val} />
                    <YStack flex={1} gap={2}>
                      <Text
                        fontSize={13}
                        fontFamily="$body"
                        lineHeight={19}
                        color={theme.color.val}
                      >
                        {insight.insight}
                      </Text>
                      <Text fontSize={11} fontFamily="$body" color={theme.colorMuted.val}>
                        {insight.category}
                      </Text>
                    </YStack>
                  </XStack>
                ))}
              </YStack>
            </SectionCard>
          ) : null}

          {(entry.habitsDetected?.length ?? 0) > 0 ? (
            <SectionCard title="Habits">
              <YStack gap={10}>
                {entry.habitsDetected!.map((habit, index) => (
                  <XStack key={index} alignItems="center" gap={8}>
                    <Feather
                      name={
                        habit.sentiment === "positive"
                          ? "trending-up"
                          : habit.sentiment === "negative"
                            ? "trending-down"
                            : "minus"
                      }
                      size={14}
                      color={
                        habit.sentiment === "positive"
                          ? semantic.status.success
                          : habit.sentiment === "negative"
                            ? semantic.status.error
                            : semantic.status.info
                      }
                    />
                    <YStack flex={1}>
                      <Text fontSize={13} fontFamily="$body" color={theme.color.val}>
                        {habit.habit}
                      </Text>
                      {habit.frequencyHint ? (
                        <Text fontSize={11} fontFamily="$body" color={theme.colorMuted.val}>
                          {habit.frequencyHint}
                        </Text>
                      ) : null}
                    </YStack>
                  </XStack>
                ))}
              </YStack>
            </SectionCard>
          ) : null}

          {(entry.likes?.length ?? 0) > 0 || (entry.dislikes?.length ?? 0) > 0 ? (
            <SectionCard title="Likes & dislikes">
              <YStack gap={8}>
                {entry.likes?.map((like) => (
                  <XStack key={`like-${like}`} alignItems="center" gap={8}>
                    <Feather name="thumbs-up" size={13} color={semantic.status.success} />
                    <Text flex={1} fontSize={13} fontFamily="$body" color={theme.color.val}>
                      {like}
                    </Text>
                  </XStack>
                ))}
                {entry.dislikes?.map((dislike) => (
                  <XStack key={`dislike-${dislike}`} alignItems="center" gap={8}>
                    <Feather name="thumbs-down" size={13} color={semantic.status.error} />
                    <Text flex={1} fontSize={13} fontFamily="$body" color={theme.color.val}>
                      {dislike}
                    </Text>
                  </XStack>
                ))}
              </YStack>
            </SectionCard>
          ) : null}

          {(entry.actionItems?.length ?? 0) > 0 ? (
            <SectionCard title="Action items">
              <YStack gap={8}>
                {entry.actionItems!.map((item) => (
                  <XStack key={item} alignItems="flex-start" gap={8}>
                    <Feather name="check-circle" size={13} color={theme.primary.val} />
                    <Text
                      flex={1}
                      fontSize={13}
                      fontFamily="$body"
                      lineHeight={19}
                      color={theme.color.val}
                    >
                      {item}
                    </Text>
                  </XStack>
                ))}
              </YStack>
            </SectionCard>
          ) : null}

          {(entry.personalityTraits?.length ?? 0) > 0 ? (
            <SectionCard title="Personality signals">
              <YStack gap={10}>
                {entry.personalityTraits!.map((trait, index) => (
                  <YStack key={index} gap={2}>
                    <Text fontSize={13} fontFamily="$body" fontWeight="600" color={theme.color.val}>
                      {trait.trait}
                    </Text>
                    <Text
                      fontSize={12}
                      fontFamily="$body"
                      lineHeight={17}
                      color={theme.colorMuted.val}
                    >
                      {trait.evidence}
                    </Text>
                  </YStack>
                ))}
              </YStack>
            </SectionCard>
          ) : null}
        </AdaptiveGrid>
      </YStack>
    </AppScreen>
  );
}
