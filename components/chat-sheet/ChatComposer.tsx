import React, { type ComponentRef, useCallback, useEffect, useRef, useState } from "react";
import { Platform, Pressable, TextInput, View } from "react-native";
import * as Haptics from "expo-haptics";
import { SheetTextInput as BottomSheetTextInput } from "@/components/ui/SheetTextInput";
import { YStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import { FontFamily } from "@/constants/fonts";
import { appShadow, withAlpha } from "@/components/ui/themeHelpers";
import { AttachmentPreviewBar } from "@/components/AttachmentPreviewBar";
import { AttachmentPickerButton } from "@/components/AttachmentPickerButton";
import { VoiceRecorder, type VoiceRecorderHandle } from "@/components/VoiceRecorder";
import type { PendingAttachment } from "@/hooks/useFileAttachments";
import { AppIconButton } from "@/components/ui/AppIconButton";

// Memoized with narrow props so message-list updates don't re-render the
// composer subtree (text input, pickers, voice recorder).
export const ChatComposer = React.memo(function ChatComposer({
  isSending,
  onSend,
  onStop,
  prefillText,
  onPrefillConsumed,
  attachments,
  onRemoveAttachment,
  onPickImages,
  onPickCamera,
  onPickDocument,
  driveConnected,
  onRequestDriveAccess,
  standalone = false,
}: {
  isSending: boolean;
  onSend: (text: string) => Promise<void>;
  onStop?: () => void;
  prefillText?: string | null;
  onPrefillConsumed?: () => void;
  attachments: PendingAttachment[];
  onRemoveAttachment: (id: string) => void;
  onPickImages: () => void;
  onPickCamera: () => void;
  onPickDocument: () => void;
  driveConnected: boolean;
  onRequestDriveAccess: () => void;
  standalone?: boolean;
}) {
  const theme = useAppTheme();
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"keyboard" | "voice">("keyboard");
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const ComposerTextInput = standalone ? TextInput : BottomSheetTextInput;
  const recorderRef = useRef<VoiceRecorderHandle>(null);

  // Edit-and-resend: one-shot prefill from a previous user message.
  useEffect(() => {
    if (prefillText == null) return;
    setMode("keyboard");
    setText(prefillText);
    onPrefillConsumed?.();
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [prefillText, onPrefillConsumed]);

  const hasAttachments = attachments.length > 0;
  const canSend = (text.trim().length > 0 || hasAttachments) && !isSending;

  const submit = useCallback(() => {
    const trimmed = text.trim();
    if (isSending) return;
    if (!trimmed && !hasAttachments) return;
    void onSend(trimmed);
    setText("");
  }, [onSend, hasAttachments, isSending, text]);

  // Voice mode hands the finished transcript back to the regular text input
  // instead of sending it — the user reviews/edits, then sends like normal.
  const handleVoiceTranscript = useCallback((transcript: string) => {
    const trimmed = transcript.trim();
    setMode("keyboard");
    if (!trimmed) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setText(trimmed);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

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

  const isVoice = mode === "voice";

  return (
    // Floats as its own capsule, inset from the sheet edges, instead of a
    // flush edge-to-edge bar — that inset + full rounding + shadow is what
    // keeps it from reading as a plain rectangle. No background here: the
    // sheet itself now uses the same color as the message list, so this
    // wrapper is purely layout (padding), not a visible panel.
    <YStack
      pointerEvents="box-none"
      paddingHorizontal={10}
      paddingTop={8}
      paddingBottom={10}
      gap={8}
    >
      {mode === "keyboard" && hasAttachments ? (
        <AttachmentPreviewBar attachments={attachments} onRemove={onRemoveAttachment} />
      ) : null}

      <YStack
        borderRadius={27}
        borderWidth={1}
        borderColor={isVoice ? withAlpha(theme.primary.val, "30") : theme.borderSubtle.val}
        backgroundColor={theme.card.val}
        style={appShadow(theme.color.val, "sm")}
      >
        {/* Plain RN row, not a Tamagui XStack: mixing Tamagui's prop-driven
          alignItems with a raw `style` override (the shadow above) let the
          row fall back to CSS's default align-items:stretch, which silently
          stretched every child to the row's full height — invisible on the
          icon-only buttons, but it turned the filled send button into a
          rectangle. A plain View with an explicit flex style has no such
          ambiguity. */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            minHeight: 54,
            paddingHorizontal: 6,
          }}
        >
          {isVoice ? (
            <>
              <VoiceRecorder
                ref={recorderRef}
                variant="pill"
                autoStart
                onTranscriptionComplete={handleVoiceTranscript}
                onCancel={() => setMode("keyboard")}
                inputMode="auto"
                transcriptionMode="device"
              />
              <Pressable
                onPress={() => {
                  if (recorderRef.current) recorderRef.current.cancel();
                  else setMode("keyboard");
                }}
                hitSlop={8}
                style={{ paddingHorizontal: 10 }}
              >
                {({ pressed }) => (
                  <Text
                    fontSize={13}
                    fontFamily="$body"
                    fontWeight="600"
                    color={theme.colorMuted.val}
                    opacity={pressed ? 0.6 : 1}
                  >
                    Cancel
                  </Text>
                )}
              </Pressable>
            </>
          ) : (
            <>
              <AttachmentPickerButton
                onPickImages={onPickImages}
                onPickCamera={onPickCamera}
                onPickDocument={onPickDocument}
                driveConnected={driveConnected}
                onRequestDriveAccess={onRequestDriveAccess}
                size={20}
              />

              <ComposerTextInput
                ref={inputRef as never}
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
                  paddingHorizontal: 8,
                  paddingVertical: 10,
                  fontSize: 15,
                  fontFamily: FontFamily.regular,
                  color: theme.color.val,
                  backgroundColor: "transparent",
                }}
              />

              <AppIconButton
                icon="mic"
                label="Record a voice message"
                onPress={() => setMode("voice")}
                size="compact"
              />

              {isSending && onStop ? (
                // Cooperative stop for the in-flight turn (takes effect at the
                // next planner checkpoint).
                <AppIconButton
                  icon="square"
                  label="Stop response"
                  onPress={onStop}
                  variant="danger"
                  size="compact"
                />
              ) : (
                <AppIconButton
                  icon="arrow-up"
                  label="Send message"
                  onPress={submit}
                  disabled={!canSend}
                  variant="primary"
                  size="compact"
                />
              )}
            </>
          )}
        </View>
      </YStack>
    </YStack>
  );
});
