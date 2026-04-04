import React, { useEffect, useRef, useState } from "react";
import { Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
} from "react-native-reanimated";
import { YStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import {
  getBestTranscript,
  isSpeechRecognitionAvailable,
  requestSpeechPermission,
  startSpeechRecognition,
  buildContinuousSpeechOptions,
} from "@/lib/speechRecognition";
import { logDevError } from "@/lib/devLog";
import { showToastImperative } from "@/components/ui/toast";

export type VoiceInputMode = "standard" | "continuous" | "walkie-talkie";

interface VoiceRecorderProps {
  onTranscription: (text: string) => void;
  onTranscriptionComplete?: (text: string) => void;
  compact?: boolean;
  inputMode?: VoiceInputMode;
}

const SPEECH_END_STOP_MS = 2500;

export function VoiceRecorder({
  onTranscription,
  onTranscriptionComplete,
  compact,
  inputMode = "standard",
}: VoiceRecorderProps) {
  const theme = useAppTheme();
  const [isRecording, setIsRecording] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptRef = useRef("");
  const lastBroadcastRef = useRef("");
  const hasCompletedRef = useRef(false);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasInitiatedByMeRef = useRef(false);
  const shouldRestartRef = useRef(false); // continuous mode: restart on natural end
  const walkieTalkieActiveRef = useRef(false); // walkie-talkie: true while held

  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.3);

  // ── Init ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    const init = async () => {
      if (!isSpeechRecognitionAvailable()) {
        if (active) setStatusMessage("Speech recognition is unavailable on this device.");
        return;
      }
      try {
        const perm = await ExpoSpeechRecognitionModule.getPermissionsAsync();
        if (active) setPermissionGranted(perm.granted);
      } catch (error) {
        logDevError("VoiceRecorder.init", error);
      }
    };
    init();
    return () => {
      active = false;
      shouldRestartRef.current = false;
      clearTimer();
      clearSilenceTimer();
    };
  }, []);

  // ── Pulse animation ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (isRecording) {
      pulseScale.value = withRepeat(
        withSequence(withTiming(1.3, { duration: 800 }), withTiming(1, { duration: 800 })),
        -1,
        true,
      );
      pulseOpacity.value = withRepeat(
        withSequence(withTiming(0.5, { duration: 800 }), withTiming(0.1, { duration: 800 })),
        -1,
        true,
      );
    } else {
      pulseScale.value = withSpring(1);
      pulseOpacity.value = withTiming(0);
    }
  }, [isRecording, pulseOpacity, pulseScale]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const clearTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };
  const clearSilenceTimer = () => {
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
  };

  const broadcastTranscript = (text: string) => {
    if (text && text !== lastBroadcastRef.current) {
      lastBroadcastRef.current = text;
      onTranscription(text);
    }
  };

  const publishComplete = () => {
    if (!wasInitiatedByMeRef.current) return;
    if (hasCompletedRef.current) return;
    hasCompletedRef.current = true;
    wasInitiatedByMeRef.current = false;
    const text = transcriptRef.current.trim();
    if (!text) return;
    broadcastTranscript(text);
    onTranscriptionComplete?.(text);
  };

  // ── Speech events ────────────────────────────────────────────────────────────
  useSpeechRecognitionEvent("start", () => {
    setStatusMessage(null);
    setIsRecording(true);
    setDuration(0);
    transcriptRef.current = "";
    lastBroadcastRef.current = "";
    hasCompletedRef.current = false;
    clearTimer();
    timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
  });

  useSpeechRecognitionEvent("speechstart", () => {
    clearSilenceTimer();
  });

  useSpeechRecognitionEvent("speechend", () => {
    // Only use silence timer in standard mode
    if (inputMode !== "standard") return;
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {
        setIsRecording(false);
        publishComplete();
      }
    }, SPEECH_END_STOP_MS);
  });

  useSpeechRecognitionEvent("result", (event) => {
    const transcript = getBestTranscript(event.results);
    if (!transcript) return;
    transcriptRef.current = transcript;
    broadcastTranscript(transcript);
  });

  useSpeechRecognitionEvent("end", () => {
    clearSilenceTimer();
    clearTimer();
    setIsRecording(false);

    if (inputMode === "continuous" && shouldRestartRef.current) {
      // Restart automatically — preserve accumulated transcript
      const savedTranscript = transcriptRef.current;
      const savedBroadcast = lastBroadcastRef.current;
      hasCompletedRef.current = false;
      wasInitiatedByMeRef.current = true;
      ExpoSpeechRecognitionModule.start(buildContinuousSpeechOptions());
      // Restore so accumulated text isn't lost between restarts
      transcriptRef.current = savedTranscript;
      lastBroadcastRef.current = savedBroadcast;
      return;
    }

    publishComplete();
  });

  useSpeechRecognitionEvent("error", (event) => {
    clearSilenceTimer();
    clearTimer();
    setIsRecording(false);
    shouldRestartRef.current = false;
    walkieTalkieActiveRef.current = false;

    if (event.error === "aborted") return;

    logDevError("VoiceRecorder.error", new Error(event.message), {
      code: event.error,
      nativeCode: event.code,
    });

    const title =
      event.error === "not-allowed" ? "Microphone access denied" :
      event.error === "no-speech" ? "No speech detected" : "Dictation failed";
    const message =
      event.error === "not-allowed" ? "Allow microphone access in your device settings." :
      event.error === "no-speech" ? "Try speaking louder or closer to the mic." :
      "Speech recognition could not complete. Please try again.";

    showToastImperative({ title, message, tone: event.error === "no-speech" ? "warning" : "error" });
  });

  // ── Controls ─────────────────────────────────────────────────────────────────
  const startRecording = async (opts?: { continuous?: boolean }) => {
    if (isRecording) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (!isSpeechRecognitionAvailable()) {
      showToastImperative({ title: "Dictation unavailable", message: "Speech recognition is not supported on this device.", tone: "error" });
      return;
    }

    const granted = await requestSpeechPermission();
    setPermissionGranted(granted);
    if (!granted) {
      showToastImperative({ title: "Microphone access denied", message: "Allow microphone access in your device settings to use dictation.", tone: "error" });
      return;
    }

    hasCompletedRef.current = false;
    wasInitiatedByMeRef.current = true;
    transcriptRef.current = "";
    lastBroadcastRef.current = "";
    setDuration(0);
    setStatusMessage(null);

    shouldRestartRef.current = opts?.continuous ?? (inputMode === "continuous");

    const options = opts?.continuous || inputMode === "continuous"
      ? buildContinuousSpeechOptions()
      : undefined; // undefined = startSpeechRecognition() uses its own defaults

    let result: { ok: boolean; reason?: string };
    if (options) {
      try {
        ExpoSpeechRecognitionModule.start(options);
        result = { ok: true };
      } catch (error) {
        logDevError("VoiceRecorder.start", error);
        result = { ok: false, reason: "Speech recognition could not be started." };
      }
    } else {
      result = await startSpeechRecognition();
    }

    if (!result.ok) {
      wasInitiatedByMeRef.current = false;
      shouldRestartRef.current = false;
      showToastImperative({ title: "Could not start dictation", message: result.reason ?? "", tone: "error" });
    }
  };

  const stopRecording = () => {
    shouldRestartRef.current = false;
    walkieTalkieActiveRef.current = false;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    clearSilenceTimer();
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch (error) {
      logDevError("VoiceRecorder.stop", error);
      setIsRecording(false);
      publishComplete();
    }
  };

  const handlePress = () => {
    if (inputMode === "walkie-talkie") return; // WT handled via pressIn/Out
    if (isRecording) {
      stopRecording();
    } else {
      void startRecording();
    }
  };

  const handlePressIn = () => {
    if (inputMode !== "walkie-talkie") return;
    walkieTalkieActiveRef.current = true;
    void startRecording();
  };

  const handlePressOut = () => {
    if (inputMode !== "walkie-talkie") return;
    if (walkieTalkieActiveRef.current && isRecording) {
      stopRecording();
    }
    walkieTalkieActiveRef.current = false;
  };

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  if (!permissionGranted && statusMessage && !isRecording) {
    return (
      <YStack alignItems="center" justifyContent="center" gap={compact ? 0 : 12} paddingVertical={compact ? 0 : 16}>
        <Feather name="mic-off" size={compact ? 20 : 32} color={theme.colorMuted.val} />
        {!compact && (
          <Text fontSize={14} fontFamily="$body" textAlign="center" color="$colorMuted">{statusMessage}</Text>
        )}
      </YStack>
    );
  }

  const size = compact ? 44 : 80;
  const innerSize = compact ? 40 : 72;

  const wtHint = inputMode === "walkie-talkie" && compact;

  return (
    <YStack alignItems="center" justifyContent="center" gap={compact ? (wtHint ? 4 : 0) : 12} paddingVertical={compact ? 0 : 16}>
      <YStack width={size} height={size} alignItems="center" justifyContent="center">
        {isRecording && (
          <Animated.View
            style={[
              { position: "absolute", width: size, height: size, borderRadius: size / 2, backgroundColor: theme.destructive.val },
              pulseStyle,
            ]}
          />
        )}
        <Pressable
          onPress={handlePress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={{
            width: innerSize,
            height: innerSize,
            borderRadius: innerSize / 2,
            backgroundColor: isRecording ? theme.destructive.val : theme.primary.val,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: theme.primary.val,
            shadowOffset: { width: 0, height: compact ? 1 : 3 },
            shadowOpacity: compact ? 0.14 : 0.24,
            shadowRadius: compact ? 3 : 8,
            elevation: compact ? 1 : 4,
          }}
        >
          <Feather
            name={isRecording ? (inputMode === "walkie-talkie" ? "mic" : "square") : "mic"}
            size={compact ? 18 : 28}
            color="#FFFFFF"
          />
        </Pressable>
      </YStack>

      {isRecording && !compact && (
        <Text fontSize={24} fontFamily="$body" fontWeight="600" color="$color">
          {formatDuration(duration)}
        </Text>
      )}

      {wtHint && (
        <Text fontSize={10} fontFamily="$body" textAlign="center" color="$colorMuted" opacity={0.7}>
          {isRecording ? "Release to send" : "Hold to talk"}
        </Text>
      )}

      {!compact && (
        <Text fontSize={14} fontFamily="$body" textAlign="center" color="$colorMuted">
          {isRecording
            ? inputMode === "continuous"
              ? "Listening — tap to stop"
              : inputMode === "walkie-talkie"
              ? "Release to send"
              : "Listening..."
            : statusMessage ?? (inputMode === "walkie-talkie" ? "Hold to talk" : "Tap to dictate")}
        </Text>
      )}
    </YStack>
  );
}
