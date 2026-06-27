import React, { useEffect, useRef, useState } from "react";
import { Pressable, TextInput } from "react-native";
import { Feather } from "@/lib/icons";
import * as Haptics from "expo-haptics";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
} from "react-native-reanimated";
import { XStack, YStack, Text } from "tamagui";
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

export type VoiceInputMode = "standard" | "continuous" | "walkie-talkie" | "auto";

interface VoiceRecorderProps {
  onTranscription: (text: string) => void;
  onTranscriptionComplete?: (text: string) => void;
  compact?: boolean;
  inputMode?: VoiceInputMode;
  /** Called when pause state changes so parent can hide its own transcript display */
  onPauseChange?: (isPaused: boolean) => void;
  /**
   * Compact-mode only: parent passes back the edited transcript so VoiceRecorder
   * can keep its accumulation refs in sync when the user resumes.
   */
  transcriptOverride?: string;
}

const SPEECH_END_STOP_MS = 2500;

export function VoiceRecorder({
  onTranscription,
  onTranscriptionComplete,
  compact,
  inputMode = "standard",
  onPauseChange,
  transcriptOverride,
}: VoiceRecorderProps) {
  const theme = useAppTheme();
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [editableText, setEditableText] = useState<string | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptRef = useRef("");
  const accumulatedTranscriptRef = useRef(""); // text from all completed phrases/restart sessions
  const lastBroadcastRef = useRef("");
  const hasCompletedRef = useRef(false);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasInitiatedByMeRef = useRef(false);
  const shouldRestartRef = useRef(false); // continuous mode: restart on natural end
  const isRestartingRef = useRef(false); // true between end→start during a restart cycle
  const walkieTalkieActiveRef = useRef(false); // walkie-talkie: true while held
  const lastResultWasFinalRef = useRef(false); // tracks phrase boundary for iOS continuous mode
  const isPausingRef = useRef(false); // true while a pause-stop is in flight

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
      isPausingRef.current = false;
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

  // ── Sync external edits (compact mode) back into accumulation refs ────────────
  useEffect(() => {
    if (!isPaused || transcriptOverride === undefined) return;
    transcriptRef.current = transcriptOverride;
    accumulatedTranscriptRef.current = transcriptOverride;
  }, [transcriptOverride, isPaused]);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };
  const clearSilenceTimer = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
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
  // NOTE: useSpeechRecognitionEvent is a global emitter — ALL mounted VoiceRecorder
  // instances receive every event. Guard each handler so only the instance that
  // called startRecording actually responds.

  useSpeechRecognitionEvent("start", () => {
    if (!wasInitiatedByMeRef.current) return;
    setStatusMessage(null);
    setIsRecording(true);
    if (!isRestartingRef.current) {
      // Fresh start — reset everything
      setDuration(0);
      transcriptRef.current = "";
      accumulatedTranscriptRef.current = "";
      lastBroadcastRef.current = "";
      hasCompletedRef.current = false;
      lastResultWasFinalRef.current = false;
    }
    isRestartingRef.current = false;
    clearTimer();
    timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
  });

  useSpeechRecognitionEvent("speechstart", () => {
    if (!wasInitiatedByMeRef.current) return;
    clearSilenceTimer();
  });

  useSpeechRecognitionEvent("speechend", () => {
    if (!wasInitiatedByMeRef.current) return;
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
    if (!wasInitiatedByMeRef.current) return;
    const sessionText = getBestTranscript(event.results);
    if (!sessionText) return;

    // iOS continuous mode: each phrase fires its own result events starting from "".
    // When the previous result was final, a new phrase has begun — lock in the previous
    // phrase text into accumulatedTranscriptRef before the new phrase overwrites it.
    if (lastResultWasFinalRef.current) {
      accumulatedTranscriptRef.current = transcriptRef.current;
    }
    lastResultWasFinalRef.current = event.isFinal ?? false;

    const full = accumulatedTranscriptRef.current
      ? accumulatedTranscriptRef.current + " " + sessionText
      : sessionText;
    transcriptRef.current = full;
    broadcastTranscript(full);
  });

  useSpeechRecognitionEvent("end", () => {
    if (!wasInitiatedByMeRef.current) return;
    clearSilenceTimer();
    clearTimer();
    setIsRecording(false);

    if (isPausingRef.current) {
      isPausingRef.current = false;
      // Lock in everything spoken so far so the resumed session appends to it
      accumulatedTranscriptRef.current = transcriptRef.current;
      lastResultWasFinalRef.current = false;
      setIsPaused(true);
      if (!compact) setEditableText(transcriptRef.current);
      onPauseChange?.(true);
      return;
    }

    if (shouldRestartRef.current) {
      // Save current session text so the next session can prepend it
      accumulatedTranscriptRef.current = transcriptRef.current;
      hasCompletedRef.current = false;
      isRestartingRef.current = true;
      wasInitiatedByMeRef.current = true;
      ExpoSpeechRecognitionModule.start(buildContinuousSpeechOptions());
      return;
    }

    publishComplete();
  });

  useSpeechRecognitionEvent("error", (event) => {
    if (!wasInitiatedByMeRef.current) return;
    clearSilenceTimer();
    clearTimer();
    setIsRecording(false);
    setIsPaused(false);
    setEditableText(null);
    shouldRestartRef.current = false;
    isPausingRef.current = false;
    walkieTalkieActiveRef.current = false;
    onPauseChange?.(false);

    if (event.error === "aborted") return;

    logDevError("VoiceRecorder.error", new Error(event.message), {
      code: event.error,
      nativeCode: event.code,
    });

    const title =
      event.error === "not-allowed"
        ? "Microphone access denied"
        : event.error === "no-speech"
          ? "No speech detected"
          : "Dictation failed";
    const message =
      event.error === "not-allowed"
        ? "Allow microphone access in your device settings."
        : event.error === "no-speech"
          ? "Try speaking louder or closer to the mic."
          : "Speech recognition could not complete. Please try again.";

    showToastImperative({
      title,
      message,
      tone: event.error === "no-speech" ? "warning" : "error",
    });
  });

  // ── Controls ─────────────────────────────────────────────────────────────────
  const startRecording = async (opts?: { continuous?: boolean }) => {
    if (isRecording) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (!isSpeechRecognitionAvailable()) {
      showToastImperative({
        title: "Dictation unavailable",
        message: "Speech recognition is not supported on this device.",
        tone: "error",
      });
      return;
    }

    const granted = await requestSpeechPermission();
    setPermissionGranted(granted);
    if (!granted) {
      showToastImperative({
        title: "Microphone access denied",
        message: "Allow microphone access in your device settings to use dictation.",
        tone: "error",
      });
      return;
    }

    hasCompletedRef.current = false;
    wasInitiatedByMeRef.current = true;
    isRestartingRef.current = false;
    lastResultWasFinalRef.current = false;
    transcriptRef.current = "";
    accumulatedTranscriptRef.current = "";
    lastBroadcastRef.current = "";
    setDuration(0);
    setStatusMessage(null);

    // Tap-to-start in auto mode behaves as continuous (long-press WT path has walkieTalkie=true)
    const isTapAutoMode = inputMode === "auto" && !walkieTalkieActiveRef.current;
    shouldRestartRef.current = opts?.continuous ?? (inputMode === "continuous" || isTapAutoMode);

    const options =
      opts?.continuous || inputMode === "continuous" || isTapAutoMode
        ? buildContinuousSpeechOptions()
        : undefined; // undefined = startSpeechRecognition() uses its own defaults

    let result: { ok: boolean; reason?: string };
    if (options) {
      try {
        ExpoSpeechRecognitionModule.start(options);
        result = { ok: true };
      } catch (error) {
        logDevError("VoiceRecorder.start", error);
        result = {
          ok: false,
          reason: "Speech recognition could not be started.",
        };
      }
    } else {
      result = await startSpeechRecognition();
    }

    if (!result.ok) {
      wasInitiatedByMeRef.current = false;
      shouldRestartRef.current = false;
      showToastImperative({
        title: "Could not start dictation",
        message: result.reason ?? "",
        tone: "error",
      });
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

  const cancelRecording = () => {
    shouldRestartRef.current = false;
    isPausingRef.current = false;
    walkieTalkieActiveRef.current = false;
    // Clear wasInitiatedByMeRef so the end event does nothing
    wasInitiatedByMeRef.current = false;
    clearSilenceTimer();
    clearTimer();
    setIsRecording(false);
    setIsPaused(false);
    setEditableText(null);
    transcriptRef.current = "";
    accumulatedTranscriptRef.current = "";
    lastBroadcastRef.current = "";
    lastResultWasFinalRef.current = false;
    onTranscription(""); // clear live transcript in parent
    onPauseChange?.(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      /* already stopped */
    }
  };

  const pauseRecording = () => {
    shouldRestartRef.current = false;
    isPausingRef.current = true;
    clearSilenceTimer();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch (error) {
      logDevError("VoiceRecorder.pause", error);
      isPausingRef.current = false;
      setIsRecording(false);
      setIsPaused(true);
    }
  };

  const resumeRecording = () => {
    setIsPaused(false);
    setEditableText(null);
    onPauseChange?.(false);
    isRestartingRef.current = true; // don't wipe transcript on start event
    wasInitiatedByMeRef.current = true;
    lastResultWasFinalRef.current = false;
    const isTapAutoMode = inputMode === "auto" && !walkieTalkieActiveRef.current;
    shouldRestartRef.current = inputMode === "continuous" || isTapAutoMode;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      ExpoSpeechRecognitionModule.start(buildContinuousSpeechOptions());
    } catch (error) {
      logDevError("VoiceRecorder.resume", error);
      isRestartingRef.current = false;
      wasInitiatedByMeRef.current = false;
    }
  };

  const completeFromPause = () => {
    setIsPaused(false);
    setEditableText(null);
    onPauseChange?.(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    publishComplete();
  };

  const handleEditChange = (text: string) => {
    setEditableText(text);
    // Keep accumulation refs in sync so resume appends to the edited text
    transcriptRef.current = text;
    accumulatedTranscriptRef.current = text;
    lastResultWasFinalRef.current = false;
    onTranscription(text); // keep parent's liveTranscript in sync
  };

  const handlePress = () => {
    if (inputMode === "walkie-talkie") return; // WT handled via pressIn/Out
    if (inputMode === "auto" && walkieTalkieActiveRef.current) return; // auto WT handled via longPress/pressOut
    if (isRecording) {
      stopRecording();
    } else if (isPaused) {
      completeFromPause();
    } else {
      void startRecording();
    }
  };

  const handleLongPress = () => {
    if (inputMode !== "auto") return;
    walkieTalkieActiveRef.current = true;
    void startRecording();
  };

  const handlePressIn = () => {
    if (inputMode !== "walkie-talkie") return;
    walkieTalkieActiveRef.current = true;
    void startRecording();
  };

  const handlePressOut = () => {
    if (inputMode === "walkie-talkie") {
      if (walkieTalkieActiveRef.current && isRecording) stopRecording();
      walkieTalkieActiveRef.current = false;
    } else if (inputMode === "auto") {
      if (walkieTalkieActiveRef.current && isRecording) stopRecording();
      walkieTalkieActiveRef.current = false;
    }
  };

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  if (!permissionGranted && statusMessage && !isRecording) {
    return (
      <YStack
        alignItems="center"
        justifyContent="center"
        gap={compact ? 0 : 12}
        paddingVertical={compact ? 0 : 16}
      >
        <Feather name="mic-off" size={compact ? 20 : 32} color={theme.colorMuted.val} />
        {!compact && (
          <Text fontSize={14} fontFamily="$body" textAlign="center" color="$colorMuted">
            {statusMessage}
          </Text>
        )}
      </YStack>
    );
  }

  const size = compact ? 44 : 80;
  const innerSize = compact ? 40 : 72;
  const sideInnerSize = compact ? 28 : 46;

  const active = isRecording || isPaused;
  const wtHint = (inputMode === "walkie-talkie" || inputMode === "auto") && compact;

  // Determine main button icon
  const mainIcon = isRecording
    ? inputMode === "walkie-talkie" || (inputMode === "auto" && walkieTalkieActiveRef.current)
      ? "mic"
      : "square"
    : isPaused
      ? "check"
      : "mic";

  // Status label
  const statusLabel = isRecording
    ? walkieTalkieActiveRef.current || inputMode === "walkie-talkie"
      ? "Release to send"
      : inputMode === "continuous" || inputMode === "auto"
        ? "Listening — tap to stop"
        : "Listening..."
    : isPaused
      ? "Paused — tap ▶ to resume"
      : (statusMessage ??
        (inputMode === "walkie-talkie"
          ? "Hold to talk"
          : inputMode === "auto"
            ? "Tap or hold to talk"
            : "Tap to dictate"));

  return (
    <YStack
      alignItems="center"
      justifyContent="center"
      gap={compact ? (wtHint ? 4 : 0) : 12}
      paddingVertical={compact ? 0 : 16}
    >
      {/* Button row: side buttons appear when active */}
      <XStack alignItems="center" justifyContent="center" gap={compact ? 10 : 16}>
        {/* Cancel button */}
        {active && (
          <Pressable
            onPress={cancelRecording}
            style={{
              width: sideInnerSize,
              height: sideInnerSize,
              borderRadius: sideInnerSize / 2,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: theme.secondary.val,
              borderWidth: 1.5,
              borderColor: theme.borderColor.val,
            }}
          >
            <Feather name="x" size={compact ? 13 : 18} color={theme.colorMuted.val} />
          </Pressable>
        )}

        {/* Main button */}
        <YStack width={size} height={size} alignItems="center" justifyContent="center">
          {isRecording && (
            <Animated.View
              style={[
                {
                  position: "absolute",
                  width: size,
                  height: size,
                  borderRadius: size / 2,
                  backgroundColor: theme.destructive.val,
                },
                pulseStyle,
              ]}
            />
          )}
          <Pressable
            onPress={handlePress}
            onLongPress={handleLongPress}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            delayLongPress={350}
            style={{
              width: innerSize,
              height: innerSize,
              borderRadius: innerSize / 2,
              backgroundColor: isRecording
                ? theme.destructive.val
                : isPaused
                  ? theme.primary.val + "CC"
                  : theme.primary.val,
              alignItems: "center",
              justifyContent: "center",
              shadowColor: theme.primary.val,
              shadowOffset: { width: 0, height: compact ? 1 : 3 },
              shadowOpacity: compact ? 0.14 : 0.24,
              shadowRadius: compact ? 3 : 8,
              elevation: compact ? 1 : 4,
            }}
          >
            <Feather name={mainIcon} size={compact ? 18 : 28} color={theme.textInverse.val} />
          </Pressable>
        </YStack>

        {/* Pause / Resume button */}
        {active && (
          <Pressable
            onPress={isRecording ? pauseRecording : resumeRecording}
            style={{
              width: sideInnerSize,
              height: sideInnerSize,
              borderRadius: sideInnerSize / 2,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: isPaused ? theme.primary.val + "20" : theme.secondary.val,
              borderWidth: 1.5,
              borderColor: isPaused ? theme.primary.val + "60" : theme.borderColor.val,
            }}
          >
            <Feather
              name={isRecording ? "pause" : "play"}
              size={compact ? 13 : 18}
              color={isPaused ? theme.primary.val : theme.colorMuted.val}
            />
          </Pressable>
        )}
      </XStack>

      {isRecording && !compact && (
        <Text fontSize={24} fontFamily="$body" fontWeight="600" color="$color">
          {formatDuration(duration)}
        </Text>
      )}

      {/* Editable transcript during pause (non-compact only) */}
      {editableText !== null && !compact && (
        <TextInput
          value={editableText}
          onChangeText={handleEditChange}
          multiline
          autoFocus={false}
          style={{
            width: "100%",
            minHeight: 64,
            fontSize: 15,
            color: theme.color.val,
            backgroundColor: theme.card.val,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: theme.borderColor.val,
            paddingHorizontal: 14,
            paddingVertical: 12,
            lineHeight: 22,
            textAlignVertical: "top",
          }}
        />
      )}

      {wtHint && !active && (
        <Text fontSize={10} fontFamily="$body" textAlign="center" color="$colorMuted" opacity={0.7}>
          {inputMode === "auto" ? "Tap or hold to talk" : "Hold to talk"}
        </Text>
      )}

      {!compact && (
        <Text fontSize={14} fontFamily="$body" textAlign="center" color="$colorMuted">
          {statusLabel}
        </Text>
      )}
    </YStack>
  );
}
