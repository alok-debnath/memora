import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import * as Speech from "expo-speech";
import { logDevError } from "@/lib/devLog";

const DEFAULT_SPEECH_RATE = Platform.OS === "android" ? 1.0 : 1.02;
const DEFAULT_SPEECH_PITCH = 1;
const MIN_SPEECH_RATE = 0.98;
const MAX_SPEECH_RATE = 1.08;
const MIN_SPEECH_PITCH = 0.96;
const MAX_SPEECH_PITCH = 1.04;
const SENTENCE_BREAK_PAUSE_MS = 60;
const CLAUSE_BREAK_PAUSE_MS = 35;
const SHORT_BREAK_PAUSE_MS = 18;

function getPreferredSpeechLocale() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || "en-US";
  } catch {
    return "en-US";
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function splitLongSpeechChunk(text: string, maxLength: number) {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let current = "";
  for (const word of text.split(" ")) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxLength) {
      current = next;
      continue;
    }
    if (current) chunks.push(current.trim());
    current = word;
  }
  if (current) chunks.push(current.trim());
  return chunks;
}

function chunkTextForSpeech(text: string, maxLength: number) {
  const sentenceCandidates = text
    .replace(/([.!?])\s+/g, "$1|")
    .split("|")
    .map((segment) => segment.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  for (const sentence of sentenceCandidates) {
    if (sentence.length <= maxLength) {
      chunks.push(sentence);
      continue;
    }

    const clauseCandidates = sentence
      .replace(/([,;:])\s+/g, "$1|")
      .split("|")
      .map((segment) => segment.trim())
      .filter(Boolean);

    for (const clause of clauseCandidates) {
      chunks.push(...splitLongSpeechChunk(clause, maxLength));
    }
  }

  const targetLength = Math.min(maxLength, 260);
  const grouped: string[] = [];
  let current = "";
  for (const chunk of chunks) {
    const next = current ? `${current} ${chunk}` : chunk;
    if (next.length <= targetLength) {
      current = next;
      continue;
    }
    if (current) grouped.push(current.trim());
    current = chunk;
  }
  if (current) grouped.push(current.trim());
  return grouped;
}

function getChunkPauseMs(chunk: string) {
  if (/[.!?]$/.test(chunk)) return SENTENCE_BREAK_PAUSE_MS;
  if (/[,;:]$/.test(chunk)) return CLAUSE_BREAK_PAUSE_MS;
  return SHORT_BREAK_PAUSE_MS;
}

function getConsistentRate() {
  return clamp(DEFAULT_SPEECH_RATE, MIN_SPEECH_RATE, MAX_SPEECH_RATE);
}

function getConsistentPitch() {
  return clamp(DEFAULT_SPEECH_PITCH, MIN_SPEECH_PITCH, MAX_SPEECH_PITCH);
}

function pickBestSpeechVoice(voices: Speech.Voice[], locale: string): Speech.Voice | null {
  if (!voices.length) return null;

  const localeLower = locale.toLowerCase();
  const localeBase = localeLower.split("-")[0];

  const languageScore = (language: string) => {
    const voiceLang = language.toLowerCase();
    if (voiceLang === localeLower) return 6;
    if (voiceLang.startsWith(`${localeLower}-`) || localeLower.startsWith(`${voiceLang}-`)) {
      return 5;
    }
    if (voiceLang.startsWith(localeBase)) return 4;
    if (voiceLang.startsWith("en")) return 2;
    return 0;
  };

  const naturalnessScore = (name: string) => {
    const normalizedName = name.toLowerCase();
    let score = 0;
    if (
      normalizedName.includes("enhanced") ||
      normalizedName.includes("neural") ||
      normalizedName.includes("premium") ||
      normalizedName.includes("natural") ||
      normalizedName.includes("siri")
    ) {
      score += 2;
    }
    if (
      normalizedName.includes("novelty") ||
      normalizedName.includes("whisper") ||
      normalizedName.includes("compact")
    ) {
      score -= 2;
    }
    return score;
  };

  const platformVoiceScore = (voice: Speech.Voice) => {
    const enriched = voice as Speech.Voice & {
      localService?: boolean;
      isDefault?: boolean;
    };
    let score = 0;
    if (enriched.localService) score += 1;
    if (enriched.isDefault) score += 1;
    return score;
  };

  return (
    [...voices].sort((a, b) => {
      const aScore =
        languageScore(a.language) +
        (a.quality === Speech.VoiceQuality.Enhanced ? 4 : 1) +
        naturalnessScore(a.name) +
        platformVoiceScore(a);
      const bScore =
        languageScore(b.language) +
        (b.quality === Speech.VoiceQuality.Enhanced ? 4 : 1) +
        naturalnessScore(b.name) +
        platformVoiceScore(b);

      if (aScore !== bScore) return bScore - aScore;
      return a.name.localeCompare(b.name);
    })[0] ?? null
  );
}

export function cleanTextForSpeech(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/[*_~]/g, "")
    .replace(/&/g, " and ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([a-zA-Z])\/([a-zA-Z])/g, "$1 or $2")
    .replace(/https?:\/\/\S+/g, " link ")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function useAIChatSpeech() {
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [speechLocale, setSpeechLocale] = useState(getPreferredSpeechLocale);
  const [speechVoiceId, setSpeechVoiceId] = useState<string | undefined>(undefined);
  const speechPlaybackTokenRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    const configureSpeechVoice = async () => {
      const locale = getPreferredSpeechLocale();
      setSpeechLocale(locale);

      try {
        const voices = await Speech.getAvailableVoicesAsync();
        const preferred = pickBestSpeechVoice(voices, locale);
        if (!cancelled) {
          setSpeechVoiceId(preferred?.identifier);
          if (preferred?.language) setSpeechLocale(preferred.language);
        }
      } catch (error) {
        logDevError("AIChatPanel.configureSpeechVoice", error);
      }
    };

    void configureSpeechVoice();
    return () => {
      cancelled = true;
    };
  }, []);

  const stopSpeaking = useCallback(() => {
    speechPlaybackTokenRef.current += 1;
    void Speech.stop();
    setSpeakingId(null);
  }, []);

  const speakMessage = useCallback(
    (id: string, text: string) => {
      if (speakingId === id) {
        stopSpeaking();
        return;
      }

      const cleanText = cleanTextForSpeech(text);
      if (!cleanText) return;

      const chunks = chunkTextForSpeech(cleanText, Math.max(120, Speech.maxSpeechInputLength));
      if (!chunks.length) return;

      stopSpeaking();
      setSpeakingId(id);

      const playbackToken = speechPlaybackTokenRef.current;
      const speakChunk = (index: number) => {
        if (speechPlaybackTokenRef.current !== playbackToken) return;
        if (index >= chunks.length) {
          setSpeakingId(null);
          return;
        }

        const chunk = chunks[index];
        Speech.speak(chunk, {
          language: speechLocale,
          voice: speechVoiceId,
          rate: getConsistentRate(),
          pitch: getConsistentPitch(),
          useApplicationAudioSession: Platform.OS === "ios" ? false : undefined,
          onDone: () => {
            if (speechPlaybackTokenRef.current !== playbackToken) return;
            setTimeout(() => {
              speakChunk(index + 1);
            }, getChunkPauseMs(chunk));
          },
          onStopped: () => {
            if (speechPlaybackTokenRef.current === playbackToken) setSpeakingId(null);
          },
          onError: () => {
            if (speechPlaybackTokenRef.current === playbackToken) setSpeakingId(null);
          },
        });
      };

      speakChunk(0);
    },
    [speakingId, speechLocale, speechVoiceId, stopSpeaking],
  );

  useEffect(() => stopSpeaking, [stopSpeaking]);

  return {
    speakingId,
    speakMessage,
    stopSpeaking,
  };
}
