import React, { type ComponentRef, useCallback, useEffect, useRef, useState } from "react";
import { Platform, Pressable } from "react-native";
import * as Haptics from "expo-haptics";
import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { XStack, YStack, Text } from "tamagui";
import { Feather } from "@/lib/icons";
import { useAppTheme } from "@/hooks/useAppTheme";
import { FontFamily } from "@/constants/fonts";
import { withAlpha } from "@/components/ui/themeHelpers";
import { AttachmentPreviewBar } from "@/components/AttachmentPreviewBar";
import { AttachmentPickerButton } from "@/components/AttachmentPickerButton";
import { VoiceRecorder } from "@/components/VoiceRecorder";
import type { PendingAttachment } from "@/hooks/useFileAttachments";

function RoundIconButton({
  icon,
  onPress,
  accent,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  onPress: () => void;
  accent?: boolean;
}) {
  const theme = useAppTheme();

  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: accent ? withAlpha(theme.primary.val, "14") : theme.card.val,
        borderWidth: 1,
        borderColor: accent ? withAlpha(theme.primary.val, "28") : theme.borderSubtle.val,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Feather name={icon} size={16} color={accent ? theme.primary.val : theme.colorMuted.val} />
    </Pressable>
  );
}

// Memoized with narrow props so message-list updates don't re-render the
// composer subtree (text input, pickers, voice recorder).
export const ChatComposer = React.memo(function ChatComposer({
  isSending,
  onSend,
  attachments,
  onRemoveAttachment,
  onPickImages,
  onPickCamera,
  onPickDocument,
  driveConnected,
  onRequestDriveAccess,
}: {
  isSending: boolean;
  onSend: (text: string) => Promise<void>;
  attachments: PendingAttachment[];
  onRemoveAttachment: (id: string) => void;
  onPickImages: () => void;
  onPickCamera: () => void;
  onPickDocument: () => void;
  driveConnected: boolean;
  onRequestDriveAccess: () => void;
}) {
  const theme = useAppTheme();
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"keyboard" | "voice">("keyboard");
  const [voiceLiveTranscript, setVoiceLiveTranscript] = useState("");
  const [isVoicePaused, setIsVoicePaused] = useState(false);
  const inputRef = useRef<ComponentRef<typeof BottomSheetTextInput>>(null);

  const hasAttachments = attachments.length > 0;
  const hasLiveTranscript = voiceLiveTranscript.trim().length > 0;
  const canSend = (text.trim().length > 0 || hasAttachments) && !isSending;

  const submit = useCallback(() => {
    const trimmed = text.trim();
    if (isSending) return;
    if (!trimmed && !hasAttachments) return;
    void onSend(trimmed);
    setText("");
  }, [onSend, hasAttachments, isSending, text]);

  const handleVoiceComplete = useCallback(
    (transcript: string) => {
      if (!transcript.trim()) return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void onSend(transcript);
    },
    [onSend],
  );

  useEffect(() => {
    if (Platform.OS !== "web" || mode !== "keyboard") return;
    const element = inputRef.current as unknown as HTMLElement | null;
    if (!element) return;

    const handler = (event: KeyboardEvent) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        submit();
      }
    };

    element.addEventListener("keydown", handler);
    return () => element.removeEventListener("keydown", handler);
  }, [mode, submit]);

  return (
    <YStack
      backgroundColor={theme.surface.val}
      borderTopWidth={1}
      borderTopColor={theme.borderSubtle.val}
      paddingHorizontal={12}
      paddingTop={10}
      paddingBottom={10}
      gap={8}
    >
      {mode === "voice" ? (
        <YStack gap={8}>
          {hasLiveTranscript ? (
            <YStack
              paddingHorizontal={14}
              paddingVertical={12}
              borderRadius={18}
              backgroundColor={theme.card.val}
              borderWidth={1}
              borderColor={
                isVoicePaused ? theme.borderSubtle.val : withAlpha(theme.primary.val, "28")
              }
            >
              {isVoicePaused ? (
                <BottomSheetTextInput
                  value={voiceLiveTranscript}
                  onChangeText={setVoiceLiveTranscript}
                  multiline
                  style={{
                    fontSize: 14,
                    fontFamily: FontFamily.regular,
                    color: theme.color.val,
                    lineHeight: 20,
                    padding: 0,
                    textAlignVertical: "top",
                  }}
                />
              ) : (
                <Text fontSize={14} fontFamily="$body" color="$color" lineHeight={20}>
                  {voiceLiveTranscript}
                </Text>
              )}
            </YStack>
          ) : null}

          <XStack
            alignItems="center"
            justifyContent="center"
            position="relative"
            minHeight={72}
            borderRadius={18}
            backgroundColor={withAlpha(theme.primary.val, "08")}
            borderWidth={1}
            borderColor={withAlpha(theme.primary.val, "14")}
          >
            <VoiceRecorder
              onTranscription={setVoiceLiveTranscript}
              onTranscriptionComplete={(transcript) => {
                setVoiceLiveTranscript("");
                setIsVoicePaused(false);
                handleVoiceComplete(transcript);
              }}
              onPauseChange={setIsVoicePaused}
              transcriptOverride={isVoicePaused ? voiceLiveTranscript : undefined}
              compact
              inputMode="auto"
            />
            <XStack position="absolute" right={10}>
              <RoundIconButton icon="type" onPress={() => setMode("keyboard")} />
            </XStack>
          </XStack>
        </YStack>
      ) : (
        <YStack gap={8}>
          {hasAttachments ? (
            <AttachmentPreviewBar attachments={attachments} onRemove={onRemoveAttachment} />
          ) : null}

          <XStack
            alignItems="flex-end"
            paddingHorizontal={8}
            paddingVertical={6}
            gap={6}
            borderWidth={1}
            borderRadius={24}
            borderColor={theme.borderSubtle.val}
            backgroundColor={theme.card.val}
          >
            <AttachmentPickerButton
              onPickImages={onPickImages}
              onPickCamera={onPickCamera}
              onPickDocument={onPickDocument}
              driveConnected={driveConnected}
              onRequestDriveAccess={onRequestDriveAccess}
              size={18}
            />

            <BottomSheetTextInput
              ref={inputRef}
              value={text}
              onChangeText={setText}
              placeholder="Ask Memora anything..."
              placeholderTextColor={theme.colorMuted.val}
              multiline
              editable={!isSending}
              style={{
                flex: 1,
                minHeight: 40,
                maxHeight: 120,
                paddingHorizontal: 12,
                paddingVertical: 10,
                fontSize: 15,
                fontFamily: FontFamily.regular,
                color: theme.color.val,
                backgroundColor: "transparent",
              }}
            />

            <RoundIconButton icon="mic" onPress={() => setMode("voice")} />

            <Pressable onPress={submit} disabled={!canSend} hitSlop={6}>
              {({ pressed }) => (
                <XStack
                  alignItems="center"
                  justifyContent="center"
                  width={38}
                  height={38}
                  borderRadius={19}
                  backgroundColor={canSend ? theme.primary.val : theme.borderColor.val}
                  opacity={pressed ? 0.8 : 1}
                >
                  <Feather
                    name="arrow-up"
                    size={18}
                    color={canSend ? theme.textInverse.val : theme.colorMuted.val}
                  />
                </XStack>
              )}
            </Pressable>
          </XStack>
        </YStack>
      )}
    </YStack>
  );
});
