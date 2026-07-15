import React, { useEffect, useImperativeHandle, useRef, useState } from "react";
import { Platform, Pressable, TextInput } from "react-native";
import { useAction, useMutation } from "convex/react";
import { File } from "expo-file-system";
import { useAudioRecorder } from "@siteed/audio-studio";
import * as Haptics from "expo-haptics";
import { Feather } from "@/lib/icons";
import { api } from "@/convex/_generated/api";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useOnDeviceDictation } from "@/hooks/useOnDeviceDictation";
import { Text, XStack, YStack } from "tamagui";
import { BottomSheetAwareTextInput } from "@/components/ui/BottomSheetAwareTextInput";
import {
  prepareAudioForTranscription,
  TRANSCRIPTION_AUDIO_SAMPLE_RATE,
} from "@/lib/audio/transcriptionPreprocessor";

export type VoiceInputMode = "standard" | "continuous" | "walkie-talkie" | "auto";
export type VoiceTranscriptionMode = "cloud" | "device";
const MAX_DURATION_MS = 10 * 60 * 1000;

interface VoiceRecorderProps {
  onTranscription?: (text: string) => void;
  onTranscriptionComplete?: (text: string) => void;
  variant?: "panel" | "pill";
  inputMode?: VoiceInputMode;
  onPauseChange?: (isPaused: boolean) => void;
  onCancel?: () => void;
  autoStart?: boolean;
  transcriptOverride?: string;
  /** Select the transcription implementation for this product flow. */
  transcriptionMode?: VoiceTranscriptionMode;
  /** Register the editable transcript with a containing Gorhom bottom sheet. */
  withinBottomSheet?: boolean;
}

export interface VoiceRecorderHandle {
  cancel: () => void;
}

function formatDuration(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function cleanupRecordingUri(uri: string | null | undefined) {
  if (!uri) return;
  if (Platform.OS === "web") {
    if (uri.startsWith("blob:")) URL.revokeObjectURL(uri);
    return;
  }
  try {
    new File(uri).delete();
  } catch {
    /* cache cleanup is best effort */
  }
}

export const VoiceRecorder = React.forwardRef<VoiceRecorderHandle, VoiceRecorderProps>(
  function VoiceRecorder(
    {
      onTranscription,
      onTranscriptionComplete,
      variant = "panel",
      onPauseChange,
      onCancel,
      autoStart,
      transcriptOverride,
      transcriptionMode = "cloud",
      withinBottomSheet = false,
    },
    ref,
  ) {
    const theme = useAppTheme();
    const recorder = useAudioRecorder();
    const createUpload = useMutation(api.transcriptionJobs.createUpload);
    const attachUpload = useMutation(api.transcriptionJobs.attachUpload);
    const transcribe = useAction(api.actions.transcribeAudio.transcribe);
    const [phase, setPhase] = useState<
      "idle" | "recording" | "paused" | "processing" | "review" | "error"
    >("idle");
    const [text, setText] = useState("");
    const [error, setError] = useState<string | null>(null);
    const TranscriptInput = withinBottomSheet ? BottomSheetAwareTextInput : TextInput;
    const stoppedRef = useRef(false);
    const uriRef = useRef<string | null>(null);
    const pcmChunksRef = useRef<Float32Array[]>([]);
    const device = useOnDeviceDictation({
      enabled: transcriptionMode === "device",
      onPartialTranscript: onTranscription,
      onComplete: (transcript) => {
        setText(transcript);
        setPhase("review");
        if (Platform.OS !== "web")
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      },
      onError: (message) => {
        setError(message);
        setPhase("error");
      },
    });

    const discard = () => {
      device.cancel();
      if (recorder.isRecording)
        void recorder
          .stopRecording()
          .then((recording) => cleanupRecordingUri(recording?.fileUri))
          .catch(() => undefined);
      cleanupRecordingUri(uriRef.current);
      uriRef.current = null;
      pcmChunksRef.current = [];
      stoppedRef.current = false;
      setText("");
      setError(null);
      setPhase("idle");
      onPauseChange?.(false);
      onCancel?.();
    };
    useImperativeHandle(ref, () => ({ cancel: discard }));

    const start = async () => {
      setError(null);
      stoppedRef.current = false;
      if (transcriptionMode === "device") {
        try {
          await device.start();
          setPhase("recording");
        } catch (caught) {
          setError(
            caught instanceof Error ? caught.message : "Could not start on-device dictation.",
          );
          setPhase("error");
        }
        return;
      }
      stoppedRef.current = false;
      pcmChunksRef.current = [];
      try {
        await recorder.startRecording({
          sampleRate: TRANSCRIPTION_AUDIO_SAMPLE_RATE,
          channels: 1,
          encoding: "pcm_16bit",
          bufferDurationSeconds: 0.1,
          streamFormat: "float32",
          maxDurationMs: MAX_DURATION_MS,
          autoStopOnMaxDuration: false,
          keepAwake: false,
          output: { primary: { enabled: true, format: "wav" } },
          onAudioStream: async (event) => {
            if (event.streamFormat === "float32" && event.data.length > 0)
              pcmChunksRef.current.push(event.data.slice());
          },
        });
        setPhase("recording");
      } catch (caught) {
        setError(
          caught instanceof Error && /permission|microphone/i.test(caught.message)
            ? "Allow microphone access in device settings to record a dictation."
            : "Could not start recording. Try again.",
        );
        setPhase("error");
      }
    };

    const uploadAndTranscribe = async (args: {
      audio: ArrayBuffer | Blob;
      mimeType: string;
      durationMs: number;
    }) => {
      setPhase("processing");
      try {
        const { jobId, uploadUrl } = await createUpload({
          mimeType: args.mimeType,
          durationMs: args.durationMs,
        });
        const uploaded = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": args.mimeType },
          body: args.audio,
        });
        if (!uploaded.ok) throw new Error("Upload failed.");
        const { storageId } = await uploaded.json();
        await attachUpload({ jobId, storageId });
        const result = await transcribe({ jobId });
        if (result.kind === "error") throw new Error(result.message);
        setText(result.text);
        setPhase("review");
        if (Platform.OS !== "web")
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not transcribe this recording.");
        setPhase("error");
      } finally {
        cleanupRecordingUri(uriRef.current);
        uriRef.current = null;
      }
    };

    const stop = async () => {
      if (stoppedRef.current || phase === "processing") return;
      stoppedRef.current = true;
      if (transcriptionMode === "device") {
        device.stop();
        return;
      }
      try {
        const recording = await recorder.stopRecording();
        if (!recording || recording.durationMs < 500)
          throw new Error("Record a little longer, then try again.");
        uriRef.current = recording.fileUri;
        onPauseChange?.(false);
        setPhase("processing");
        // Let the processing state render before the synchronous DSP work starts.
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        try {
          const prepared = prepareAudioForTranscription(pcmChunksRef.current);
          await uploadAndTranscribe(prepared);
        } catch (processingError) {
          console.warn(
            "Frontend audio preprocessing failed; using original WAV.",
            processingError instanceof Error ? processingError.message : processingError,
          );
          const original =
            Platform.OS === "web"
              ? await (await fetch(recording.fileUri)).blob()
              : await new File(recording.fileUri).arrayBuffer();
          await uploadAndTranscribe({
            audio: original,
            mimeType: "audio/wav",
            durationMs: Math.min(recording.durationMs, MAX_DURATION_MS),
          });
        } finally {
          pcmChunksRef.current = [];
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not finish recording.");
        setPhase("error");
      }
    };

    const pauseOrResume = async () => {
      try {
        if (phase === "recording") {
          await recorder.pauseRecording();
          setPhase("paused");
          onPauseChange?.(true);
        } else if (phase === "paused") {
          await recorder.resumeRecording();
          setPhase("recording");
          onPauseChange?.(false);
        }
      } catch {
        setError("Recording was interrupted. Discard it and try again.");
        setPhase("error");
      }
    };

    useEffect(() => {
      if (autoStart && phase === "idle") void start();
    }, [autoStart]);
    useEffect(() => {
      const duration = transcriptionMode === "device" ? device.elapsedMs : recorder.durationMs;
      if (phase === "recording" && duration >= MAX_DURATION_MS) void stop();
    }, [device.elapsedMs, phase, recorder.durationMs, transcriptionMode]);
    useEffect(() => {
      if (transcriptOverride !== undefined && phase === "review") setText(transcriptOverride);
    }, [phase, transcriptOverride]);
    useEffect(
      () => () => {
        if (recorder.isRecording)
          void recorder
            .stopRecording()
            .then((recording) => cleanupRecordingUri(recording?.fileUri))
            .catch(() => undefined);
        device.cancel();
      },
      [],
    );

    const isPill = variant === "pill";
    if (phase === "review") {
      if (isPill)
        return (
          <XStack flex={1} alignItems="center" gap={8}>
            <Text flex={1} color={theme.color.val} numberOfLines={1}>
              Review dictation in the composer
            </Text>
            <Pressable
              onPress={() => {
                onTranscriptionComplete?.(text);
                setPhase("idle");
              }}
            >
              <Text color={theme.primary.val} fontWeight="700">
                Use
              </Text>
            </Pressable>
          </XStack>
        );
      return (
        <YStack gap={10} width="100%">
          <TranscriptInput
            value={text}
            onChangeText={setText}
            multiline
            scrollEnabled={!withinBottomSheet}
            placeholder="Your transcription"
            placeholderTextColor={theme.colorMuted.val}
            style={{
              minHeight: 96,
              borderWidth: 1,
              borderColor: theme.borderColor.val,
              borderRadius: 14,
              padding: 12,
              color: theme.color.val,
            }}
          />
          <XStack justifyContent="space-between">
            <Pressable onPress={discard}>
              <Text color={theme.destructive.val}>Discard</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                onTranscriptionComplete?.(text);
                setPhase("idle");
              }}
            >
              <Text color={theme.primary.val} fontWeight="700">
                Use transcription
              </Text>
            </Pressable>
          </XStack>
        </YStack>
      );
    }
    if (phase === "processing")
      return (
        <XStack alignItems="center" gap={8} padding={12}>
          <Feather name="upload-cloud" size={18} color={theme.primary.val} />
          <Text color={theme.colorMuted.val}>Uploading and transcribing…</Text>
        </XStack>
      );
    if (phase === "error")
      return (
        <YStack gap={8} padding={isPill ? 0 : 12}>
          <Text color={theme.destructive.val}>{error}</Text>
          <XStack gap={14}>
            <Pressable
              onPress={() => {
                setPhase("idle");
                void start();
              }}
            >
              <Text color={theme.primary.val} fontWeight="700">
                Retry
              </Text>
            </Pressable>
            <Pressable onPress={discard}>
              <Text color={theme.colorMuted.val}>Discard</Text>
            </Pressable>
          </XStack>
        </YStack>
      );
    const active = phase === "recording" || phase === "paused" || device.status === "starting";
    const duration = transcriptionMode === "device" ? device.elapsedMs : recorder.durationMs;
    const listeningLabel =
      transcriptionMode === "device" && device.status === "starting"
        ? "Starting on-device dictation…"
        : `${formatDuration(duration)} · ${phase === "paused" ? "Paused" : "Recording"}`;
    return (
      <XStack
        alignItems="center"
        justifyContent="center"
        gap={10}
        padding={isPill ? 0 : 12}
        flex={isPill ? 1 : undefined}
      >
        <Pressable
          onPress={() => (active ? void stop() : void start())}
          style={{
            width: 42,
            height: 42,
            borderRadius: 21,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: active ? theme.destructive.val : theme.primary.val,
          }}
        >
          <Feather name={active ? "square" : "mic"} size={18} color={theme.textInverse.val} />
        </Pressable>
        <Text color={theme.colorMuted.val}>{active ? listeningLabel : "Tap to dictate"}</Text>
        {active && !isPill && transcriptionMode === "cloud" ? (
          <Pressable onPress={() => void pauseOrResume()}>
            <Text color={theme.primary.val} fontWeight="700">
              {phase === "paused" ? "Resume" : "Pause"}
            </Text>
          </Pressable>
        ) : null}
      </XStack>
    );
  },
);
