import { useCallback, useEffect, useRef, useState } from "react";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import {
  getBestTranscript,
  isSpeechRecognitionAvailable,
  requestSpeechPermission,
  startSpeechRecognition,
} from "@/lib/speechRecognition";
import { logDevError } from "@/lib/devLog";
import { showToastImperative } from "@/components/ui/toast";

export interface UseVoiceInputReturn {
  isListening: boolean;
  liveTranscript: string;
  start: () => Promise<void>;
  stop: () => void;
}

/** Auto-stop after this much silence following speechend */
const SPEECH_END_STOP_MS = 800;

/**
 * Wraps expo-speech-recognition with real-time interim results and
 * auto-fires onComplete when the utterance ends.
 *
 * Mirrors the Web Speech API approach: minimal config, system picks backend.
 */
export function useVoiceInput(onComplete: (text: string) => void): UseVoiceInputReturn {
  const [isListening, setIsListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");

  // Stable refs — survive re-renders without causing stale closure bugs
  const transcriptRef = useRef("");
  const hasCompletedRef = useRef(false);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearSilenceTimer(), [clearSilenceTimer]);

  // ── Speech Recognition Events ────────────────────────────────────────────

  useSpeechRecognitionEvent("start", () => {
    setIsListening(true);
    setLiveTranscript("");
    transcriptRef.current = "";
    hasCompletedRef.current = false;
  });

  useSpeechRecognitionEvent("speechstart", () => {
    clearSilenceTimer();
  });

  useSpeechRecognitionEvent("speechend", () => {
    // Give a short grace period before stopping so the final result arrives
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {
        setIsListening(false);
      }
    }, SPEECH_END_STOP_MS);
  });

  useSpeechRecognitionEvent("result", (event) => {
    const transcript = getBestTranscript(event.results);
    if (!transcript) return;

    // Always track the latest transcript (final overrides interim)
    transcriptRef.current = transcript;
    setLiveTranscript(transcript);
  });

  useSpeechRecognitionEvent("end", () => {
    clearSilenceTimer();
    setIsListening(false);

    const text = transcriptRef.current.trim();
    setLiveTranscript("");
    transcriptRef.current = "";

    if (text && !hasCompletedRef.current) {
      hasCompletedRef.current = true;
      onCompleteRef.current(text);
    }
  });

  useSpeechRecognitionEvent("error", (event) => {
    clearSilenceTimer();
    setIsListening(false);
    setLiveTranscript("");
    transcriptRef.current = "";

    if (event.error === "aborted") return; // expected when stop() is called manually

    logDevError("useVoiceInput.error", new Error(event.message), {
      code: event.error,
      nativeCode: event.code,
    });

    const title =
      event.error === "not-allowed"
        ? "Microphone access denied"
        : event.error === "no-speech"
          ? "No speech detected"
          : "Voice input failed";
    const message =
      event.error === "not-allowed"
        ? "Allow microphone access in your device settings."
        : event.error === "no-speech"
          ? "Try speaking louder or closer to the mic."
          : undefined;

    showToastImperative({
      title,
      message,
      tone: event.error === "no-speech" ? "warning" : "error",
    });
  });

  // ── Controls ─────────────────────────────────────────────────────────────

  const start = useCallback(async () => {
    if (isListening) return;
    if (!isSpeechRecognitionAvailable()) return;

    const granted = await requestSpeechPermission();
    if (!granted) return;

    const result = await startSpeechRecognition();
    if (!result.ok) {
      logDevError("useVoiceInput.start", new Error(result.reason));
    }
  }, [isListening]);

  const stop = useCallback(() => {
    clearSilenceTimer();
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch (error) {
      logDevError("useVoiceInput.stop", error);
      setIsListening(false);
    }
  }, [clearSilenceTimer]);

  return { isListening, liveTranscript, start, stop };
}
