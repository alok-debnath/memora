import {
  ExpoSpeechRecognitionModule,
  type ExpoSpeechRecognitionOptions,
} from "expo-speech-recognition";
import { Platform } from "react-native";

export function buildOnDeviceSpeechOptions(lang: string): ExpoSpeechRecognitionOptions {
  return {
    lang,
    interimResults: true,
    continuous: true,
    maxAlternatives: 1,
    requiresOnDeviceRecognition: true,
    addsPunctuation: true,
    ...(Platform.OS === "ios" ? { iosTaskHint: "dictation" as const } : {}),
  };
}

export function getBestTranscript(results: Array<{ transcript: string; confidence?: number }>) {
  if (!results.length) return "";
  return results
    .reduce((best, candidate) =>
      (candidate.confidence ?? 0) > (best.confidence ?? 0) ? candidate : best,
    )
    .transcript.replace(/\s+/g, " ")
    .trim();
}
