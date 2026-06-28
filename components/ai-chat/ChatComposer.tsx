import React, { type ComponentRef, useCallback, useEffect, useRef, useState } from "react";
import { Platform, Pressable, TextInput } from "react-native";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
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

const BAR_HEIGHTS = [10, 18, 24, 18, 10] as const;

const getSurfaceShadow = (shadowColor: string) =>
  Platform.select({
    ios: {
      shadowColor,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.04,
      shadowRadius: 10,
    },
    android: {
      elevation: 1,
    },
    default: {},
  });

function WaveformBar({ height, delay, color }: { height: number; delay: number; color: string }) {
  const scaleY = useSharedValue(0.4);

  useEffect(() => {
    scaleY.value = withRepeat(
      withDelay(
        delay,
        withSequence(withTiming(1, { duration: 350 }), withTiming(0.25, { duration: 350 })),
      ),
      -1,
      true,
    );
  }, [delay, scaleY]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scaleY: scaleY.value }],
  }));

  return (
    <Animated.View style={[{ width: 3, height, borderRadius: 2, backgroundColor: color }, style]} />
  );
}

function VoiceWaveform({ color }: { color: string }) {
  return (
    <XStack alignItems="center" gap={3} height={28} paddingHorizontal={4}>
      {BAR_HEIGHTS.map((height, index) => (
        <WaveformBar key={index} height={height} delay={index * 90} color={color} />
      ))}
    </XStack>
  );
}

function ModeChip({
  active,
  label,
  icon,
  onPress,
}: {
  active: boolean;
  label: string;
  icon: "type" | "mic";
  onPress: () => void;
}) {
  const theme = useAppTheme();

  return (
    <Pressable onPress={onPress}>
      {({ pressed }) => (
        <XStack
          alignItems="center"
          gap={6}
          paddingHorizontal={12}
          paddingVertical={8}
          borderRadius={999}
          backgroundColor={active ? withAlpha(theme.primary.val, "14") : theme.surface.val}
          borderWidth={1}
          borderColor={active ? withAlpha(theme.primary.val, "28") : theme.borderSubtle.val}
          opacity={pressed ? 0.75 : 1}
        >
          <Feather
            name={icon}
            size={14}
            color={active ? theme.primary.val : theme.colorMuted.val}
          />
          <Text
            fontSize={12}
            fontFamily="$body"
            fontWeight="700"
            color={active ? "$primary" : "$colorMuted"}
          >
            {label}
          </Text>
        </XStack>
      )}
    </Pressable>
  );
}

export function ChatInputBar({
  isSending,
  onSend,
  chatInputMode,
  setChatInputMode,
  attachments,
  onRemoveAttachment,
  onPickImages,
  onPickCamera,
  onPickDocument,
  driveConnected,
  onRequestDriveAccess,
}: {
  isSending: boolean;
  onSend: (text: string, isVoice?: boolean) => void;
  chatInputMode?: "voice" | "keyboard";
  setChatInputMode?: (mode: "voice" | "keyboard") => void;
  attachments?: PendingAttachment[];
  onRemoveAttachment?: (id: string) => void;
  onPickImages?: () => void;
  onPickCamera?: () => void;
  onPickDocument?: () => void;
  driveConnected?: boolean;
  onRequestDriveAccess?: () => void;
}) {
  const theme = useAppTheme();
  const [text, setText] = useState("");
  const inputRef = useRef<ComponentRef<typeof BottomSheetTextInput>>(null);
  const [internalMode, setInternalMode] = useState<"voice" | "keyboard">("keyboard");
  const [voiceLiveTranscript, setVoiceLiveTranscript] = useState("");
  const [isVoicePaused, setIsVoicePaused] = useState(false);

  const mode = chatInputMode ?? internalMode;
  const setMode = setChatInputMode ?? setInternalMode;

  const hasLiveTranscript = voiceLiveTranscript.trim().length > 0;
  const hasAttachments = (attachments?.length ?? 0) > 0;
  const canSend = (text.trim().length > 0 || hasAttachments) && !isSending;

  const handleVoiceComplete = useCallback(
    (transcript: string) => {
      if (!transcript.trim()) return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSend(transcript, true);
    },
    [onSend],
  );

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (isSending) return;
    if (!trimmed && !hasAttachments) return;
    onSend(trimmed, false);
    setText("");
  }, [hasAttachments, isSending, onSend, text]);

  useEffect(() => {
    if (Platform.OS !== "web" || mode !== "keyboard") return;
    const element = inputRef.current as unknown as HTMLElement | null;
    if (!element) return;

    const handler = (event: KeyboardEvent) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        handleSend();
      }
    };

    element.addEventListener("keydown", handler);
    return () => element.removeEventListener("keydown", handler);
  }, [handleSend, mode]);

  if (mode === "voice") {
    return (
      <Animated.View entering={FadeIn.duration(150)}>
        <YStack
          gap={10}
          padding={10}
          borderRadius={24}
          backgroundColor={theme.surfaceElevated.val}
          borderWidth={1}
          borderColor={theme.borderSubtle.val}
          style={getSurfaceShadow(theme.shadowColor.val)}
        >
          <XStack alignItems="center" justifyContent="space-between" gap={12}>
            <YStack flex={1} gap={2}>
              <Text fontSize={13} fontFamily="$body" fontWeight="700" color="$color">
                Voice capture
              </Text>
              <Text fontSize={11} fontFamily="$body" color="$colorMuted">
                Talk naturally. Pause to edit before sending.
              </Text>
            </YStack>
            <ModeChip
              active={false}
              label="Keyboard"
              icon="type"
              onPress={() => setMode("keyboard")}
            />
          </XStack>

          {hasLiveTranscript ? (
            <YStack
              paddingHorizontal={14}
              paddingVertical={12}
              borderRadius={18}
              backgroundColor={theme.surface.val}
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

            <Pressable
              onPress={() => setMode("keyboard")}
              hitSlop={12}
              style={({ pressed }) => ({
                position: "absolute",
                right: 10,
                width: 38,
                height: 38,
                borderRadius: 19,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: theme.surfaceElevated.val,
                borderWidth: 1,
                borderColor: theme.borderSubtle.val,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Feather name="type" size={16} color={theme.colorMuted.val} />
            </Pressable>
          </XStack>
        </YStack>
      </Animated.View>
    );
  }

  return (
    <YStack
      gap={8}
      padding={10}
      borderRadius={24}
      backgroundColor={theme.surfaceElevated.val}
      borderWidth={1}
      borderColor={theme.borderSubtle.val}
      style={getSurfaceShadow(theme.shadowColor.val)}
    >
      <XStack alignItems="center" justifyContent="space-between" gap={10}>
        <XStack gap={8} flex={1}>
          <ModeChip active label="Keyboard" icon="type" onPress={() => setMode("keyboard")} />
          <ModeChip active={false} label="Voice" icon="mic" onPress={() => setMode("voice")} />
        </XStack>
        <Text fontSize={11} fontFamily="$body" color="$colorMuted">
          {hasAttachments
            ? `${attachments?.length ?? 0} attachment${attachments?.length === 1 ? "" : "s"}`
            : "Ask, search, or save"}
        </Text>
      </XStack>

      {attachments && attachments.length > 0 ? (
        <AttachmentPreviewBar
          attachments={attachments}
          onRemove={onRemoveAttachment ?? (() => {})}
        />
      ) : null}

      <XStack
        alignItems="flex-end"
        paddingHorizontal={8}
        paddingVertical={8}
        gap={6}
        borderWidth={1}
        borderRadius={22}
        borderColor={theme.borderSubtle.val}
        backgroundColor={theme.surface.val}
      >
        <AttachmentPickerButton
          onPickImages={onPickImages ?? (() => {})}
          onPickCamera={onPickCamera ?? (() => {})}
          onPickDocument={onPickDocument ?? (() => {})}
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
          returnKeyType="send"
          onSubmitEditing={handleSend}
          editable={!isSending}
          style={{
            flex: 1,
            minHeight: 42,
            maxHeight: 128,
            borderRadius: 18,
            paddingHorizontal: 14,
            paddingVertical: 10,
            fontSize: 15,
            fontFamily: FontFamily.regular,
            color: theme.color.val,
            backgroundColor: "transparent",
          }}
        />

        <Pressable
          onPress={() => setMode("voice")}
          hitSlop={6}
          style={({ pressed }) => ({
            width: 38,
            height: 38,
            borderRadius: 19,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: withAlpha(theme.backgroundStrong.val, "C0"),
            borderWidth: 1,
            borderColor: theme.borderSubtle.val,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Feather name="mic" size={18} color={theme.colorMuted.val} />
        </Pressable>

        <Pressable onPress={handleSend} disabled={!canSend} hitSlop={6}>
          {({ pressed }) => (
            <XStack
              alignItems="center"
              justifyContent="center"
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: canSend ? theme.primary.val : theme.borderColor.val,
                opacity: pressed ? 0.8 : 1,
              }}
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
  );
}
