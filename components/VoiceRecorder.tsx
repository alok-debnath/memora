import React, { useEffect, useImperativeHandle, useRef, useState } from "react";
import { Pressable, TextInput } from "react-native";
import { Feather } from "@/lib/icons";
import * as Haptics from "expo-haptics";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import Animated, {
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
} from "react-native-reanimated";
import { XStack, YStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import { appShadow } from "@/components/ui/themeHelpers";
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
  onTranscription?: (text: string) => void;
  onTranscriptionComplete?: (text: string) => void;
  /**
   * "panel" is the full standalone recorder (big button, timer, inline edit
   * box). "pill" is a minimal single-row control meant to morph inline inside
   * an existing composer bar — no timer text, no inline edit box; the caller
   * is expected to hand the finished transcript to its own text input via
   * `onTranscriptionComplete` instead.
   */
  variant?: "panel" | "pill";
  inputMode?: VoiceInputMode;
  /** Called when pause state changes so parent can hide its own transcript display */
  onPauseChange?: (isPaused: boolean) => void;
  /** Called when the user cancels an in-progress recording (discards the transcript). */
  onCancel?: () => void;
  /** Starts recording as soon as this instance mounts, instead of waiting for a tap. */
  autoStart?: boolean;
  /**
   * Panel-variant only: parent passes back the edited transcript so
   * VoiceRecorder can keep its accumulation refs in sync when the user resumes.
   */
  transcriptOverride?: string;
}

const SPEECH_END_STOP_MS = 2500;

export interface VoiceRecorderHandle {
  /** Stops and discards the in-progress recording without publishing a transcript. */
  cancel: () => void;
}

export const VoiceRecorder = React.forwardRef<VoiceRecorderHandle, VoiceRecorderProps>(
  function VoiceRecorder(
    {
      onTranscription,
      onTranscriptionComplete,
      variant = "panel",
      inputMode = "standard",
      onPauseChange,
      onCancel,
      autoStart,
      transcriptOverride,
    }: VoiceRecorderProps,
    ref,
  ) {
    const theme = useAppTheme();
    const [isRecording, setIsRecording] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [isStarting, setIsStarting] = useState(false);
    const [editableText, setEditableText] = useState<string | null>(null);
    const [permissionGranted, setPermissionGranted] = useState(false);
    const [duration, setDuration] = useState(0);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [liveText, setLiveText] = useState("");

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
    const waveBars = [
      useSharedValue(0.25),
      useSharedValue(0.25),
      useSharedValue(0.25),
      useSharedValue(0.25),
    ];

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
    // Starts pulsing on `isStarting` too (the instant a tap fires), not just once
    // the native "start" event lands — so the UI feels immediate even though the
    // mic engine itself takes a beat to actually spin up.
    useEffect(() => {
      if (isRecording || isStarting) {
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
    }, [isRecording, isStarting, pulseOpacity, pulseScale]);

    const pulseStyle = useAnimatedStyle(() => ({
      transform: [{ scale: pulseScale.value }],
      opacity: pulseOpacity.value,
    }));

    // ── Waveform bars — only "listening", not "starting" (nothing to react to yet) ──
    useEffect(() => {
      const durations = [420, 540, 360, 480];
      if (isRecording) {
        waveBars.forEach((bar, i) => {
          bar.value = withRepeat(
            withSequence(
              withTiming(0.35 + Math.random() * 0.65, { duration: durations[i] }),
              withTiming(0.15 + Math.random() * 0.35, { duration: durations[i] * 0.8 }),
            ),
            -1,
            true,
          );
        });
      } else {
        waveBars.forEach((bar) => {
          bar.value = withTiming(0.2, { duration: 200 });
        });
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isRecording]);

    const waveStyle0 = useAnimatedStyle(() => ({ transform: [{ scaleY: waveBars[0].value }] }));
    const waveStyle1 = useAnimatedStyle(() => ({ transform: [{ scaleY: waveBars[1].value }] }));
    const waveStyle2 = useAnimatedStyle(() => ({ transform: [{ scaleY: waveBars[2].value }] }));
    const waveStyle3 = useAnimatedStyle(() => ({ transform: [{ scaleY: waveBars[3].value }] }));
    const waveStyles = [waveStyle0, waveStyle1, waveStyle2, waveStyle3];

    // ── Sync external edits (panel variant) back into accumulation refs ───────────
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
        setLiveText(text);
        onTranscription?.(text);
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
      setIsStarting(false);
      setIsRecording(true);
      if (!isRestartingRef.current) {
        // Fresh start — reset everything
        setDuration(0);
        transcriptRef.current = "";
        accumulatedTranscriptRef.current = "";
        lastBroadcastRef.current = "";
        hasCompletedRef.current = false;
        lastResultWasFinalRef.current = false;
        setLiveText("");
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
        if (variant === "panel") setEditableText(transcriptRef.current);
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
      setIsStarting(false);
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
      // Flips the UI into its active/listening look immediately — the native
      // mic engine still takes a beat to actually fire "start", but the user
      // sees an instant response instead of a dead tap.
      setIsStarting(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      if (!isSpeechRecognitionAvailable()) {
        setIsStarting(false);
        showToastImperative({
          title: "Dictation unavailable",
          message: "Speech recognition is not supported on this device.",
          tone: "error",
        });
        return;
      }

      // Skip the native permission round-trip when we already know it's granted
      // (checked on mount) — that bridge call is what made auto-start feel laggy.
      const granted = permissionGranted || (await requestSpeechPermission());
      if (!permissionGranted) setPermissionGranted(granted);
      if (!granted) {
        setIsStarting(false);
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
        setIsStarting(false);
        showToastImperative({
          title: "Could not start dictation",
          message: result.reason ?? "",
          tone: "error",
        });
      }
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
      if (autoStart) void startRecording();
    }, []);

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
      setIsStarting(false);
      setIsRecording(false);
      setIsPaused(false);
      setEditableText(null);
      transcriptRef.current = "";
      accumulatedTranscriptRef.current = "";
      lastBroadcastRef.current = "";
      lastResultWasFinalRef.current = false;
      setLiveText("");
      onTranscription?.(""); // clear live transcript in parent
      onPauseChange?.(false);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {
        /* already stopped */
      }
      onCancel?.();
    };

    useImperativeHandle(ref, () => ({ cancel: cancelRecording }));

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
      setLiveText(text);
      onTranscription?.(text); // keep parent's liveTranscript in sync
    };

    const handlePress = () => {
      if (isStarting) return; // native "start" hasn't landed yet — avoid a double start
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
    const active = isRecording || isPaused;

    // Determine main button icon
    const mainIcon = isRecording
      ? inputMode === "walkie-talkie" || (inputMode === "auto" && walkieTalkieActiveRef.current)
        ? "mic"
        : "square"
      : isPaused
        ? "check"
        : "mic";

    // Status label
    const statusLabel = isStarting
      ? "Starting…"
      : isRecording
        ? walkieTalkieActiveRef.current || inputMode === "walkie-talkie"
          ? "Release to send"
          : inputMode === "continuous" || inputMode === "auto"
            ? "Listening — tap to stop"
            : "Listening..."
        : isPaused
          ? "Paused — tap ▶ to finish"
          : (statusMessage ??
            (inputMode === "walkie-talkie"
              ? "Hold to talk"
              : inputMode === "auto"
                ? "Tap or hold to talk"
                : "Tap to dictate"));

    if (variant === "pill") {
      if (!permissionGranted && statusMessage && !isRecording) {
        return (
          <XStack flex={1} alignItems="center" gap={8}>
            <Feather name="mic-off" size={16} color={theme.colorMuted.val} />
            <Text
              flex={1}
              fontSize={13}
              fontFamily="$body"
              color={theme.colorMuted.val}
              numberOfLines={1}
            >
              {statusMessage}
            </Text>
          </XStack>
        );
      }

      const orbSize = 36;
      const orbTint = isRecording ? theme.destructive.val : theme.primary.val;

      return (
        <XStack flex={1} alignItems="center" gap={12}>
          <YStack width={orbSize} height={orbSize} alignItems="center" justifyContent="center">
            {/* Soft glow ring — breathes the instant a tap fires, before the
              native mic engine's own "start" event actually lands. */}
            <Animated.View
              style={[
                {
                  position: "absolute",
                  width: orbSize,
                  height: orbSize,
                  borderRadius: orbSize / 2,
                  backgroundColor: orbTint,
                },
                pulseStyle,
              ]}
            />
            <Pressable
              onPress={handlePress}
              onLongPress={handleLongPress}
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              delayLongPress={350}
              style={{
                width: orbSize - 4,
                height: orbSize - 4,
                borderRadius: (orbSize - 4) / 2,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: orbTint,
              }}
            >
              <Feather name={mainIcon} size={15} color={theme.textInverse.val} />
            </Pressable>
          </YStack>

          {isRecording ? (
            <XStack flex={1} alignItems="center" gap={10}>
              <Text
                fontSize={15}
                fontFamily="$body"
                fontWeight="600"
                color={theme.color.val}
                minWidth={36}
              >
                {formatDuration(duration)}
              </Text>
              {liveText.trim().length > 0 ? (
                // Keyed so this only mounts/animates once per utterance (wave → text);
                // subsequent transcript revisions just update this same Text node,
                // no per-keystroke remount/flicker. Head-truncation keeps the most
                // recently spoken words visible on the right, clipping older text
                // off the left — a live "ticker" with no manual scroll logic needed.
                <Animated.View key="live-text" entering={FadeIn.duration(180)} style={{ flex: 1 }}>
                  <Text
                    numberOfLines={1}
                    ellipsizeMode="head"
                    fontSize={14}
                    fontFamily="$body"
                    fontWeight="500"
                    color={theme.color.val}
                  >
                    {liveText}
                  </Text>
                </Animated.View>
              ) : (
                <Animated.View
                  key="wave"
                  entering={FadeIn.duration(150)}
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 3,
                    height: 16,
                  }}
                >
                  {waveStyles.map((style, i) => (
                    <Animated.View
                      key={i}
                      style={[
                        {
                          width: 3,
                          height: 16,
                          borderRadius: 2,
                          backgroundColor: orbTint,
                        },
                        style,
                      ]}
                    />
                  ))}
                </Animated.View>
              )}
            </XStack>
          ) : (
            <Text
              flex={1}
              numberOfLines={1}
              fontSize={13}
              fontFamily="$body"
              fontWeight={isStarting ? "600" : "500"}
              color={isStarting ? theme.color.val : theme.colorMuted.val}
            >
              {statusLabel}
            </Text>
          )}
        </XStack>
      );
    }

    if (!permissionGranted && statusMessage && !isRecording) {
      return (
        <YStack alignItems="center" justifyContent="center" gap={12} paddingVertical={16}>
          <Feather name="mic-off" size={32} color={theme.colorMuted.val} />
          <Text fontSize={14} fontFamily="$body" textAlign="center" color={theme.colorMuted.val}>
            {statusMessage}
          </Text>
        </YStack>
      );
    }

    const size = 80;
    const innerSize = 72;
    const sideInnerSize = 46;

    return (
      <YStack alignItems="center" justifyContent="center" gap={12} paddingVertical={16}>
        {/* Button row: side buttons appear when active */}
        <XStack alignItems="center" justifyContent="center" gap={16}>
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
              <Feather name="x" size={18} color={theme.colorMuted.val} />
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
                ...appShadow(theme.primary.val, "sm"),
              }}
            >
              <Feather name={mainIcon} size={28} color={theme.textInverse.val} />
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
                size={18}
                color={isPaused ? theme.primary.val : theme.colorMuted.val}
              />
            </Pressable>
          )}
        </XStack>

        {isRecording && (
          <Text fontSize={24} fontFamily="$body" fontWeight="600" color={theme.color.val}>
            {formatDuration(duration)}
          </Text>
        )}

        {/* Editable transcript during pause */}
        {editableText !== null && (
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

        <Text fontSize={14} fontFamily="$body" textAlign="center" color={theme.colorMuted.val}>
          {statusLabel}
        </Text>
      </YStack>
    );
  },
);
