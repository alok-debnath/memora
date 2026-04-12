import {
  ExpoSpeechRecognitionModule,
  type ExpoSpeechRecognitionOptions,
} from "expo-speech-recognition";
import { Platform } from "react-native";
import { logDevError } from "@/lib/devLog";

function getLocale() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || "en-US";
  } catch {
    return "en-US";
  }
}

/**
 * Minimal options that mirror the Web Speech API approach.
 * We intentionally avoid requiresOnDeviceRecognition and
 * androidRecognitionServicePackage — specifying them is what causes
 * ERROR_CLIENT (5) on devices where the on-device model isn't healthy.
 */
export function buildSpeechRecognitionOptions(): ExpoSpeechRecognitionOptions {
  const lang = getLocale();

  if (Platform.OS === "ios") {
    return {
      lang,
      interimResults: true,
      continuous: false,
      iosTaskHint: "dictation",
      addsPunctuation: true,
    };
  }

  // Android & web: bare minimum, let the system pick the backend
  return {
    lang,
    interimResults: true,
    continuous: false,
    maxAlternatives: 1,
  };
}

export function buildContinuousSpeechOptions(): ExpoSpeechRecognitionOptions {
  const lang = getLocale();
  if (Platform.OS === "ios") {
    return {
      lang,
      interimResults: true,
      continuous: true,
      iosTaskHint: "dictation",
      addsPunctuation: true,
    };
  }
  return {
    lang,
    interimResults: true,
    continuous: true,
    maxAlternatives: 1,
  };
}

export async function startSpeechRecognition(): Promise<{
  ok: boolean;
  reason?: string;
}> {
  try {
    ExpoSpeechRecognitionModule.start(buildSpeechRecognitionOptions());
    return { ok: true };
  } catch (error) {
    logDevError("speechRecognition.start", error);
    return { ok: false, reason: "Speech recognition could not be started." };
  }
}

export async function requestSpeechPermission(): Promise<boolean> {
  try {
    const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    return result.granted;
  } catch (error) {
    logDevError("speechRecognition.requestPermission", error);
    return false;
  }
}

export function isSpeechRecognitionAvailable(): boolean {
  try {
    return ExpoSpeechRecognitionModule.isRecognitionAvailable();
  } catch {
    return false;
  }
}

/** Pick the best transcript from a result event's alternatives. */
export function getBestTranscript(
  results: Array<{ transcript: string; confidence?: number }>,
): string {
  if (!results.length) return "";
  // With maxAlternatives: 1 this is always results[0], but handle multiple just in case
  const best = results.reduce((a, b) => ((b.confidence ?? 0) > (a.confidence ?? 0) ? b : a));
  return best.transcript.replace(/\s+/g, " ").trim();
}
