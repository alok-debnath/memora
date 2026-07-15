import React, { useState } from "react";
import { ActivityIndicator, Platform, Pressable } from "react-native";
import * as Haptics from "expo-haptics";
import { XStack, YStack, Text } from "tamagui";

import { Feather } from "@/lib/icons";
import { useAppTheme } from "@/hooks/useAppTheme";
import { VoiceRecorder } from "@/components/VoiceRecorder";
import { GradientButton } from "@/components/ui/GradientButton";
import { SurfaceCard } from "@/components/ui/SurfaceCard";
import { AppTextField } from "@/components/ui/AppTextField";

type ComposerMode = "voice" | "type";

function ModePill({
  active,
  icon,
  label,
  onPress,
}: {
  active: boolean;
  icon: "mic" | "edit-3";
  label: string;
  onPress: () => void;
}) {
  const theme = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 999,
        backgroundColor: active ? theme.primary.val : theme.secondary.val,
      }}
    >
      <Feather
        name={icon}
        size={14}
        color={active ? theme.textInverse.val : theme.colorMuted.val}
      />
      <Text
        fontSize={13}
        fontFamily="$body"
        fontWeight="600"
        color={active ? theme.textInverse.val : theme.colorMuted.val}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function DiaryComposer({
  onSubmit,
  isSaving,
}: {
  onSubmit: (text: string) => Promise<void>;
  isSaving: boolean;
}) {
  const theme = useAppTheme();
  const [mode, setMode] = useState<ComposerMode>("voice");
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
    <SurfaceCard variant="solid" radius={16} padding={14}>
      <YStack gap={12}>
        <XStack gap={8}>
          <ModePill
            active={mode === "voice"}
            icon="mic"
            label="Voice"
            onPress={() => setMode("voice")}
          />
          <ModePill
            active={mode === "type"}
            icon="edit-3"
            label="Type"
            onPress={() => setMode("type")}
          />
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
              <VoiceRecorder onTranscriptionComplete={handleVoiceComplete} inputMode="auto" />
              <Text
                fontSize={13}
                fontFamily="$body"
                color={theme.colorMuted.val}
                textAlign="center"
              >
                Your transcript opens for review before you save.
              </Text>
            </YStack>
          )
        ) : (
          <>
            <AppTextField
              value={text}
              onChangeText={setText}
              label="Journal entry"
              placeholder="Write about your day, thoughts, feelings, or anything on your mind..."
              multiline
              helperText="Memora will structure this into a searchable diary entry."
              style={{ minHeight: 132, fontSize: 15, lineHeight: 22 }}
            />
            <GradientButton
              title="Save & Analyze"
              onPress={handleSubmit}
              icon="send"
              loading={isSaving}
            />
          </>
        )}
      </YStack>
    </SurfaceCard>
  );
}
