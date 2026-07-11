import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { buildOnDeviceSpeechOptions, getBestTranscript } from "@/lib/speechRecognition";

const ANDROID_ON_DEVICE_SERVICE = "com.google.android.as";

type DeviceDictationStatus = "idle" | "starting" | "recording" | "error";

type UseOnDeviceDictationOptions = {
  enabled: boolean;
  onPartialTranscript?: (text: string) => void;
  onComplete: (text: string) => void;
  onError: (message: string) => void;
};

function normalizeLocale(locale: string) {
  return locale.replace("_", "-").toLowerCase();
}

function matchInstalledLocale(requestedLocale: string, installedLocales: string[]) {
  const requested = normalizeLocale(requestedLocale);
  return (
    installedLocales.find((locale) => normalizeLocale(locale) === requested) ??
    installedLocales.find(
      (locale) => normalizeLocale(locale).split("-")[0] === requested.split("-")[0],
    ) ??
    null
  );
}

function errorMessage(error: string, message: string) {
  switch (error) {
    case "not-allowed":
      return "Allow microphone and speech recognition access in device settings.";
    case "language-not-supported":
    case "service-not-allowed":
      return "Install an on-device language pack, then try dictation again.";
    case "no-speech":
    case "speech-timeout":
      return "No speech was detected. Try again.";
    case "interrupted":
      return "Dictation was interrupted. Try again when the interruption ends.";
    case "busy":
      return "Dictation is already in use. Try again in a moment.";
    default:
      return message || "On-device dictation failed. Try again.";
  }
}

/**
 * Owns one native, on-device speech-recognition session. It deliberately
 * rejects browsers and network fallback, validates Android language packs,
 * and combines Android's segmented continuous results before publishing them.
 */
export function useOnDeviceDictation({
  enabled,
  onPartialTranscript,
  onComplete,
  onError,
}: UseOnDeviceDictationOptions) {
  const [status, setStatus] = useState<DeviceDictationStatus>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [volume, setVolume] = useState<number | null>(null);
  const activeRef = useRef(false);
  const cancelledRef = useRef(false);
  const completedRef = useRef(false);
  const startedAtRef = useRef<number | null>(null);
  const committedSegmentsRef = useRef<string[]>([]);
  const currentTranscriptRef = useRef("");
  const onPartialRef = useRef(onPartialTranscript);
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);
  onPartialRef.current = onPartialTranscript;
  onCompleteRef.current = onComplete;
  onErrorRef.current = onError;

  const publishPartial = (currentSegment = "") => {
    const full = [...committedSegmentsRef.current, currentSegment].filter(Boolean).join(" ").trim();
    currentTranscriptRef.current = full;
    onPartialRef.current?.(full);
  };

  const complete = () => {
    if (completedRef.current || cancelledRef.current) return;
    completedRef.current = true;
    const transcript = currentTranscriptRef.current.trim();
    if (transcript) onCompleteRef.current(transcript);
    else onErrorRef.current("No speech was detected. Try again.");
  };

  useSpeechRecognitionEvent("start", () => {
    if (!activeRef.current || !enabled) return;
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    setStatus("recording");
  });

  useSpeechRecognitionEvent("result", (event) => {
    if (!activeRef.current || !enabled) return;
    const transcript = getBestTranscript(event.results);
    if (!transcript) return;

    // Android continuous recognition emits a fresh result for each completed
    // segment. iOS returns the session transcript, so only Android commits it.
    if (Platform.OS === "android" && event.isFinal) {
      const previous = committedSegmentsRef.current.at(-1);
      if (previous !== transcript) committedSegmentsRef.current.push(transcript);
      publishPartial();
      return;
    }
    if (Platform.OS === "android") publishPartial(transcript);
    else {
      currentTranscriptRef.current = transcript;
      onPartialRef.current?.(transcript);
    }
  });

  useSpeechRecognitionEvent("volumechange", (event) => {
    if (activeRef.current && enabled) setVolume(event.value);
  });

  useSpeechRecognitionEvent("nomatch", () => {
    // Android may emit this after a cancelled segment; retain already committed
    // segments so an otherwise successful long dictation is never truncated.
  });

  useSpeechRecognitionEvent("error", (event) => {
    if (!activeRef.current || !enabled) return;
    activeRef.current = false;
    setStatus("error");
    setVolume(null);
    if (event.error !== "aborted" && !cancelledRef.current) {
      onErrorRef.current(errorMessage(event.error, event.message));
    }
  });

  useSpeechRecognitionEvent("end", () => {
    if (!activeRef.current || !enabled) return;
    activeRef.current = false;
    setStatus("idle");
    setVolume(null);
    complete();
  });

  useEffect(() => {
    if (status !== "starting" && status !== "recording") return;
    const timer = setInterval(() => {
      if (startedAtRef.current) setElapsedMs(Date.now() - startedAtRef.current);
    }, 250);
    return () => clearInterval(timer);
  }, [status]);

  const start = async () => {
    if (!enabled) return;
    if (Platform.OS === "web")
      throw new Error("On-device dictation is unavailable in web browsers.");
    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
      throw new Error("On-device dictation is unavailable on this device.");
    }
    if (!ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()) {
      throw new Error("This device does not support on-device dictation.");
    }
    if ((await ExpoSpeechRecognitionModule.getStateAsync()) !== "inactive") {
      throw new Error("Dictation is already in use. Try again in a moment.");
    }
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted)
      throw new Error("Allow microphone and speech recognition access to dictate.");

    let locale = Intl.DateTimeFormat().resolvedOptions().locale || "en-US";
    if (Platform.OS === "android") {
      const localeSupport = await ExpoSpeechRecognitionModule.getSupportedLocales({
        androidRecognitionServicePackage: ANDROID_ON_DEVICE_SERVICE,
      });
      const installedLocale = matchInstalledLocale(locale, localeSupport.installedLocales);
      if (!installedLocale) {
        const downloadableLocale = matchInstalledLocale(locale, localeSupport.locales);
        if (downloadableLocale) {
          const download = await ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload({
            locale: downloadableLocale,
          });
          throw new Error(
            `${download.message} Finish downloading the language pack, then try again.`,
          );
        }
        throw new Error("No compatible on-device language pack is available on this device.");
      }
      locale = installedLocale;
    }

    cancelledRef.current = false;
    completedRef.current = false;
    committedSegmentsRef.current = [];
    currentTranscriptRef.current = "";
    startedAtRef.current = null;
    setElapsedMs(0);
    setVolume(null);
    activeRef.current = true;
    setStatus("starting");
    try {
      ExpoSpeechRecognitionModule.start({
        ...buildOnDeviceSpeechOptions(locale),
        ...(Platform.OS === "android"
          ? { androidRecognitionServicePackage: ANDROID_ON_DEVICE_SERVICE }
          : {}),
        volumeChangeEventOptions: { enabled: true, intervalMillis: 150 },
      });
    } catch (error) {
      activeRef.current = false;
      setStatus("idle");
      throw error;
    }
  };

  const stop = () => {
    if (!activeRef.current) return;
    ExpoSpeechRecognitionModule.stop();
  };

  const cancel = () => {
    cancelledRef.current = true;
    completedRef.current = true;
    activeRef.current = false;
    setStatus("idle");
    setVolume(null);
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {}
  };

  useEffect(() => cancel, []);

  return { status, elapsedMs, volume, start, stop, cancel };
}
