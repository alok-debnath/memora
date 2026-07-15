import React, { useState } from "react";
import { ActivityIndicator, Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { XStack, YStack, Text } from "tamagui";

import { Feather } from "@/lib/icons";
import { useAppTheme } from "@/hooks/useAppTheme";
import { VoiceRecorder } from "@/components/VoiceRecorder";
import { AppButton } from "@/components/ui/AppButton";
import { AppTextField } from "@/components/ui/AppTextField";
import { SelectionTabs } from "@/components/ui/SelectionTabs";
import { spacing } from "@/constants/uiTokens";

type ComposerMode = "voice" | "type";

export function DiaryComposer({
  onSubmit,
  isSaving,
}: {
  onSubmit: (text: string) => Promise<void>;
  isSaving: boolean;
}) {
  const theme = useAppTheme();
  const [mode, setMode] = useState<ComposerMode>("type");
  const [text, setText] = useState("");

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    await onSubmit(trimmed);
    setText("");
  };

  const handleVoiceComplete = (transcript: string) => {
    if (transcript.trim()) {
      setText(transcript);
      setMode("type");
    }
  };

  return (
    <YStack gap={spacing.md}>
      <SelectionTabs<ComposerMode>
        options={[
          {
            value: "type",
            label: "Write",
            icon: <Feather name="edit-3" size={14} color={theme.primary.val} />,
          },
          {
            value: "voice",
            label: "Speak",
            icon: <Feather name="mic" size={14} color={theme.primary.val} />,
          },
        ]}
        value={mode}
        onChange={setMode}
        size="compact"
        accessibilityLabel="Journal capture mode"
      />

      {mode === "voice" ? (
        isSaving ? (
          <YStack alignItems="center" justifyContent="center" paddingVertical={28} gap={16}>
            <ActivityIndicator size="large" color={theme.primary.val} />
            <Text fontSize={14} fontFamily="$body" color={theme.colorMuted.val}>
              Saving entry...
            </Text>
          </YStack>
        ) : (
          <YStack gap={12} paddingVertical={8}>
            <VoiceRecorder onTranscriptionComplete={handleVoiceComplete} inputMode="auto" />
            <Text fontSize={12} color={theme.colorMuted.val} textAlign="center">
              Review the transcript before saving.
            </Text>
          </YStack>
        )
      ) : (
        <>
          <AppTextField
            value={text}
            onChangeText={setText}
            label="Reflection"
            placeholder="What is on your mind?"
            multiline
            style={{ minHeight: 120, fontSize: 15, lineHeight: 22 }}
          />
          <AppButton
            title="Save entry"
            onPress={handleSubmit}
            icon="send"
            loading={isSaving}
            fullWidth
          />
        </>
      )}
    </YStack>
  );
}
