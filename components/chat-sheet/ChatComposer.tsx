import React, { type ComponentRef, useCallback, useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import * as Haptics from "expo-haptics";
import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { YStack, Text } from "tamagui";
import { Feather } from "@/lib/icons";
import { useAppTheme } from "@/hooks/useAppTheme";
import { FontFamily } from "@/constants/fonts";
import { appShadow, withAlpha } from "@/components/ui/themeHelpers";
import { AttachmentPreviewBar } from "@/components/AttachmentPreviewBar";
import { AttachmentPickerButton } from "@/components/AttachmentPickerButton";
import { VoiceRecorder, type VoiceRecorderHandle } from "@/components/VoiceRecorder";
import type { PendingAttachment } from "@/hooks/useFileAttachments";

// Ghost icon button — no border, no background fill. Modern chat inputs
// (iMessage/ChatGPT-style) keep side controls flat; only the input field and
// the send action get any surface of their own.
function GhostIconButton({
  icon,
  onPress,
  size = 20,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  onPress: () => void;
  size?: number;
}) {
  const theme = useAppTheme();

  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => ({
        width: 34,
        height: 34,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.5 : 1,
      })}
    >
      <Feather name={icon} size={size} color={theme.colorMuted.val} />
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
  const inputRef = useRef<ComponentRef<typeof BottomSheetTextInput>>(null);
  const recorderRef = useRef<VoiceRecorderHandle>(null);

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
    <YStack paddingHorizontal={10} paddingTop={8} paddingBottom={10} gap={8}>
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
                onTranscription={() => {}}
                onTranscriptionComplete={handleVoiceTranscript}
                onCancel={() => setMode("keyboard")}
                inputMode="auto"
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
                    color="$colorMuted"
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
                  paddingHorizontal: 8,
                  paddingVertical: 10,
                  fontSize: 15,
                  fontFamily: FontFamily.regular,
                  color: theme.color.val,
                  backgroundColor: "transparent",
                }}
              />

              <GhostIconButton icon="mic" onPress={() => setMode("voice")} />

              <Pressable onPress={submit} disabled={!canSend} hitSlop={6}>
                {({ pressed }) => (
                  <View
                    style={[
                      styles.sendButton,
                      {
                        backgroundColor: canSend ? theme.primary.val : theme.borderColor.val,
                        opacity: pressed ? 0.8 : 1,
                      },
                    ]}
                  >
                    <Feather
                      name="arrow-up"
                      size={17}
                      color={canSend ? theme.textInverse.val : theme.colorMuted.val}
                    />
                  </View>
                )}
              </Pressable>
            </>
          )}
        </View>
      </YStack>
    </YStack>
  );
});

const styles = StyleSheet.create({
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
});
