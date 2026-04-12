import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  TextInput,
  FlatList,
  Pressable,
  Platform,
  Alert,
  View,
  Text as RNText,
} from "react-native";
import Clipboard from "@react-native-clipboard/clipboard";
import { XStack, YStack, Text, TooltipSimple } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import { Feather, FontAwesome5 } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";
import Markdown from "react-native-markdown-display";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  LinearTransition,
  type SharedValue,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  withSpring,
  ZoomIn,
} from "react-native-reanimated";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  KeyboardStickyView,
  useReanimatedKeyboardAnimation,
} from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { FontFamily } from "@/constants/fonts";
import { useAppToast } from "@/components/ui/toast";
import { useAppConfirm } from "@/components/ui/confirm/AppConfirmProvider";
import { logDevError } from "@/lib/devLog";
import { Badge } from "@/components/ui/Badge";
import { ContextMenu, type ContextMenuHandle, type ContextMenuItemDef } from "@/components/ui/ContextMenu";
import type { MemoryNote } from "@/types/memory";
import { getReminderDate, inferMemoryEntryKind } from "@/types/memoryKind";
import { AttachmentPreviewBar } from "@/components/AttachmentPreviewBar";
import { AttachmentPickerButton } from "@/components/AttachmentPickerButton";
import { useFileAttachments, type PendingAttachment } from "@/hooks/useFileAttachments";
import { Linking, StyleSheet } from "react-native";
import { integrationAccentColors, statusAccentColors } from "@/constants/colors";
import { withAlpha } from "@/components/ui/themeHelpers";
import { useUIStore } from "@/store/ui";

// ─── Constants ────────────────────────────────────────────────────────────────

const CHAT = {
  bubbleRadius: 18,
  bubblePadding: 14,
  messageGap: 14,
  bodyPad: 18,
  panelRadius: 22,
} as const;

const FEATURE_BULLETS = [
  "Save memories and reminders",
  "Find anything instantly",
  "Edit or delete entries",
  "Sync reminders to Google Calendar",
];

const DEFAULT_SPEECH_RATE = Platform.OS === "android" ? 1.0 : 1.02;
const DEFAULT_SPEECH_PITCH = 1;
const MIN_SPEECH_RATE = 0.98;
const MAX_SPEECH_RATE = 1.08;
const MIN_SPEECH_PITCH = 0.96;
const MAX_SPEECH_PITCH = 1.04;
const SENTENCE_BREAK_PAUSE_MS = 60;
const CLAUSE_BREAK_PAUSE_MS = 35;
const SHORT_BREAK_PAUSE_MS = 18;

const getSurfaceShadow = (shadowColor: string) => Platform.select({
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

const getBubbleShadow = (shadowColor: string) => Platform.select({
  ios: {
    shadowColor,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
  },
  android: {
    elevation: 0,
  },
  default: {},
});

const PROGRESS_LAYOUT = LinearTransition.springify()
  .damping(18)
  .stiffness(180);

const AnimatedRNText = Animated.createAnimatedComponent(RNText);

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

function formatMessageTime(timestamp: number) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  } catch {
    const hours = date.getHours();
    const minutes = `${date.getMinutes()}`.padStart(2, "0");
    return `${hours}:${minutes}`;
  }
}

function formatReminderDueAt(dueAt?: string | null) {
  if (!dueAt) return null;
  const date = new Date(dueAt);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

function cleanTextForSpeech(text: string) {
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

function splitLongSpeechChunk(text: string, maxLength: number) {
  if (text.length <= maxLength) {
    return [text];
  }

  const words = text.split(" ");
  const chunks: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxLength) {
      current = next;
    } else {
      if (current) chunks.push(current.trim());
      current = word;
    }
  }

  if (current) {
    chunks.push(current.trim());
  }

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
  if (current) {
    grouped.push(current.trim());
  }

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

function pickBestSpeechVoice(
  voices: Speech.Voice[],
  locale: string,
): Speech.Voice | null {
  if (!voices.length) return null;

  const localeLower = locale.toLowerCase();
  const localeBase = localeLower.split("-")[0];

  const languageScore = (language: string) => {
    const voiceLang = language.toLowerCase();
    if (voiceLang === localeLower) return 6;
    if (voiceLang.startsWith(`${localeLower}-`) || localeLower.startsWith(`${voiceLang}-`)) return 5;
    if (voiceLang.startsWith(localeBase)) return 4;
    if (voiceLang.startsWith("en")) return 2;
    return 0;
  };

  const naturalnessScore = (name: string) => {
    const normalizedName = name.toLowerCase();
    let score = 0;
    if (
      normalizedName.includes("enhanced")
      || normalizedName.includes("neural")
      || normalizedName.includes("premium")
      || normalizedName.includes("natural")
      || normalizedName.includes("siri")
    ) {
      score += 2;
    }
    if (
      normalizedName.includes("novelty")
      || normalizedName.includes("whisper")
      || normalizedName.includes("compact")
    ) {
      score -= 2;
    }
    return score;
  };

  const platformVoiceScore = (voice: Speech.Voice) => {
    const enrichedVoice = voice as Speech.Voice & {
      localService?: boolean;
      isDefault?: boolean;
    };

    let score = 0;
    if (enrichedVoice.localService) score += 1;
    if (enrichedVoice.isDefault) score += 1;
    return score;
  };

  return [...voices].sort((a, b) => {
    const aScore = languageScore(a.language)
      + (a.quality === Speech.VoiceQuality.Enhanced ? 4 : 1)
      + naturalnessScore(a.name)
      + platformVoiceScore(a);
    const bScore = languageScore(b.language)
      + (b.quality === Speech.VoiceQuality.Enhanced ? 4 : 1)
      + naturalnessScore(b.name)
      + platformVoiceScore(b);

    if (aScore !== bScore) return bScore - aScore;
    return a.name.localeCompare(b.name);
  })[0] ?? null;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface AIChatPanelProps {
  compact?: boolean;
  token?: string | null;
}

type ChatMsg = {
  _id: string;
  role: string;
  content: string;
  _creationTime: number;
  attachments?: Array<{ attachmentId: string; name: string; type: string; mimeType: string }>;
};

type DeletionItem = {
  id: string;
  title: string;
  content: string;
  entry_kind: string;
};

// Matches the shape produced by toMemorySummary() in convex/actions/memoryChat.ts
type SearchResultItem = {
  id: string;           // Convex _id, re-keyed to 'id' by toMemorySummary
  title?: string;
  content?: string;
  entry_kind: string;   // snake_case from toMemorySummaryFields
  schedule_due_at?: string | null;
  google_event_id?: string;
  google_sync_status?: "pending" | "synced" | "failed";
  google_sync_message?: string;
  google_sync_updated_at?: number;
  _score?: number;
};

// ─── Memory Note Conversion ───────────────────────────────────────────────────

function chatToMemoryNote(m: Record<string, unknown>): MemoryNote {
  return {
    id: m._id as string,
    userId: (m.userId as string) || "",
    title: (m.title as string) || "",
    content: (m.content as string) || "",
    primaryTopicId: m.primaryTopicId as string | undefined,
    topicIds: m.topicIds as string[] | undefined,
    people: (m.people as string[]) || [],
    locations: (m.locations as string[]) || [],
    importance: (m.importance || "normal") as MemoryNote["importance"],
    lifeArea: m.lifeArea as MemoryNote["lifeArea"],
    contextTags: m.contextTags as Record<string, string> | undefined,
    sentimentScore: m.sentimentScore as number | undefined,
    linkedUrls: Array.isArray(m.linkedUrls) ? m.linkedUrls : [],
    extractedActions: m.extractedActions as MemoryNote["extractedActions"],
    entryKind: inferMemoryEntryKind(m as Parameters<typeof inferMemoryEntryKind>[0]),
    schedule: m.schedule as MemoryNote["schedule"] | undefined,
    reminderDate: getReminderDate(m as Parameters<typeof getReminderDate>[0]),
    isRecurring: (m.schedule as { isRecurring?: boolean } | undefined)?.isRecurring ?? false,
    recurrenceType: (m.schedule as { recurrenceType?: MemoryNote["recurrenceType"] } | undefined)
      ?.recurrenceType,
    capsuleUnlockDate: m.capsuleUnlockDate as string | undefined,
    isPublic: m.isPublic as boolean | undefined,
    googleEventId: m.googleEventId as string | undefined,
    googleSyncStatus: m.googleSyncStatus as MemoryNote["googleSyncStatus"] | undefined,
    googleSyncMessage: m.googleSyncMessage as string | undefined,
    googleSyncUpdatedAt: m.googleSyncUpdatedAt as number | undefined,
    createdAt: new Date(m._creationTime as number).toISOString(),
    updatedAt: new Date(m._creationTime as number).toISOString(),
  };
}

// ─── Deletion Proposal Helpers ────────────────────────────────────────────────

function parseDeletionProposal(content: string): { items: DeletionItem[]; cleanText: string } | null {
  const marker = "<!--MEMORA_DELETION_PROPOSAL:";
  const endMarker = "-->";
  const startIdx = content.indexOf(marker);
  if (startIdx === -1) return null;
  const endIdx = content.indexOf(endMarker, startIdx + marker.length);
  if (endIdx === -1) return null;
  try {
    const jsonStr = content.slice(startIdx + marker.length, endIdx);
    const items = JSON.parse(jsonStr) as DeletionItem[];
    // We only clean the text from the FIRST marker we find (usually at the end)
    const cleanText = content.slice(0, startIdx).trim();
    return { items, cleanText };
  } catch {
    return null;
  }
}

function extractSpeakableText(content: string): string {
  let text = content;
  // Strip deletion proposal marker
  const dParsed = parseDeletionProposal(text);
  if (dParsed) text = dParsed.cleanText;
  // Strip card IDs marker
  const cParsed = parseCardIds(text);
  if (cParsed) text = cParsed.cleanText;
  // Strip legacy search results marker if present
  text = text.replace(/<!--MEMORA_SEARCH_RESULTS:[\s\S]*?-->/g, "");
  // Strip any remaining HTML comments (safety net)
  text = text.replace(/<!--[\s\S]*?-->/g, "").trim();
  return text;
}

type CardFlowAttachment = {
  name: string;
  type: "image" | "document";
  status: "completed" | "failed";
  method?: "gemini" | "openai" | "pdf-extract";
};

type CardFlowSummary = {
  assistantProvider: "openai";
  turns: number;
  cardCount: number;
  pathMode: "cached" | "fresh";
  hasFiles: boolean;
};

type CardFlowStep =
  | {
      kind: "grounding";
      query?: string;
      resultCount: number;
      cacheState?: "cached" | "fresh";
      searchMode?: "recent_only" | "semantic_fresh" | "semantic_cached";
    }
  | {
      kind: "search";
      query?: string;
      resultCount: number;
      cacheState?: "cached" | "fresh";
      searchMode?: "recent_only" | "semantic_fresh" | "semantic_cached";
    }
  | {
      kind: "files";
      total: number;
      completed: number;
      failed: number;
      methods?: Array<"gemini" | "openai" | "pdf-extract">;
    }
  | {
      kind: "tool";
      toolName: string;
      label?: string;
    }
  | {
      kind: "reasoning";
      turns: number;
      assistantProvider?: "openai";
    }
  | {
      kind: "result";
      cardCount: number;
    };

type CardFlow = {
  assistantProvider?: "openai";
  toolSequence?: string[];
  searches?: unknown[];
  attachments?: CardFlowAttachment[];
  summary: CardFlowSummary;
  steps: CardFlowStep[];
};

function parseCardIds(content: string): { 
  ids: string[]; 
  isCached: boolean; 
  turns?: number;
  flow?: CardFlow;
  cleanText: string 
} | null {
  const marker = "<!--MEMORA_CARD_IDS:";
  const endMarker = "-->";
  const startIdx = content.indexOf(marker);
  if (startIdx === -1) return null;
  const endIdx = content.indexOf(endMarker, startIdx + marker.length);
  if (endIdx === -1) return null;
  try {
    const parsed = JSON.parse(content.slice(startIdx + marker.length, endIdx));
    const ids: string[] = Array.isArray(parsed.ids) ? parsed.ids : [];
    const isCached: boolean = parsed.isCached ?? false;
    const turns: number | undefined = typeof parsed.turns === "number" ? parsed.turns : undefined;
    const flow: CardFlow | undefined =
      parsed.flow &&
      typeof parsed.flow === "object" &&
      parsed.flow.summary &&
      parsed.flow.steps
        ? parsed.flow as CardFlow
        : undefined;
    
    // Remove only THIS marker from the text
    const markerFull = content.slice(startIdx, endIdx + endMarker.length);
    const cleanText = content.replace(markerFull, "").trim();
    
    return ids.length > 0 ? { ids, isCached, turns, flow, cleanText } : null;
  } catch {
    return null;
  }
}

// ─── Deletion Proposal Card ───────────────────────────────────────────────────

type CardState = "idle" | "deleting" | "done" | "cancelled";

function DeletionProposalCard({
  items,
  token,
  theme,
}: {
  items: DeletionItem[];
  token: string | null | undefined;
  theme: ReturnType<typeof useAppTheme>;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(items.map((i) => i.id)));
  const [cardState, setCardState] = useState<CardState>("idle");
  const [resultCount, setResultCount] = useState(0);
  const removeMany = useMutation(api.memories.removeMany);

  const toggleItem = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!token) return;
    const ids = Array.from(selected);
    if (!ids.length) {
      setCardState("cancelled");
      return;
    }
    setCardState("deleting");
    try {
      await removeMany({ token, ids });
      setResultCount(ids.length);
      setCardState("done");
    } catch {
      setCardState("idle");
    }
  }, [token, selected, removeMany]);

  const handleCancel = useCallback(() => setCardState("cancelled"), []);

  const selectedCount = selected.size;

  // ── Done state ──────────────────────────────────────────────────────────────
  if (cardState === "done") {
    return (
      <Animated.View entering={FadeIn.duration(300)} style={{ marginTop: 6 }}>
        <XStack
          backgroundColor={theme.backgroundStrong.val}
          borderWidth={1}
          borderColor={withAlpha(statusAccentColors.success, "59")}
          borderRadius={16}
          padding={14}
          gap={12}
          alignItems="center"
          style={getBubbleShadow(theme.shadowColor.val)}
        >
          <View style={{
            width: 34, height: 34, borderRadius: 17,
            backgroundColor: withAlpha(statusAccentColors.success, "26"),
            alignItems: "center", justifyContent: "center",
          }}>
            <Feather name="check" size={16} color={statusAccentColors.success} />
          </View>
          <YStack flex={1}>
            <Text fontSize={13} fontFamily={FontFamily.semiBold} color="$color">
              {resultCount === 1 ? "1 item deleted" : `${resultCount} items deleted`}
            </Text>
            <Text fontSize={11} fontFamily="$body" color="$colorMuted" marginTop={2}>
              Moved to trash · Restore anytime from Data
            </Text>
          </YStack>
        </XStack>
      </Animated.View>
    );
  }

  // ── Cancelled state ─────────────────────────────────────────────────────────
  if (cardState === "cancelled") {
    return (
      <Animated.View entering={FadeIn.duration(300)} style={{ marginTop: 6 }}>
        <XStack
          backgroundColor={theme.backgroundStrong.val}
          borderWidth={1}
          borderColor="$borderColor"
          borderRadius={16}
          padding={14}
          gap={12}
          alignItems="center"
          style={getBubbleShadow(theme.shadowColor.val)}
        >
          <View style={{
            width: 34, height: 34, borderRadius: 17,
            backgroundColor: theme.accent.val,
            alignItems: "center", justifyContent: "center",
          }}>
            <Feather name="x" size={16} color={theme.colorMuted.val} />
          </View>
          <Text fontSize={13} fontFamily="$body" color="$colorMuted">
            Nothing was deleted
          </Text>
        </XStack>
      </Animated.View>
    );
  }

  // ── Idle / deleting state ───────────────────────────────────────────────────
  return (
    <Animated.View entering={FadeInDown.duration(300)} style={{ marginTop: 6 }}>
      <YStack
        backgroundColor={theme.backgroundStrong.val}
        borderWidth={1}
        borderColor="$borderColor"
        borderRadius={16}
        overflow="hidden"
        style={getBubbleShadow(theme.shadowColor.val)}
      >
        {/* Header */}
        <XStack
          paddingHorizontal={14}
          paddingTop={12}
          paddingBottom={10}
          alignItems="center"
          justifyContent="space-between"
          borderBottomWidth={1}
          borderBottomColor="$borderColor"
        >
          <XStack gap={7} alignItems="center">
            <Feather name="trash-2" size={13} color={theme.colorMuted.val} />
            <Text fontSize={13} fontFamily={FontFamily.semiBold} color="$color">
              {items.length === 1 ? "1 item found" : `${items.length} items found`}
            </Text>
          </XStack>
          {selectedCount < items.length ? (
            <Pressable
              onPress={() => setSelected(new Set(items.map((i) => i.id)))}
              hitSlop={8}
            >
              <Text fontSize={11} fontFamily={FontFamily.semiBold} color={theme.primary.val}>
                {selectedCount === 0 ? "Select all" : `${selectedCount} of ${items.length} · Select all`}
              </Text>
            </Pressable>
          ) : (
            <Text fontSize={11} fontFamily="$body" color="$colorMuted">
              All selected
            </Text>
          )}
        </XStack>

        {/* Item rows */}
        <YStack>
          {items.map((item, index) => {
            const isSelected = selected.has(item.id);
            const isReminder = item.entry_kind === "reminder";
            return (
              <Pressable
                key={item.id}
                onPress={() => cardState !== "deleting" && toggleItem(item.id)}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.75 : 1,
                })}
              >
                <XStack
                  paddingHorizontal={14}
                  paddingVertical={11}
                  gap={12}
                  alignItems="center"
                  borderTopWidth={index > 0 ? 1 : 0}
                  borderTopColor="$borderColor"
                  backgroundColor={isSelected ? `${theme.primary.val}08` : "transparent"}
                >
                  {/* Checkbox */}
                  <View style={{
                    width: 22, height: 22, borderRadius: 11,
                    borderWidth: 1.5,
                    borderColor: isSelected ? theme.primary.val : theme.borderColor.val,
                    backgroundColor: isSelected ? theme.primary.val : "transparent",
                    alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    {isSelected && <Feather name="check" size={12} color={theme.textInverse.val} />}
                  </View>

                  {/* Content */}
                  <YStack flex={1} gap={3}>
                    <XStack gap={5} alignItems="center">
                      <Feather
                        name={isReminder ? "bell" : "archive"}
                        size={11}
                        color={isSelected ? theme.primary.val : theme.colorMuted.val}
                      />
                      <Text
                        fontSize={13}
                        fontFamily={FontFamily.semiBold}
                        color={isSelected ? "$color" : "$colorMuted"}
                        numberOfLines={1}
                        flex={1}
                      >
                        {item.title}
                      </Text>
                    </XStack>
                    {item.content ? (
                      <Text
                        fontSize={11}
                        fontFamily="$body"
                        color="$colorMuted"
                        numberOfLines={1}
                        opacity={isSelected ? 1 : 0.6}
                      >
                        {item.content}
                      </Text>
                    ) : null}
                  </YStack>
                </XStack>
              </Pressable>
            );
          })}
        </YStack>

        {/* Action buttons */}
        <XStack
          padding={12}
          gap={8}
          borderTopWidth={1}
          borderTopColor="$borderColor"
        >
          <Pressable
            onPress={handleCancel}
            disabled={cardState === "deleting"}
            style={({ pressed }) => ({
              flex: 1,
              paddingVertical: 11,
              borderRadius: 12,
              alignItems: "center",
              backgroundColor: theme.accent.val,
              opacity: pressed || cardState === "deleting" ? 0.6 : 1,
            })}
          >
            <Text fontSize={13} fontFamily={FontFamily.semiBold} color="$colorMuted">
              Cancel
            </Text>
          </Pressable>

          <Pressable
            onPress={handleConfirm}
            disabled={cardState === "deleting" || selectedCount === 0}
            style={({ pressed }) => ({
              flex: 2,
              paddingVertical: 11,
              borderRadius: 12,
              alignItems: "center",
              backgroundColor:
                selectedCount === 0 ? theme.accent.val : statusAccentColors.error,
              opacity: pressed || cardState === "deleting" || selectedCount === 0 ? 0.6 : 1,
            })}
          >
            <Text
              fontSize={13}
              fontFamily={FontFamily.semiBold}
              color={selectedCount === 0 ? "$colorMuted" : theme.textInverse.val}
            >
              {cardState === "deleting"
                ? "Deleting…"
                : selectedCount === 0
                  ? "Select items"
                  : `Delete ${selectedCount}`}
            </Text>
          </Pressable>
        </XStack>
      </YStack>
    </Animated.View>
  );
}

// ─── Search Result Row (extracted so each row has its own ContextMenu ref) ─────

function SearchResultRow({
  item,
  index,
  theme,
  token,
  isCompleted,
  onComplete,
  onDelete,
  onEdit,
  onTriggerSync,
  onRemoveSync,
  hasFiles = false,
}: {
  item: SearchResultItem;
  index: number;
  theme: ReturnType<typeof useAppTheme>;
  token?: string | null;
  isCompleted: boolean;
  onComplete: (item: SearchResultItem) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
  onTriggerSync: (item: SearchResultItem) => void;
  onRemoveSync: (item: SearchResultItem) => void;
  hasFiles?: boolean;
}) {
  const menuRef = useRef<ContextMenuHandle>(null);
  const isReminder = item.entry_kind === "reminder" || !!item.schedule_due_at;
  const hasGoogleSyncInfo = !!(
    item.google_event_id ||
    item.google_sync_status ||
    item.google_sync_message
  );
  const dueAtLabel = formatReminderDueAt(item.schedule_due_at);
  const SUCCESS = theme.success.val;
  const syncTone =
    item.google_sync_status === "synced"
      ? {
          border: withAlpha(theme.success.val, "47"),
          bg: theme.surfaceSuccessSoft.val,
          label: "synced",
          labelColor: theme.textSuccess.val,
        }
      : item.google_sync_status === "failed"
        ? {
            border: withAlpha(theme.destructive.val, "3D"),
            bg: theme.surfaceDangerSoft.val,
            label: "sync failed",
            labelColor: theme.textError.val,
          }
        : {
            border: withAlpha(theme.warning.val, "3D"),
            bg: withAlpha(theme.warning.val, "14"),
            label: "syncing\u2026",
            labelColor: theme.textWarning.val,
          };
  const showTriggerSyncAction =
    isReminder && (!hasGoogleSyncInfo || item.google_sync_status === "failed");
  const showRemoveSyncAction = isReminder && hasGoogleSyncInfo;

  const menuItems: ContextMenuItemDef[] = [
    ...(isReminder && !isCompleted
      ? [{
          label: "Mark as Completed",
          icon: "check-circle" as const,
          iconColor: SUCCESS,
          onPress: () => onComplete(item),
        }]
      : []),
    ...(showTriggerSyncAction
      ? [{
          label:
            item.google_sync_status === "failed"
              ? "Retry Calendar Sync"
              : "Sync to Calendar",
          icon: "refresh-cw" as const,
          iconColor: theme.primary.val,
          onPress: () => onTriggerSync(item),
        }]
      : []),
    ...(showRemoveSyncAction
      ? [{
          label: "Remove Calendar Sync",
          icon: "link-2" as const,
          destructive: true as const,
          onPress: () => onRemoveSync(item),
        }]
      : []),
    {
      label: "Edit Memory",
      icon: "edit-2" as const,
      onPress: () => onEdit(item.id),
    },
    {
      label: "Delete",
      icon: "trash-2" as const,
      destructive: true as const,
      onPress: () => onDelete(item.id),
    },
  ];

  // Preview card shown in the blur overlay (mirroring the home screen style)
  const previewCard = (
    <YStack
      padding={14}
      gap={8}
    >
      <XStack gap={10} alignItems="center">
        <View style={{
          width: 36, height: 36, borderRadius: 18,
          backgroundColor: isReminder ? theme.warning.val + "18" : theme.primary.val + "15",
          alignItems: "center", justifyContent: "center",
        }}>
          <Feather
            name={isReminder ? "bell" : "file-text"}
            size={16}
            color={isReminder ? theme.warning.val : theme.primary.val}
          />
        </View>
        <YStack flex={1} gap={2}>
          <Text fontSize={14} fontFamily={FontFamily.semiBold} color="$color" numberOfLines={2}>
            {item.title || "Untitled memory"}
          </Text>
          {item.entry_kind && (
            <Text fontSize={11} color="$colorMuted">
              {isReminder ? "Reminder" : "Memory"}
            </Text>
          )}
        </YStack>
      </XStack>
      {item.content ? (
        <Text fontSize={12} fontFamily="$body" color="$colorMuted" numberOfLines={3}>
          {item.content}
        </Text>
      ) : null}
      {isReminder && dueAtLabel ? (
        <XStack alignItems="center" gap={5}>
          <Feather name="bell" size={11} color={theme.primary.val} />
          <Text fontSize={11} fontFamily={FontFamily.semiBold} color="$primary">
            {dueAtLabel}
          </Text>
        </XStack>
      ) : null}
      {isReminder && (hasGoogleSyncInfo || hasFiles) ? (
        <XStack marginTop={6} gap={6} alignItems="center" flexWrap="wrap">
          {isReminder && hasGoogleSyncInfo ? (
            <XStack
              alignItems="center"
              gap={4}
              paddingHorizontal={8}
              paddingVertical={5}
              borderRadius={20}
              borderWidth={1}
              borderColor={syncTone.border}
              backgroundColor={syncTone.bg}
            >
              <FontAwesome5 name="calendar-alt" size={12} color={syncTone.labelColor} />
              <Text fontSize={11} fontFamily={FontFamily.semiBold} color={syncTone.labelColor}>
                {syncTone.label}
              </Text>
            </XStack>
          ) : null}
          {hasFiles ? (
            <XStack
              alignItems="center"
              gap={4}
              paddingHorizontal={8}
              paddingVertical={5}
              borderRadius={20}
              borderWidth={1}
              borderColor={withAlpha(integrationAccentColors.googleDrive, "40")}
              backgroundColor={withAlpha(integrationAccentColors.googleDrive, "12")}
            >
              <FontAwesome5 name="google-drive" size={12} color={integrationAccentColors.googleDrive} />
              <Text fontSize={11} fontFamily={FontFamily.semiBold} color={integrationAccentColors.googleDrive}>
                in Drive
              </Text>
            </XStack>
          ) : null}
        </XStack>
      ) : null}
    </YStack>
  );

  return (
    <Animated.View entering={FadeInDown.duration(260).delay(index * 55)}>
      <ContextMenu ref={menuRef} items={menuItems} preview={previewCard} previewFrame>
        <XStack
          paddingHorizontal={14}
          paddingVertical={11}
          gap={12}
          alignItems="center"
          borderTopWidth={index > 0 ? 1 : 0}
          borderTopColor="$borderColor"
          opacity={isCompleted ? 0.45 : 1}
        >
          {/* Icon */}
          <View style={{
            width: 32, height: 32, borderRadius: 16,
            backgroundColor: isCompleted ? SUCCESS + "20" : theme.accent.val,
            alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <Feather
              name={isCompleted ? "check" : isReminder ? "bell" : "file-text"}
              size={14}
              color={isCompleted ? SUCCESS : theme.colorMuted.val}
            />
          </View>

          {/* Content */}
          <YStack flex={1} gap={6}>
            <Text
              fontSize={13}
              fontFamily={FontFamily.semiBold}
              color="$color"
              numberOfLines={1}
              textDecorationLine={isCompleted ? "line-through" : "none"}
            >
              {item.title || "Untitled memory"}
            </Text>
            {item.content ? (
              <Text fontSize={11} fontFamily="$body" color="$colorMuted" numberOfLines={1}>
                {item.content}
              </Text>
            ) : null}
            {isReminder && dueAtLabel ? (
              <XStack alignItems="center" gap={5}>
                <Feather name="bell" size={10} color={theme.primary.val} />
                <Text fontSize={10} fontFamily={FontFamily.semiBold} color="$primary">
                  {dueAtLabel}
                </Text>
              </XStack>
            ) : null}
            {(isReminder && hasGoogleSyncInfo) || hasFiles ? (
              <XStack marginTop={2} gap={5} alignItems="center" flexWrap="wrap">
                {isReminder && hasGoogleSyncInfo ? (
                  <XStack
                    alignItems="center"
                    gap={4}
                    paddingHorizontal={7}
                    paddingVertical={4}
                    borderRadius={20}
                    borderWidth={1}
                    borderColor={syncTone.border}
                    backgroundColor={syncTone.bg}
                  >
                    <FontAwesome5 name="calendar-alt" size={10} color={syncTone.labelColor} />
                    <Text fontSize={10} fontFamily={FontFamily.semiBold} color={syncTone.labelColor}>
                      {syncTone.label}
                    </Text>
                  </XStack>
                ) : null}
                {hasFiles ? (
                  <XStack
                    alignItems="center"
                    gap={4}
                    paddingHorizontal={7}
                    paddingVertical={4}
                    borderRadius={20}
                    borderWidth={1}
                    borderColor={withAlpha(integrationAccentColors.googleDrive, "40")}
                    backgroundColor={withAlpha(integrationAccentColors.googleDrive, "12")}
                  >
                    <FontAwesome5 name="google-drive" size={10} color={integrationAccentColors.googleDrive} />
                    <Text fontSize={10} fontFamily={FontFamily.semiBold} color={integrationAccentColors.googleDrive}>
                      in Drive
                    </Text>
                  </XStack>
                ) : null}
              </XStack>
            ) : null}
          </YStack>

          {/* 3-dot menu button — tap opens the same context menu as long press */}
          <XStack gap={4} alignItems="center">
            {item._score !== undefined && (
              <Text fontSize={10} color="$colorMuted" opacity={0.5}>
                {Math.round(item._score * 100)}%
              </Text>
            )}
            {/* 3-dot menu button */}
            <Pressable
              onPress={() => menuRef.current?.open()}
              hitSlop={8}
              style={({ pressed }) => ({
                width: 28, height: 28, borderRadius: 14,
                alignItems: "center", justifyContent: "center",
                backgroundColor: pressed ? theme.accent.val : "transparent",
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Feather name="more-horizontal" size={16} color={theme.colorMuted.val} />
            </Pressable>
          </XStack>
        </XStack>
      </ContextMenu>
    </Animated.View>
  );
}

// ─── Performance Pill ────────────────────────────────────────────────────────

const TOOL_LABELS: Record<string, string> = {
  search_memories: "Search",
  search_documents: "Docs",
  create_memory: "Create",
  update_memory: "Update",
  sync_reminder: "Sync",
  remove_reminder_sync: "Unsync",
  propose_deletion: "Find delete matches",
  list_deleted_memories: "Load deleted",
  restore_memory: "Restore",
  list_memories: "List",
  get_stats: "Stats",
  analyze_memories: "Analyze",
  history: "History",
  manage_topics: "Topics",
  surface_cards: "Surface cards",
};

function formatToolLabel(toolName: string) {
  return TOOL_LABELS[toolName] ?? toolName.replace(/_/g, " ");
}

type FlowSummaryChip = {
  icon: string;
  label: string;
  value: string;
  color: string;
};

function normalizeCardFlow(
  flow: CardFlow | undefined,
  isCached: boolean,
  turns: number,
  resultCount: number,
) {
  if (!flow?.summary || !Array.isArray(flow.steps) || flow.steps.length === 0) {
    return {
      summary: {
        assistantProvider: "openai" as const,
        turns,
        cardCount: resultCount,
        pathMode: isCached ? "cached" as const : "fresh" as const,
        hasFiles: false,
      },
      steps: [
        {
          kind: "reasoning" as const,
          turns,
          assistantProvider: "openai" as const,
        },
        {
          kind: "result" as const,
          cardCount: resultCount,
        },
      ],
      attachments: [] as CardFlowAttachment[],
    };
  }

  const attachments = flow.attachments ?? [];
  const summary = {
    assistantProvider: flow.summary.assistantProvider,
    turns: flow.summary.turns,
    cardCount: flow.summary.cardCount,
    pathMode: flow.summary.pathMode,
    hasFiles: flow.summary.hasFiles,
  } satisfies CardFlowSummary;

  return {
    summary,
    steps: flow.steps,
    attachments,
  };
}

function getAttachmentMethodSummary(attachments: CardFlowAttachment[]) {
  const completedAttachments = attachments.filter((attachment) => attachment.status === "completed");
  const geminiCount = completedAttachments.filter((attachment) => attachment.method === "gemini").length;
  const openAiVisionCount = completedAttachments.filter((attachment) => attachment.method === "openai").length;
  const directPdfCount = completedAttachments.filter((attachment) => attachment.method === "pdf-extract").length;
  const failedCount = attachments.filter((attachment) => attachment.status === "failed").length;

  return {
    geminiCount,
    openAiVisionCount,
    directPdfCount,
    failedCount,
  };
}

function getFlowCapabilityPills(
  attachments: CardFlowAttachment[],
  theme: ReturnType<typeof useAppTheme>,
) {
  const { geminiCount, openAiVisionCount, directPdfCount, failedCount } =
    getAttachmentMethodSummary(attachments);
  const chips: FlowSummaryChip[] = [
    {
      icon: "cpu",
      label: "OpenAI",
      value: "reply",
      color: theme.primary.val,
    },
  ];

  if (geminiCount > 0) {
    chips.push({
      icon: "image",
      label: "Gemini",
      value: `${geminiCount} file${geminiCount === 1 ? "" : "s"}`,
      color: integrationAccentColors.reasoning,
    });
  }
  if (openAiVisionCount > 0) {
    chips.push({
      icon: "camera",
      label: "Vision fallback",
      value: `${openAiVisionCount}`,
      color: integrationAccentColors.openai,
    });
  }
  if (directPdfCount > 0) {
    chips.push({
      icon: "file-text",
      label: "PDF text",
      value: `${directPdfCount}`,
      color: theme.success.val,
    });
  }
  if (failedCount > 0) {
    chips.push({
      icon: "alert-circle",
      label: "Read failed",
      value: `${failedCount}`,
      color: statusAccentColors.error,
    });
  }

  return chips;
}

function getStepTone(
  step: CardFlowStep,
  theme: ReturnType<typeof useAppTheme>,
) {
  if ((step.kind === "grounding" || step.kind === "search") && step.cacheState === "cached") {
    return statusAccentColors.warning;
  }
  if (step.kind === "files" && step.failed > 0) {
    return statusAccentColors.error;
  }
  if (step.kind === "files") {
    return integrationAccentColors.reasoning;
  }
  if (step.kind === "tool") {
    return theme.primary.val;
  }
  if (step.kind === "reasoning") {
    return integrationAccentColors.reasoning;
  }
  if (step.kind === "result") {
    return theme.success.val;
  }
  return theme.primary.val;
}

function getStepIcon(step: CardFlowStep) {
  switch (step.kind) {
    case "grounding":
      return step.cacheState === "cached" ? "zap" : "database";
    case "search":
      return step.cacheState === "cached" ? "zap" : "search";
    case "files":
      return step.failed > 0 ? "alert-circle" : "paperclip";
    case "tool":
      return "corner-down-right";
    case "reasoning":
      return "cpu";
    case "result":
      return "archive";
  }
}

function describeFlowStep(step: CardFlowStep) {
  switch (step.kind) {
    case "grounding":
      return {
        title: "Grounding",
        detail: step.query?.trim()
          ? `Checked stored context for "${step.query.trim()}".`
          : "Checked stored context before answering.",
        meta: [
          `${step.resultCount} match${step.resultCount === 1 ? "" : "es"}`,
          step.cacheState === "cached" ? "fast cached path" : step.cacheState === "fresh" ? "fresh retrieval" : null,
        ].filter(Boolean) as string[],
      };
    case "search":
      return {
        title: "Memory search",
        detail: step.query?.trim()
          ? `Searched memories for "${step.query.trim()}".`
          : "Searched memories for supporting matches.",
        meta: [
          `${step.resultCount} result${step.resultCount === 1 ? "" : "s"}`,
          step.cacheState === "cached" ? "cached" : step.cacheState === "fresh" ? "fresh" : null,
        ].filter(Boolean) as string[],
      };
    case "files": {
      const methodLabels = [
        step.methods?.includes("gemini") ? "Gemini" : null,
        step.methods?.includes("openai") ? "Vision fallback" : null,
        step.methods?.includes("pdf-extract") ? "PDF text" : null,
      ].filter(Boolean) as string[];
      return {
        title: "File reading",
        detail:
          step.failed > 0
            ? `Read ${step.completed}/${step.total} file${step.total === 1 ? "" : "s"} successfully.`
            : `Processed ${step.total} file${step.total === 1 ? "" : "s"} for this reply.`,
        meta: [
          methodLabels.length > 0 ? methodLabels.join(" · ") : null,
          step.failed > 0 ? `${step.failed} failed` : null,
        ].filter(Boolean) as string[],
      };
    }
    case "tool":
      return {
        title: "Tool action",
        detail: step.label ?? formatToolLabel(step.toolName),
        meta: [],
      };
    case "reasoning":
      return {
        title: "Reasoning",
        detail: `${step.assistantProvider === "openai" ? "OpenAI" : "Assistant"} assembled the reply.`,
        meta: [`${step.turns} pass${step.turns === 1 ? "" : "es"}`],
      };
    case "result":
      return {
        title: "Cards surfaced",
        detail: `${step.cardCount} matching card${step.cardCount === 1 ? "" : "s"} attached to this reply.`,
        meta: [],
      };
  }
}

function FlowSummaryStrip({
  summary,
  attachments,
  theme,
}: {
  summary: ReturnType<typeof normalizeCardFlow>["summary"];
  attachments: CardFlowAttachment[];
  theme: ReturnType<typeof useAppTheme>;
}) {
  const topChips: FlowSummaryChip[] = [
    {
      icon: summary.pathMode === "cached" ? "zap" : "radio",
      label: summary.pathMode === "cached" ? "Fast path" : "Fresh path",
      value: summary.pathMode === "cached" ? "cached" : "fresh",
      color: summary.pathMode === "cached" ? statusAccentColors.warning : theme.primary.val,
    },
    {
      icon: "archive",
      label: "Cards",
      value: `${summary.cardCount}`,
      color: theme.colorMuted.val,
    },
    {
      icon: "layers",
      label: "Passes",
      value: `${summary.turns}`,
      color: summary.turns > 1 ? integrationAccentColors.reasoning : theme.colorMuted.val,
    },
    ...(summary.hasFiles
      ? [{
          icon: "paperclip",
          label: "Files",
          value: `${attachments.length}`,
          color: integrationAccentColors.reasoning,
        }]
      : []),
  ];
  const capabilityPills = getFlowCapabilityPills(attachments, theme);

  return (
    <YStack gap={10}>
      <YStack gap={8}>
        <Text fontSize={10} fontFamily="$body" fontWeight="600" color="$colorMuted" style={{ textTransform: "uppercase", letterSpacing: 0.5 }}>
          Used This Turn
        </Text>
        <XStack gap={8} flexWrap="wrap">
          {topChips.map((chip) => (
            <InsightStatChip
              key={`${chip.label}-${chip.value}`}
              icon={chip.icon}
              label={chip.label}
              value={chip.value}
              color={chip.color}
            />
          ))}
        </XStack>
      </YStack>

      <XStack gap={8} flexWrap="wrap">
        {capabilityPills.map((chip) => (
          <InsightStatChip
            key={`${chip.label}-${chip.value}`}
            icon={chip.icon}
            label={chip.label}
            value={chip.value}
            color={chip.color}
          />
        ))}
      </XStack>
    </YStack>
  );
}

function FlowStepCard({
  step,
  isLast,
  theme,
}: {
  step: CardFlowStep;
  isLast: boolean;
  theme: ReturnType<typeof useAppTheme>;
}) {
  const tone = getStepTone(step, theme);
  const icon = getStepIcon(step);
  const copy = describeFlowStep(step);

  return (
    <XStack gap={10} alignItems="stretch">
      <YStack width={24} alignItems="center">
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: withAlpha(tone, "18"),
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Feather name={icon as any} size={11} color={tone} />
        </View>
        {!isLast ? (
          <View
            style={{
              width: 2,
              flex: 1,
              minHeight: 18,
              marginTop: 6,
              borderRadius: 999,
              backgroundColor: withAlpha(tone, "26"),
            }}
          />
        ) : null}
      </YStack>

      <YStack
        flex={1}
        gap={4}
        padding={12}
        borderRadius={14}
        backgroundColor={withAlpha(tone, "10")}
        borderWidth={1}
        borderColor={withAlpha(tone, "20")}
      >
        <XStack alignItems="center" justifyContent="space-between" gap={10}>
          <Text fontSize={12} fontFamily="$body" fontWeight="700" color="$color">
            {copy.title}
          </Text>
          {(step.kind === "grounding" || step.kind === "search") && step.cacheState ? (
            <Text fontSize={10} fontFamily="$body" fontWeight="700" color={tone}>
              {step.cacheState === "cached" ? "cached" : "fresh"}
            </Text>
          ) : null}
        </XStack>
        <Text fontSize={11} fontFamily="$body" color="$colorMuted" lineHeight={16}>
          {copy.detail}
        </Text>
        {copy.meta.length > 0 ? (
          <XStack gap={6} flexWrap="wrap">
            {copy.meta.map((meta) => (
              <XStack
                key={meta}
                alignItems="center"
                gap={4}
                paddingHorizontal={8}
                paddingVertical={4}
                borderRadius={999}
                backgroundColor={withAlpha(theme.backgroundStrong.val, "CC")}
                borderWidth={1}
                borderColor={withAlpha(tone, "18")}
              >
                <View
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: tone,
                  }}
                />
                <Text fontSize={10} fontFamily="$body" color="$colorMuted">
                  {meta}
                </Text>
              </XStack>
            ))}
          </XStack>
        ) : null}
      </YStack>
    </XStack>
  );
}

function FlowTimeline({
  steps,
  summary,
  theme,
}: {
  steps: CardFlowStep[];
  summary: ReturnType<typeof normalizeCardFlow>["summary"];
  theme: ReturnType<typeof useAppTheme>;
}) {
  const tone =
    summary.pathMode === "cached" ? statusAccentColors.warning : theme.primary.val;

  return (
    <YStack
      gap={10}
      padding={12}
      borderRadius={14}
      backgroundColor={withAlpha(tone, "10")}
      borderWidth={1}
      borderColor={withAlpha(tone, "20")}
    >
      <Text fontSize={10} fontFamily="$body" fontWeight="600" color="$colorMuted" style={{ textTransform: "uppercase", letterSpacing: 0.5 }}>
        Current Path
      </Text>
      <YStack gap={10}>
        {steps.map((step, index) => (
          <FlowStepCard
            key={`${step.kind}-${index}-${"toolName" in step ? step.toolName : ""}`}
            step={step}
            isLast={index === steps.length - 1}
            theme={theme}
          />
        ))}
      </YStack>
    </YStack>
  );
}

function SearchStatsPreview({
  isCached,
  turns,
  resultCount,
  canDeepSearch,
  isDeepSearching,
  onDeepSearch,
  flow,
  theme,
}: {
  isCached: boolean;
  turns: number;
  resultCount: number;
  canDeepSearch?: boolean;
  isDeepSearching?: boolean;
  onDeepSearch?: () => void;
  flow?: CardFlow;
  theme: ReturnType<typeof useAppTheme>;
}) {
  const normalizedFlow = normalizeCardFlow(flow, isCached, turns, resultCount);
  const baseColor =
    normalizedFlow.summary.pathMode === "cached"
      ? statusAccentColors.warning
      : normalizedFlow.summary.turns > 1
        ? integrationAccentColors.reasoning
        : theme.primary.val;
  const modeLabel = normalizedFlow.summary.pathMode === "cached" ? "Fast path" : "Fresh path";
  const latestSearchStep = [...normalizedFlow.steps]
    .reverse()
    .find((step) => step.kind === "grounding" || step.kind === "search");
  const subtitle =
    latestSearchStep && "query" in latestSearchStep && latestSearchStep.query?.trim()
      ? `${modeLabel} · "${latestSearchStep.query.trim()}"`
      : `${modeLabel} · ${normalizedFlow.summary.cardCount} ${normalizedFlow.summary.cardCount === 1 ? "card" : "cards"}`;

  return (
    <YStack
      padding={18}
      gap={16}
    >
      <XStack alignItems="center" gap={10}>
        <YStack
          width={42}
          height={42}
          borderRadius={12}
          alignItems="center"
          justifyContent="center"
          backgroundColor={`${baseColor}18`}
        >
          <Feather name="search" size={16} color={baseColor} />
        </YStack>
        <YStack flex={1}>
          <Text fontSize={15} fontFamily="$body" fontWeight="700" color="$color">
            Live flow
          </Text>
          <Text fontSize={11} fontFamily="$body" color="$colorMuted" lineHeight={16}>
            {subtitle}
          </Text>
        </YStack>
      </XStack>

      <FlowSummaryStrip
        summary={normalizedFlow.summary}
        attachments={normalizedFlow.attachments}
        theme={theme}
      />
      <FlowTimeline
        steps={normalizedFlow.steps}
        summary={normalizedFlow.summary}
        theme={theme}
      />

      {canDeepSearch ? (
        <YStack
          gap={10}
          paddingTop={12}
          borderTopWidth={StyleSheet.hairlineWidth}
          borderTopColor="$borderColor"
        >
          <Text fontSize={10} fontFamily="$body" fontWeight="600" color="$colorMuted" style={{ textTransform: "uppercase", letterSpacing: 0.5 }}>
            Optional Fallback
          </Text>
          <YStack
            gap={10}
            padding={12}
            borderRadius={14}
            backgroundColor={withAlpha(integrationAccentColors.reasoning, "14")}
            borderWidth={1}
            borderColor={withAlpha(integrationAccentColors.reasoning, "29")}
          >
            <XStack alignItems="flex-start" gap={8}>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: withAlpha(integrationAccentColors.reasoning, "24"), alignItems: "center", justifyContent: "center" }}>
                <Feather name="refresh-cw" size={13} color={integrationAccentColors.reasoning} />
              </View>
              <YStack flex={1} gap={2}>
                <Text fontSize={12} fontFamily="$body" fontWeight="700" color="$color">
                  {isDeepSearching ? "Running deep scan" : "Deep scan"}
                </Text>
                <Text fontSize={11} fontFamily="$body" color="$colorMuted" lineHeight={17}>
                  Only use this if the fast result looks stale, incomplete, or wrong.
                </Text>
              </YStack>
            </XStack>
            <Pressable
              onPress={isDeepSearching ? undefined : onDeepSearch}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                borderRadius: 12,
                paddingVertical: 10,
                paddingHorizontal: 12,
                backgroundColor: withAlpha(integrationAccentColors.reasoning, "18"),
                borderWidth: 1,
                borderColor: withAlpha(integrationAccentColors.reasoning, "32"),
                opacity: isDeepSearching ? 0.6 : pressed ? 0.75 : 1,
              })}
            >
              <Feather name="refresh-cw" size={12} color={integrationAccentColors.reasoning} />
              <Text fontSize={11} fontFamily={FontFamily.semiBold} color={integrationAccentColors.reasoning}>
                {isDeepSearching ? "Running deep scan..." : "Run deep scan"}
              </Text>
            </Pressable>
          </YStack>
        </YStack>
      ) : null}
    </YStack>
  );
}

function InsightStatChip({
  icon,
  label,
  value,
  color,
}: {
  icon: string;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <XStack
      alignItems="center"
      gap={6}
      paddingHorizontal={10}
      paddingVertical={7}
      borderRadius={999}
      backgroundColor={`${color}12`}
      borderWidth={1}
      borderColor={`${color}22`}
    >
      <Feather name={icon as any} size={11} color={color} />
      <Text fontSize={10} fontFamily="$body" fontWeight="700" color={color}>
        {label}
      </Text>
      <Text fontSize={10} fontFamily="$body" color="$colorMuted">
        {value}
      </Text>
    </XStack>
  );
}

function InsightLine({
  icon,
  color,
  text,
}: {
  icon: string;
  color: string;
  text: string;
}) {
  return (
    <XStack alignItems="flex-start" gap={8}>
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          backgroundColor: `${color}14`,
          alignItems: "center",
          justifyContent: "center",
          marginTop: 1,
        }}
      >
        <Feather name={icon as any} size={11} color={color} />
      </View>
      <Text fontSize={11} fontFamily="$body" color="$colorMuted" flex={1} lineHeight={17}>
        {text}
      </Text>
    </XStack>
  );
}

function PerformancePill({
  isCached,
  turns = 1,
  resultCount,
  flow,
  isDeepSearching = false,
  onDeepSearch,
  theme,
}: {
  isCached: boolean;
  turns?: number;
  resultCount: number;
  flow?: CardFlow;
  isDeepSearching?: boolean;
  onDeepSearch?: () => void;
  theme: ReturnType<typeof useAppTheme>;
}) {
  const menuRef = useRef<ContextMenuHandle>(null);
  const isReasoned = (turns ?? 1) > 1;
  const baseColor = isReasoned
    ? integrationAccentColors.reasoning
    : isCached
      ? statusAccentColors.warning
      : theme.primary.val;
  const handleDeepSearchPress = useCallback(() => {
    menuRef.current?.close();
    onDeepSearch?.();
  }, [onDeepSearch]);

  return (
    <ContextMenu
      ref={menuRef}
      preview={
        <SearchStatsPreview
          isCached={isCached}
          turns={turns ?? 1}
          resultCount={resultCount}
          canDeepSearch={isCached && !!onDeepSearch}
          isDeepSearching={isDeepSearching}
          onDeepSearch={handleDeepSearchPress}
          flow={flow}
          theme={theme}
        />
      }
      items={[]}
      previewMinWidth={300}
      previewFrame
    >
      <View style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 20,
        backgroundColor: `${baseColor}15`,
        borderWidth: 1,
        borderColor: `${baseColor}40`,
      }}>
        <Feather name={isCached ? "zap" : "search"} size={11} color={baseColor} />
        <Text fontSize={11} fontFamily={FontFamily.bold} color={baseColor} style={{ opacity: 0.9 }}>
          {isCached ? "Fast" : "Full scan"}
        </Text>
        {isReasoned && (
          <>
            <View style={{ width: 1, height: 10, backgroundColor: baseColor, opacity: 0.2, marginLeft: 2 }} />
            <Feather name="layers" size={11} color={baseColor} />
            <Text fontSize={11} fontFamily={FontFamily.bold} color={baseColor} style={{ opacity: 0.9 }}>
              {`× ${turns}`}
            </Text>
          </>
        )}
      </View>
    </ContextMenu>
  );
}

// ─── Search Results Card ──────────────────────────────────────────────────────

function SearchResultsCard({
  ids,
  isCached,
  turns = 1,
  flow,
  token,
  theme,
  onDeepSearch,
  onEdit,
}: {
  ids: string[];
  isCached: boolean;
  turns?: number;
  flow?: CardFlow;
  token?: string | null;
  theme: ReturnType<typeof useAppTheme>;
  onDeepSearch?: (query: string) => void;
  onEdit?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [isDeepSearching, setIsDeepSearching] = useState(false);
  const completeMemory = useMutation(api.memories.complete);
  const deleteMemory = useMutation(api.memories.remove);
  const triggerReminderSync = useMutation(api.integrations.triggerReminderSync);
  const removeReminderSync = useMutation(api.integrations.removeReminderSync);
  const { showToast } = useAppToast();
  const { confirm } = useAppConfirm();

  // Fetch full memory docs by ID reactively
  const fetchedDocs = useQuery(
    api.memories.listByIds,
    token && ids.length > 0 ? { token, ids: ids as any[] } : "skip"
  );
  const items: SearchResultItem[] = (fetchedDocs ?? []).map((doc) => ({
    id: doc._id,
    title: doc.title,
    content: doc.content,
    entry_kind: doc.entryKind ?? (doc.schedule?.dueAt ? "reminder" : "memory"),
    schedule_due_at: doc.schedule?.dueAt ?? null,
    google_event_id: doc.googleEventId,
    google_sync_status: doc.googleSyncStatus,
    google_sync_message: doc.googleSyncMessage,
    google_sync_updated_at: doc.googleSyncUpdatedAt,
  }));

  // Batch-fetch attachment counts so we can show the Drive badge per row
  const memoryIds = useMemo(() => (fetchedDocs ?? []).map((d) => d._id), [fetchedDocs]);
  const attachmentCounts = useQuery(
    api.attachments.getAttachmentCountsForMemories,
    token && memoryIds.length > 0 ? { token, memoryIds: memoryIds as any[] } : "skip"
  ) ?? {};

  const displayItems = expanded ? items : items.slice(0, 3);
  const hasMore = items.length > 3;

  const handleComplete = useCallback(async (item: SearchResultItem) => {
    if (!token) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await completeMemory({ token, id: item.id as any });
      setCompletedIds((prev) => new Set([...prev, item.id]));
      showToast({ title: "Marked complete", tone: "success" });
    } catch {
      showToast({ title: "Couldn't complete — try again", tone: "error" });
    }
  }, [token, completeMemory, showToast]);

  const handleDelete = useCallback(async (id: string) => {
    if (!token) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    const confirmed = await confirm({
      title: "Delete Memory",
      message: "This will move the memory to trash.",
      confirmLabel: "Delete",
      tone: "destructive",
      icon: "trash-2",
    });
    if (!confirmed) return;
    try {
      await deleteMemory({ token, id: id as any });
      showToast({ title: "Memory deleted", tone: "success" });
    } catch {
      showToast({ title: "Couldn't delete — try again", tone: "error" });
    }
  }, [confirm, token, deleteMemory, showToast]);

  const handleEdit = useCallback((id: string) => {
    onEdit?.(id);
  }, [onEdit]);

  const handleTriggerSync = useCallback(async (item: SearchResultItem) => {
    if (!token) return;
    try {
      const result = await triggerReminderSync({
        token,
        memoryId: item.id as any,
      });
      showToast({
        title: result.message,
        tone: result.queued ? "success" : "info",
      });
    } catch {
      showToast({ title: "Couldn't trigger Google sync", tone: "error" });
    }
  }, [token, triggerReminderSync, showToast]);

  const handleRemoveSync = useCallback(async (item: SearchResultItem) => {
    if (!token) return;
    const confirmed = await confirm({
      title: "Remove Google sync",
      message:
        "This removes linked Google Calendar event data for this reminder and clears local sync state.",
      confirmLabel: "Remove sync",
      tone: "destructive",
      icon: "link-2",
    });
    if (!confirmed) return;
    try {
      const result = await removeReminderSync({
        token,
        memoryId: item.id as any,
      });
      showToast({
        title: result.message,
        tone: result.removed ? "success" : "info",
      });
    } catch {
      showToast({ title: "Couldn't remove Google sync", tone: "error" });
    }
  }, [confirm, token, removeReminderSync, showToast]);

  const handleDeepSearch = async () => {
    if (!onDeepSearch || isDeepSearching) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsDeepSearching(true);
    try {
      const inferredQuery = items.slice(0, 3).map(i => i.title ?? "").filter(Boolean).join(" ");
      onDeepSearch(inferredQuery);
    } finally {
      setIsDeepSearching(false);
    }
  };

  return (
    <Animated.View entering={FadeInDown.duration(320)} style={{ marginTop: 8 }}>
      <YStack
        backgroundColor={theme.backgroundStrong.val}
        borderWidth={1}
        borderColor="$borderColor"
        borderRadius={16}
        overflow="hidden"
        style={getBubbleShadow(theme.shadowColor.val)}
      >
        {/* Header */}
        <XStack
          paddingHorizontal={14}
          paddingTop={12}
          paddingBottom={10}
          alignItems="center"
          justifyContent="space-between"
          borderBottomWidth={1}
          borderBottomColor="$borderColor"
        >
          <XStack gap={7} alignItems="center">
            <View style={{
              width: 24, height: 24, borderRadius: 12,
              backgroundColor: theme.primary.val + "15",
              alignItems: "center", justifyContent: "center",
            }}>
              <Feather name="search" size={12} color={theme.primary.val} />
            </View>
            <Text fontSize={13} fontFamily={FontFamily.semiBold} color="$color">
              {items.length} {items.length === 1 ? "memory" : "memories"}
            </Text>
          </XStack>
          <XStack gap={6} alignItems="center">
            <PerformancePill
              isCached={isCached}
              turns={turns}
              resultCount={ids.length}
              flow={flow}
              isDeepSearching={isDeepSearching}
              onDeepSearch={isCached && onDeepSearch ? handleDeepSearch : undefined}
              theme={theme}
            />
          </XStack>
        </XStack>

        {/* Item rows — each row is its own component so useRef works per-row */}
        <YStack>
          {displayItems.map((item, index) => (
            <SearchResultRow
              key={item.id}
              item={item}
              index={index}
              theme={theme}
              token={token}
              isCompleted={completedIds.has(item.id)}
              hasFiles={!!(attachmentCounts as Record<string, number>)[item.id]}
              onComplete={handleComplete}
              onDelete={handleDelete}
              onEdit={handleEdit}
              onTriggerSync={handleTriggerSync}
              onRemoveSync={handleRemoveSync}
            />
          ))}
        </YStack>

        {hasMore && (
          <Pressable
            onPress={() => setExpanded(!expanded)}
            style={({ pressed }) => ({
              paddingVertical: 10,
              alignItems: "center",
              borderTopWidth: 1,
              borderTopColor: theme.borderColor.val,
              backgroundColor: pressed ? theme.accent.val : "transparent",
            })}
          >
            <Text fontSize={12} color={theme.primary.val} fontFamily={FontFamily.semiBold}>
              {expanded ? "Show less" : `Show all ${items.length} results`}
            </Text>
          </Pressable>
        )}
      </YStack>
    </Animated.View>
  );
}

// ─── Thinking Indicator ───────────────────────────────────────────────────────

// Each dot is its own component so hooks are called at the top level (not inside map)
// ThinkingDot removed — loading dots disabled

type ProgressStatus = {
  query?: string | null;
  phase?: string | null;
  toolName?: string | null;
  detail?: string | null;
  source?: string | null;
  cacheState?: string | null;
  resultCount?: number | null;
  previewItems?: string[] | null;
  events?: Array<{ label: string; value?: string | null }> | null;
  step?: number | null;
  totalSteps?: number | null;
  startedAt?: number | null;
  updatedAt?: number | null;
};

const THINKING_MESSAGES = [
  "Reading your message",
  "Checking relevant context",
  "Planning the next backend step",
] as const;

function formatElapsedTime(startedAt?: number | null) {
  if (!startedAt) return null;
  const elapsedMs = Math.max(0, Date.now() - startedAt);
  const seconds = Math.floor(elapsedMs / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function formatMetaLabel(status: ProgressStatus) {
  const parts: string[] = [];
  if (status.cacheState === "cached") {
    parts.push("⚡ cached");
  } else if (status.cacheState === "fresh") {
    parts.push("✓ full scan");
  }
  if (typeof status.resultCount === "number") {
    parts.push(`${status.resultCount} hit${status.resultCount === 1 ? "" : "s"}`);
  }
  return parts.join(" • ");
}

function getUsefulEvents(status: ProgressStatus) {
  const genericValues = new Set([
    "general reasoning",
    "initial plan",
    "next action",
    "prepare answer or next tool",
    "composing final text",
  ]);

  return (status.events ?? [])
    .filter((event) => {
      const label = (event.label ?? "").trim().toLowerCase();
      const value = (event.value ?? "").trim().toLowerCase();
      if (!label && !value) {
        return false;
      }
      if (label === "step" || label === "loop" || label === "next") {
        return false;
      }
      if (label === "mode" && genericValues.has(value)) {
        return false;
      }
      if (label === "matches" && typeof status.resultCount === "number") {
        return false;
      }
      return true;
    });
}

function getProgressTitle(status: ProgressStatus) {
  const phase = (status.phase ?? "").toLowerCase();
  const toolName = (status.toolName ?? "").toLowerCase();

  if (toolName === "search_memories" || toolName === "deep_search") {
    return "Searching memories";
  }
  if (toolName === "search_documents") {
    return "Searching documents";
  }
  if (toolName === "memory_grounding") {
    return "Checking stored data";
  }
  if (toolName === "create_memory") {
    return "Saving memory";
  }
  if (toolName === "update_memory") {
    return "Updating memory";
  }
  if (toolName === "manage_topics") {
    return "Updating topics";
  }
  if (toolName === "surface_cards") {
    return "Preparing cards";
  }
  if (phase === "searching") {
    return "Searching";
  }
  if (phase === "analyzing") {
    return "Analyzing";
  }
  if (phase === "writing") {
    return "Saving changes";
  }
  if (phase === "grounding") {
    return "Checking stored data";
  }
  if (phase === "finalizing") {
    return "Finalizing response";
  }
  if (phase === "loading") {
    return "Loading";
  }
  return "Working";
}

function getProgressIcon(status: ProgressStatus) {
  const phase = (status.phase ?? "").toLowerCase();
  const toolName = (status.toolName ?? "").toLowerCase();

  if (toolName === "search_memories" || toolName === "deep_search" || toolName === "search_documents") {
    return "search";
  }
  if (toolName === "memory_grounding" || phase === "grounding") {
    return "database";
  }
  if (phase === "writing") {
    return "save";
  }
  if (phase === "finalizing") {
    return "check-circle";
  }
  if (phase === "loading") {
    return "folder";
  }
  return "cpu";
}

function getAccentColor(status: ProgressStatus, fallback: string) {
  const phase = (status.phase ?? "").toLowerCase();
  if (phase === "writing") return statusAccentColors.warning;
  if (phase === "finalizing") return statusAccentColors.success;
  if (phase === "analyzing") return integrationAccentColors.reasoning;
  return fallback;
}

function AnimatedSwapText({
  text,
  fontSize,
  color,
  maxWidth,
  fontFamily,
  opacity,
  numberOfLines,
}: {
  text: string;
  fontSize: number;
  color: string;
  maxWidth?: number;
  fontFamily?: string;
  opacity?: number;
  numberOfLines?: number;
}) {
  return (
    <Animated.View
      layout={PROGRESS_LAYOUT}
      style={{ minHeight: fontSize * 1.45, justifyContent: "center" }}
    >
      <Animated.View
        key={text}
        layout={PROGRESS_LAYOUT}
        entering={FadeIn.duration(160)}
        exiting={FadeOut.duration(120)}
      >
        <Text
          fontSize={fontSize}
          color={color}
          maxWidth={maxWidth}
          numberOfLines={numberOfLines}
          fontFamily={fontFamily}
          opacity={opacity}
        >
          {text}
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

function LoadingSweepChar({
  char,
  index,
  sweep,
  color,
  fontSize,
  fontFamily,
  numberOfLines,
}: {
  char: string;
  index: number;
  sweep: SharedValue<number>;
  color: string;
  fontSize: number;
  fontFamily?: string;
  numberOfLines?: number;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const distance = Math.abs(sweep.value - index);
    let opacity = 1;
    if (distance < 0.6) opacity = 0.38;
    else if (distance < 1.2) opacity = 0.56;
    else if (distance < 2) opacity = 0.78;
    return { opacity };
  }, [index, sweep]);

  return (
    <AnimatedRNText
      numberOfLines={numberOfLines}
      style={[
        {
          color,
          fontSize,
          fontFamily,
        },
        animatedStyle,
      ]}
    >
      {char}
    </AnimatedRNText>
  );
}

function LoadingSweepText({
  text,
  color,
  fontSize,
  fontFamily,
  numberOfLines,
}: {
  text: string;
  color: string;
  fontSize: number;
  fontFamily?: string;
  numberOfLines?: number;
}) {
  const sweep = useSharedValue(-3);
  const characters = useMemo(() => text.split(""), [text]);

  useEffect(() => {
    sweep.value = -3;
    sweep.value = withRepeat(
      withTiming(characters.length + 2, { duration: Math.max(1200, characters.length * 85) }),
      -1,
      false,
    );
  }, [characters.length, sweep, text]);

  return (
    <View style={{ flexDirection: "row", flexWrap: "nowrap", flexShrink: 1 }}>
      {characters.map((char, index) => {
        return (
          <LoadingSweepChar
            key={`${char}-${index}`}
            char={char}
            index={index}
            sweep={sweep}
            color={color}
            fontSize={fontSize}
            fontFamily={fontFamily}
            numberOfLines={numberOfLines}
          />
        );
      })}
    </View>
  );
}

function ThinkingIndicator() {
  const theme = useAppTheme();
  const color = theme.primary.val;
  const [phraseIndex, setPhraseIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setPhraseIndex((current) => (current + 1) % THINKING_MESSAGES.length);
    }, 1400);
    return () => clearInterval(timer);
  }, []);

  return (
    <Animated.View entering={FadeInDown.duration(220)} layout={PROGRESS_LAYOUT}>
      <XStack
        gap={8}
        alignSelf="flex-start"
        marginBottom={CHAT.messageGap}
        alignItems="flex-end"
      >
        <Animated.View layout={PROGRESS_LAYOUT}>
          <YStack
            paddingHorizontal={14}
            paddingVertical={12}
            borderRadius={CHAT.bubbleRadius}
            borderBottomLeftRadius={6}
            backgroundColor="$backgroundStrong"
            borderWidth={1}
            borderColor="$borderColor"
            gap={8}
            style={getBubbleShadow(theme.shadowColor.val)}
          >
            <Animated.View layout={PROGRESS_LAYOUT}>
              <XStack gap={8} alignItems="center">
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: `${color}18`,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Feather name="cpu" size={13} color={color} />
                </View>
                <YStack gap={1}>
                  <Text fontSize={13} fontFamily={FontFamily.semiBold} color="$color">
                    Thinking
                  </Text>
                  <AnimatedSwapText
                    text={THINKING_MESSAGES[phraseIndex]}
                    fontSize={11}
                    color="$colorMuted"
                    maxWidth={230}
                    numberOfLines={1}
                  />
                </YStack>
              </XStack>
            </Animated.View>

          </YStack>
        </Animated.View>
      </XStack>
    </Animated.View>
  );
}

// ─── Tool Progress Bubble ─────────────────────────────────────────────────────

function ToolProgressBubble({ status }: { status: ProgressStatus }) {
  const theme = useAppTheme();
  const shimmer = useSharedValue(0);
  const [elapsedLabel, setElapsedLabel] = useState(() => formatElapsedTime(status.startedAt));

  useEffect(() => {
    shimmer.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900 }),
        withTiming(0, { duration: 900 }),
      ),
      -1,
      false,
    );
  }, [shimmer]);

  useEffect(() => {
    setElapsedLabel(formatElapsedTime(status.startedAt));
    if (!status.startedAt) return;
    const timer = setInterval(() => setElapsedLabel(formatElapsedTime(status.startedAt)), 1000);
    return () => clearInterval(timer);
  }, [status.startedAt]);

  const dotStyle = useAnimatedStyle(() => ({ opacity: 0.35 + shimmer.value * 0.65 }));
  const title = getProgressTitle(status);
  const iconName = getProgressIcon(status);
  const accentColor = getAccentColor(status, theme.primary.val);
  
  const events = getUsefulEvents(status);
  const latestEvent = events[events.length - 1];
  const metaLabel = formatMetaLabel(status);

  return (
    <Animated.View
      entering={FadeInDown.duration(200)}
      layout={PROGRESS_LAYOUT}
      style={{ marginBottom: CHAT.messageGap }}
    >
      <XStack gap={8} alignSelf="flex-start" alignItems="center">
        <Animated.View layout={PROGRESS_LAYOUT}>
          <YStack
            paddingHorizontal={12}
            paddingVertical={10}
            borderRadius={22}
            backgroundColor="$backgroundStrong"
            borderWidth={1}
            borderColor="$borderColor"
            style={[getBubbleShadow(theme.shadowColor.val), { minWidth: 200, maxWidth: 320, position: "relative" }]}
          >
            <XStack gap={10} alignItems="center">
              <Animated.View style={dotStyle}>
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    backgroundColor: `${accentColor}18`,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Feather name={iconName as any} size={12} color={accentColor} />
                </View>
              </Animated.View>
              
              <YStack gap={1} flex={1}>
                <XStack justifyContent="space-between" alignItems="center" gap={8}>
                  <LoadingSweepText
                    text={title}
                    fontSize={13}
                    color={theme.color.val}
                    fontFamily={FontFamily.semiBold}
                    numberOfLines={1}
                  />
                  {elapsedLabel && (
                    <Text fontSize={9} color="$colorMuted" opacity={0.6}>
                      {elapsedLabel}
                    </Text>
                  )}
                </XStack>

                <XStack gap={5} alignItems="center" paddingRight={4}>
                   <Text fontSize={11} color="$colorMuted" numberOfLines={1} opacity={0.84} flexShrink={1}>
                    {status.detail?.trim() || "Working..."}
                  </Text>
                  {metaLabel && (
                    <>
                      <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: "$colorMuted", opacity: 0.2 }} />
                      <Text fontSize={10} color="$colorMuted" opacity={0.6} numberOfLines={1}>
                        {metaLabel}
                      </Text>
                    </>
                  )}
                </XStack>
              </YStack>
            </XStack>

            {latestEvent && (
              <Animated.View layout={PROGRESS_LAYOUT} entering={FadeIn.duration(200)}>
                <XStack gap={6} alignItems="center" marginTop={6} paddingLeft={36}>
                  <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: accentColor, opacity: 0.6 }} />
                  <Text fontSize={10} color="$colorMuted" opacity={0.7} numberOfLines={1} paddingRight={10}>
                    <Text fontFamily={FontFamily.medium}>{latestEvent.label}:</Text> {latestEvent.value}
                  </Text>
                </XStack>
              </Animated.View>
            )}
          </YStack>
        </Animated.View>
      </XStack>
    </Animated.View>
  );
}

// ─── Attachment Chip ─────────────────────────────────────────────────────────

function AttachmentChip({
  name,
  type,
  attachmentId,
  token,
}: {
  name: string;
  type: "image" | "document";
  attachmentId: string;
  token?: string | null;
}) {
  const theme = useAppTheme();
  const attachment = useQuery(
    api.attachments.getAttachment,
    token ? { token, attachmentId: attachmentId as any } : "skip"
  );

  const handlePress = () => {
    const link = (attachment as any)?.driveWebViewLink;
    if (link) Linking.openURL(link);
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 10,
        backgroundColor: withAlpha(theme.textInverse.val, "26"),
        opacity: pressed ? 0.7 : 1,
        alignSelf: "flex-start",
      })}
    >
      <Feather name="paperclip" size={11} color={withAlpha(theme.textInverse.val, "CC")} />
      <Text fontSize={11} color={withAlpha(theme.textInverse.val, "E6")} numberOfLines={1} maxWidth={160}>
        {name}
      </Text>
    </Pressable>
  );
}

// ─── Chat Bubble ──────────────────────────────────────────────────────────────

const ChatBubble = React.memo(function ChatBubble({
  msg,
  isUser,
  mdStyles,
  speakingId,
  onSpeak,
  onCopy,
  token,
  deletionItems,
  cardIds,
  cardIsCached,
  cardTurns,
  cardFlow,
  onDeepSearch,
  onEditMemory,
}: {
  msg: ChatMsg;
  isUser: boolean;
  mdStyles: any;
  speakingId: string | null;
  onSpeak: (id: string, text: string) => void;
  onCopy: (text: string) => void;
  token?: string | null;
  deletionItems?: DeletionItem[];
  cardIds?: string[];
  cardIsCached?: boolean;
  cardTurns?: number;
  cardFlow?: CardFlow;
  onDeepSearch?: (messageId: string, query: string) => void;
  onEditMemory?: (id: string) => void;
}) {
  const theme = useAppTheme();
  const isSpeaking = speakingId === msg._id;
  const [showActions, setShowActions] = useState(false);
  const scaleAnim = useSharedValue(1);
  const messageTime = useMemo(() => formatMessageTime(msg._creationTime), [msg._creationTime]);

  const bubbleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleAnim.value }],
  }));

  const handleLongPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    scaleAnim.value = withSequence(
      withSpring(0.97, { damping: 15 }),
      withSpring(1, { damping: 15 }),
    );
    setShowActions((v) => !v);
  };

  return (
    <Animated.View
      entering={undefined}
      style={{ marginBottom: CHAT.messageGap }}
    >
      <XStack
        maxWidth="82%"
        gap={8}
        alignSelf={isUser ? "flex-end" : "flex-start"}
      >
        <YStack flex={1} gap={4}>
          <XStack alignItems="center" gap={8} alignSelf={isUser ? "flex-end" : "flex-start"}>
            <Pressable onLongPress={handleLongPress} delayLongPress={400} style={{ flexShrink: 1 }}>
              <Animated.View style={bubbleStyle}>
                <YStack
                  paddingHorizontal={CHAT.bubblePadding}
                  paddingVertical={12}
                  borderRadius={CHAT.bubbleRadius}
                  backgroundColor={isUser ? theme.primary.val : theme.backgroundStrong.val}
                  borderWidth={isUser ? 0 : 1}
                  borderColor={isUser ? "transparent" : "$borderColor"}
                  style={[
                    isUser ? { borderBottomRightRadius: 6 } : { borderBottomLeftRadius: 6 },
                    getBubbleShadow(theme.shadowColor.val),
                  ]}
                  gap={msg.attachments && msg.attachments.length > 0 ? 8 : 0}
                >
                  {msg.content ? <Markdown style={mdStyles}>{msg.content}</Markdown> : null}
                  {isUser && msg.attachments && msg.attachments.length > 0 && (
                    <YStack gap={4}>
                      {msg.attachments.map((att: { attachmentId: string; name: string; type: string; mimeType: string }) => (
                        <AttachmentChip
                          key={att.attachmentId}
                          name={att.name}
                          type={att.type as "image" | "document"}
                          attachmentId={att.attachmentId}
                          token={token}
                        />
                      ))}
                    </YStack>
                  )}
                </YStack>
              </Animated.View>
            </Pressable>

            {/* Speaker icon — always to the right of AI messages */}
            {!isUser && (
              isSpeaking ? (
                <Animated.View entering={ZoomIn.duration(200)}>
                  <Pressable
                    onPress={() => onSpeak(msg._id, extractSpeakableText(msg.content ?? ""))}
                    hitSlop={8}
                    style={({ pressed }) => ({
                      opacity: pressed ? 0.6 : 1,
                      width: 28,
                      height: 28,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: theme.primary.val + "15",
                      borderRadius: 14,
                    })}
                  >
                    <Feather name="volume-x" size={18} color={theme.primary.val} />
                  </Pressable>
                </Animated.View>
              ) : (
                <Animated.View entering={FadeIn.duration(200)}>
                  <Pressable
                    onPress={() => onSpeak(msg._id, extractSpeakableText(msg.content ?? ""))}
                    hitSlop={8}
                    style={({ pressed }) => ({
                      opacity: pressed ? 0.6 : 1,
                      width: 28,
                      height: 28,
                      alignItems: "center",
                      justifyContent: "center",
                    })}
                  >
                    <Feather name="volume-2" size={18} color={theme.colorMuted.val} />
                  </Pressable>
                </Animated.View>
              )
            )}
          </XStack>

          {/* Inline action bar — shown on long press */}
          {showActions && (
            <Animated.View entering={ZoomIn.duration(200)}>
              <XStack
                gap={6}
                alignSelf={isUser ? "flex-end" : "flex-start"}
                paddingHorizontal={4}
              >
                <Pressable
                  onPress={() => { onCopy(msg.content); setShowActions(false); }}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 10,
                    backgroundColor: theme.backgroundStrong.val,
                    borderWidth: 1,
                    borderColor: theme.borderColor.val,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Feather name="copy" size={12} color={theme.colorMuted.val} />
                  <Text fontSize={11} fontFamily="$body" color="$colorMuted">Copy</Text>
                </Pressable>
              </XStack>
            </Animated.View>
          )}

          {messageTime ? (
            <Text
              fontSize={10}
              fontFamily="$body"
              color="$colorMuted"
              opacity={0.75}
              marginTop={2}
              alignSelf={isUser ? "flex-end" : "flex-start"}
              paddingHorizontal={4}
            >
              {messageTime}
            </Text>
          ) : null}
        </YStack>
      </XStack>

      {/* Deletion confirmation card — full width, below AI bubble */}
      {!isUser && deletionItems && deletionItems.length > 0 && (
        <DeletionProposalCard items={deletionItems} token={token} theme={theme} />
      )}

      {/* Memory cards — full width, below AI bubble */}
      {!isUser && cardIds && cardIds.length > 0 && (
        <SearchResultsCard
          ids={cardIds}
          isCached={cardIsCached ?? false}
          turns={cardTurns}
          flow={cardFlow}
          token={token}
          theme={theme}
          onDeepSearch={onDeepSearch ? (q) => onDeepSearch(msg._id, q) : undefined}
          onEdit={onEditMemory}
        />
      )}
    </Animated.View>
  );
});

// ─── Voice Waveform ───────────────────────────────────────────────────────────

const BAR_HEIGHTS = [10, 18, 24, 18, 10] as const;

// Each bar is its own component so hooks are at the top level (not inside map)
function WaveformBar({ height, delay, color }: { height: number; delay: number; color: string }) {
  const scaleY = useSharedValue(0.4);

  useEffect(() => {
    scaleY.value = withRepeat(
      withDelay(
        delay,
        withSequence(
          withTiming(1, { duration: 350 }),
          withTiming(0.25, { duration: 350 }),
        ),
      ),
      -1,
      true,
    );
  }, [delay, scaleY]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scaleY: scaleY.value }],
  }));

  return (
    <Animated.View
      style={[{ width: 3, height, borderRadius: 2, backgroundColor: color }, style]}
    />
  );
}

function VoiceWaveform({ color }: { color: string }) {
  return (
    <XStack alignItems="center" gap={3} height={28} paddingHorizontal={4}>
      {BAR_HEIGHTS.map((h, i) => (
        <WaveformBar key={i} height={h} delay={i * 90} color={color} />
      ))}
    </XStack>
  );
}

// ─── Chat Input Bar ───────────────────────────────────────────────────────────

import { VoiceRecorder } from "./VoiceRecorder";
import { PopoverMenu } from "@/components/ui/PopoverMenu";

function ChatInputBar({
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
  onSend: (text: string) => void;
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
  const inputRef = useRef<TextInput>(null);
  const [internalMode, setInternalMode] = useState<"voice" | "keyboard">("keyboard");

  const mode = chatInputMode ?? internalMode;
  const setMode = setChatInputMode ?? setInternalMode;

  const [voiceLiveTranscript, setVoiceLiveTranscript] = useState("");
  const [isVoicePaused, setIsVoicePaused] = useState(false);
  const hasLiveTranscript = voiceLiveTranscript.trim().length > 0;

  const handleVoiceComplete = useCallback((transcript: string) => {
    if (transcript.trim()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Pass true to indicate this was a voice message
      (onSend as any)(transcript, true);
    }
  }, [onSend]);

  const hasAttachments = (attachments?.length ?? 0) > 0;
  const canSend = (text.trim().length > 0 || hasAttachments) && !isSending;

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (isSending) return;
    if (!trimmed && !hasAttachments) return;
    (onSend as any)(trimmed, false);
    setText("");
  }, [text, isSending, hasAttachments, onSend]);

  // Web: Ctrl/Cmd+Enter to send
  useEffect(() => {
    if (Platform.OS !== "web" || mode !== "keyboard") return;
    const el = inputRef.current as unknown as HTMLElement | null;
    if (!el) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSend();
      }
    };
    el.addEventListener("keydown", handler);
    return () => el.removeEventListener("keydown", handler);
  }, [handleSend, mode]);

  // ── Voice mode UI ────────────────────────────────────────────────────────
  if (mode === "voice") {
    return (
      <Animated.View entering={FadeIn.duration(150)}>
        <YStack gap={hasLiveTranscript ? 8 : 0}>
          {hasLiveTranscript ? (
            <YStack
              paddingHorizontal={12}
              paddingVertical={8}
              borderRadius={14}
              backgroundColor="$accent"
              borderWidth={1}
              borderColor={isVoicePaused ? "$borderColor" : "$primary"}
            >
              {isVoicePaused ? (
                <TextInput
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
          <XStack alignItems="center" justifyContent="center" position="relative" minHeight={56}>
              {/* Single mic: tap = continuous, long-press = walkie-talkie */}
              <VoiceRecorder
                onTranscription={setVoiceLiveTranscript}
                onTranscriptionComplete={(text) => {
                  setVoiceLiveTranscript("");
                  setIsVoicePaused(false);
                  handleVoiceComplete(text);
                }}
                onPauseChange={setIsVoicePaused}
                transcriptOverride={isVoicePaused ? voiceLiveTranscript : undefined}
                compact
                inputMode="auto"
              />

               {/* Right Keyboard Button */}
               <Pressable
                 onPress={() => setMode("keyboard")}
                 hitSlop={12}
                 style={({ pressed }) => ({
                   position: "absolute",
                   right: 8,
                   width: 34,
                   height: 34,
                   borderRadius: 17,
                   alignItems: "center",
                   justifyContent: "center",
                   backgroundColor: theme.backgroundStrong.val,
                   borderWidth: 1,
                   borderColor: theme.borderColor.val,
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

  // ── Normal text input UI ───────────────────────────────────────────────────
  return (
    <YStack>
      {/* Attachment preview bar — slides up when files are selected */}
      {attachments && attachments.length > 0 && (
        <AttachmentPreviewBar
          attachments={attachments}
          onRemove={onRemoveAttachment ?? (() => {})}
        />
      )}
      <XStack
        alignItems="flex-end"
        padding={8}
        gap={6}
        borderWidth={1}
        borderRadius={24}
        borderColor="$borderColor"
        backgroundColor="$backgroundStrong"
        style={getSurfaceShadow(theme.shadowColor.val)}
      >
        <AttachmentPickerButton
          onPickImages={onPickImages ?? (() => {})}
          onPickCamera={onPickCamera ?? (() => {})}
          onPickDocument={onPickDocument ?? (() => {})}
          driveConnected={driveConnected}
          onRequestDriveAccess={onRequestDriveAccess}
          size={18}
        />

      <TextInput
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
          minHeight: 40,
          maxHeight: 120,
          borderRadius: 18,
          paddingHorizontal: 14,
          paddingVertical: 10,
          fontSize: 15,
          fontFamily: FontFamily.regular,
          borderWidth: 0.5,
          color: theme.color.val,
          backgroundColor: theme.background.val,
          borderColor: theme.borderColor.val,
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
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Feather name="mic" size={18} color={theme.colorMuted.val} />
      </Pressable>

      <Pressable
        onPress={handleSend}
        disabled={!canSend}
        hitSlop={6}
        style={({ pressed }) => ({
          width: 38,
          height: 38,
          borderRadius: 19,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: canSend ? theme.primary.val : theme.borderColor.val,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <Feather
          name="arrow-up"
          size={18}
          color={canSend ? theme.textInverse.val : theme.colorMuted.val}
        />
      </Pressable>
      </XStack>
    </YStack>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState() {
  const theme = useAppTheme();
  return (
    <YStack flex={1} justifyContent="center" padding={24} gap={28}>
      <YStack alignItems="center" gap={12}>
        <Animated.View entering={ZoomIn.duration(250)}>
          <XStack
            width={72}
            height={72}
            borderRadius={36}
            alignItems="center"
            justifyContent="center"
            marginBottom={4}
            backgroundColor={theme.primary.val + "15"}
            borderWidth={1}
            borderColor={theme.primary.val + "25"}
          >
            <Feather name="zap" size={32} color={theme.primary.val} />
          </XStack>
        </Animated.View>
        <Text
          fontSize={20}
          fontFamily="$heading"
          fontWeight="700"
          textAlign="center"
          color="$color"
        >
          What's on your mind?
        </Text>
        <Text
          fontSize={14}
          fontFamily="$body"
          lineHeight={20}
          textAlign="center"
          maxWidth={300}
          color="$colorMuted"
        >
          Create, find, edit or remove any memory
        </Text>
      </YStack>

      <XStack flexWrap="wrap" gap={6} width="100%" justifyContent="center">
        {FEATURE_BULLETS.map((feature, i) => (
          <Animated.View
            key={feature}
            entering={FadeInDown.delay(i * 50).duration(250)}
          >
            <XStack
              alignItems="center"
              gap={5}
              paddingHorizontal={8}
              paddingVertical={4}
              borderRadius={999}
              borderWidth={1}
              borderColor={theme.borderColor.val}
              backgroundColor={theme.background.val}
            >
              <Text fontSize={12} fontFamily="$body" color={theme.colorMuted.val}>
                •
              </Text>
              <Text fontSize={11} fontFamily="$body" color="$colorMuted">
                {feature}
              </Text>
            </XStack>
          </Animated.View>
        ))}
      </XStack>
    </YStack>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

interface ExtendedAIChatPanelProps extends AIChatPanelProps {
  chatInputMode?: "voice" | "keyboard";
  setChatInputMode?: (mode: "voice" | "keyboard") => void;
  autoVoiceOutput?: boolean;
}

export function AIChatPanel({ compact, token: tokenProp, chatInputMode, setChatInputMode, autoVoiceOutput = true }: ExtendedAIChatPanelProps) {
  const theme = useAppTheme();
  const auth = useAuth();
  const { showToast } = useAppToast();
  const openEditMemory = useUIStore((state) => state.openEditMemory);
  const token = tokenProp ?? auth.token;
  const insets = useSafeAreaInsets();
  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();

  const keyboardSpacerStyle = useAnimatedStyle(() => ({
    height: Math.abs(keyboardHeight.value),
  }));

  const messages = useQuery(api.chat.list, token ? { token, limit: 100 } : "skip") ?? [];
  const searchStatus = useQuery(api.chat.getSearchStatus, token ? { token } : "skip");
  const googleIntegration = useQuery(
    api.integrations.getGoogleIntegration,
    token ? { token } : "skip"
  );
  const sendMessage = useAction(api.actions.memoryChat.chat);
  const runDeepSearch = useAction(api.chat.deepSearch);
  const clearChat = useMutation(api.chat.clear);

  const driveConnected = !!(googleIntegration?.connected && (googleIntegration as any).hasDriveScope);

  const fileAttachments = useFileAttachments({ token: token ?? undefined });

  const [isSending, setIsSending] = useState(false);
  const [editTargetId, setEditTargetId] = useState<string | null>(null);
  const [optimisticMessage, setOptimisticMessage] = useState<ChatMsg | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [speechLocale, setSpeechLocale] = useState(getPreferredSpeechLocale);
  const [speechVoiceId, setSpeechVoiceId] = useState<string | undefined>(undefined);
  const flatListRef = useRef<FlatList>(null);
  const speechPlaybackTokenRef = useRef(0);

  // ── Edit memory flow ────────────────────────────────────────────────────────
  // Fetch the full memory doc only when the user taps "Edit" on a search result card
  const editMemoryResult = useQuery(
    api.memories.listByIds,
    editTargetId && token ? { token, ids: [editTargetId as any] } : "skip",
  );
  const editMemoryNote = useMemo(() => {
    const doc = editMemoryResult?.[0];
    if (!doc) return null;
    return chatToMemoryNote(doc as Record<string, unknown>);
  }, [editMemoryResult]);

  // Auto-open edit sheet as soon as the memory document arrives
  useEffect(() => {
    if (editMemoryNote && editTargetId) {
      openEditMemory(editMemoryNote);
      setEditTargetId(null);
    }
  }, [editMemoryNote, editTargetId, openEditMemory]);

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

  // Scroll to bottom when sending starts (to show thinking indicator) or when new messages arrive
  const prevCountRef = useRef(messages.length);
  useEffect(() => {
    if (messages.length > prevCountRef.current) {
      const timer = setTimeout(() => {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      }, 120);

      // Auto-readout logic
      if (autoVoiceOutput && lastInputModeRef.current === "voice" && messages.length > 0) {
        const lastMsg = messages[messages.length - 1]; // Assume latest message is at end of array (since query sorts ascending)
        if (lastMsg && lastMsg.role !== "user" && !unreadVoiceResponsesRef.current.has(lastMsg._id)) {
            unreadVoiceResponsesRef.current.add(lastMsg._id);
            const textToSpeak = extractSpeakableText(lastMsg.content ?? "");
            speakMessage(lastMsg._id, textToSpeak);
        }
      }

      prevCountRef.current = messages.length;

      // If we received new messages and one of them matches our optimistic message content, clear it.
      // (Or we just clear it unconditionally when a new message arrives while sending).
      if (isSending) {
        setOptimisticMessage(null);
      }
      return () => clearTimeout(timer);
    }
    prevCountRef.current = messages.length;
  }, [messages.length, isSending, messages]);

  useEffect(() => {
    if (isSending || optimisticMessage) {
      const timer = setTimeout(() => {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isSending, optimisticMessage]);

  const speakMessage = useCallback(
    (id: string, text: string) => {
      const stopSpeaking = () => {
        speechPlaybackTokenRef.current += 1;
        Speech.stop();
        setSpeakingId(null);
      };

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
            if (speechPlaybackTokenRef.current === playbackToken) {
              setSpeakingId(null);
            }
          },
          onError: () => {
            if (speechPlaybackTokenRef.current === playbackToken) {
              setSpeakingId(null);
            }
          },
        });
      };

      speakChunk(0);
    },
    [speakingId, speechLocale, speechVoiceId],
  );

  useEffect(() => {
    return () => {
      speechPlaybackTokenRef.current += 1;
      void Speech.stop();
    };
  }, []);

  const copyMessage = useCallback(
    (text: string) => {
      Clipboard.setString(text);
      showToast({ title: "Copied to clipboard", tone: "success", duration: 2000 });
    },
    [showToast],
  );

  const lastInputModeRef = useRef<"voice" | "keyboard">("keyboard");
  const unreadVoiceResponsesRef = useRef<Set<string>>(new Set());

  const handleSend = useCallback(
    async (text: string, isVoice: boolean = false) => {
      const hasPendingAttachments = fileAttachments.attachments.some(
        (a) => a.uploadStatus === "idle" || a.uploadStatus === "compressing"
      );
      if ((!text.trim() && !hasPendingAttachments) || !token) return;
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      lastInputModeRef.current = isVoice ? "voice" : "keyboard";

      const optimisticMsg: ChatMsg = {
        _id: `optimistic_${Date.now()}`,
        role: "user",
        content: text.trim() || "📎",
        _creationTime: Date.now(),
      };

      setOptimisticMessage(optimisticMsg);
      setIsSending(true);

      try {
        // Upload pending attachments (uploadAll waits for any still-compressing items)
        let uploadedAttachments: Awaited<ReturnType<typeof fileAttachments.uploadAll>> = [];
        if (hasPendingAttachments) {
          try {
            uploadedAttachments = await fileAttachments.uploadAll();
          } catch (uploadErr) {
            const msg = uploadErr instanceof Error ? uploadErr.message : "Upload failed";
            showToast({ title: "Upload failed", message: msg, tone: "error" });
            setOptimisticMessage(null);
            setIsSending(false);
            return;
          }
        }

        const response = await sendMessage({
          token,
          message: text.trim() || " ",
          currentTime: new Date().toISOString(),
          currentTimezone:
            Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          attachments: uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
        });

        fileAttachments.clear();

        if (Array.isArray(response?.attachmentFailures) && response.attachmentFailures.length > 0) {
          const [firstFailure] = response.attachmentFailures;
          showToast({
            title: firstFailure.reason,
            tone: "error",
            duration: 6500,
          });
        }
      } catch (error) {
        setOptimisticMessage(null);
        showToast({
          title: "Failed to send message",
          message: "Check your connection and try again.",
          tone: "error",
        });
      } finally {
        setIsSending(false);
      }
    },
    [token, sendMessage, showToast, fileAttachments],
  );

  const handleRequestDriveAccess = useCallback(() => {
    showToast({
      title: "Google Drive not connected",
      message: "Connect Google in Settings to attach files.",
      tone: "info",
    });
  }, [showToast]);

  const handleClearChat = useCallback(() => {
    if (!token) return;
    clearChat({ token });
    showToast({ title: "Chat cleared", tone: "info", duration: 2500 });
  }, [token, clearChat, showToast]);

  const handleEditMemory = useCallback((id: string) => {
    setEditTargetId(id);
  }, []);

  // ── Markdown styles ────────────────────────────────────────────────────────
  const aiMdStyles = useMemo(
    () => ({
      body: {
        color: theme.color.val,
        fontSize: compact ? 13 : 14,
        fontFamily: FontFamily.regular,
        lineHeight: compact ? 18 : 20,
      },
      strong: { fontFamily: FontFamily.bold, color: theme.color.val },
      code_inline: {
        fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
        backgroundColor: theme.accent.val,
        color: theme.color.val,
        fontSize: 13,
      },
      code_block: {
        fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
        backgroundColor: theme.accent.val,
        color: theme.color.val,
        fontSize: 13,
        padding: 8,
        borderRadius: 6,
      },
      link: { color: theme.primary.val },
      bullet_list_icon: { color: theme.color.val },
      ordered_list_icon: { color: theme.color.val },
    }),
    [theme, compact],
  );

  const userMdStyles = useMemo(
    () => ({
      body: {
        color: theme.textInverse.val,
        fontSize: compact ? 13 : 14,
        fontFamily: FontFamily.regular,
        lineHeight: compact ? 18 : 20,
      },
      strong: { fontFamily: FontFamily.bold, color: theme.textInverse.val },
      code_inline: {
        fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
        backgroundColor: withAlpha(theme.textInverse.val, "26"),
        color: theme.textInverse.val,
        fontSize: 13,
      },
      code_block: {
        fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
        backgroundColor: withAlpha(theme.textInverse.val, "26"),
        color: theme.textInverse.val,
        fontSize: 13,
        padding: 8,
        borderRadius: 6,
      },
      link: { color: theme.textInverse.val },
    }),
    [compact, theme.textInverse.val],
  );

  // Inject a synthetic "thinking" item at the front (visual bottom in inverted list)
  // instead of using ListHeaderComponent, which gets scaleY:-1 applied in inverted mode
  const displayMessages = useMemo(() => {
    let base = [...messages];

    // Add optimistic message if it exists
    if (optimisticMessage && !base.some(m => m.content === optimisticMessage.content && m.role === "user" && m._creationTime > optimisticMessage._creationTime - 5000)) {
       base.push(optimisticMessage as any);
    }

    base = base.reverse();

    if (isSending || searchStatus) {
      if (searchStatus) {
        return [
          { _id: "__tool_progress__", role: "tool_progress", status: searchStatus, _creationTime: 0 } as any,
          ...base,
        ];
      }
    }
    if (isSending) {
      return [
        { _id: "__thinking__", role: "thinking", content: "", _creationTime: 0 } as any,
        ...base,
      ];
    }
    return base;
  }, [messages, isSending, optimisticMessage, searchStatus]);

  const handleDeepSearch = useCallback(
    async (messageId: string, query: string) => {
      if (!token) return;
      try {
        await runDeepSearch({ token, query, messageId: messageId as any });
        showToast({ title: "Deep scan complete", tone: "success" });
      } catch {
        showToast({ title: "Deep scan failed — try again", tone: "error" });
      }
    },
    [token, runDeepSearch, showToast],
  );

  const renderMessage = useCallback(
    ({ item }: { item: any }) => {
      if (item.role === "thinking") return <ThinkingIndicator />;
      if (item.role === "tool_progress") return <ToolProgressBubble status={item.status ?? {}} />;

      let deletionItems: DeletionItem[] | undefined;
      let cardIds: string[] | undefined;
      let displayMsg = item;
      let cardIsCached: boolean | undefined;
      let cardTurns: number | undefined;
      let cardFlow: CardFlow | undefined;

      if (item.role !== "user") {
          let content = item.content ?? "";
          
          const dParsed = parseDeletionProposal(content);
          if (dParsed) {
              deletionItems = dParsed.items;
              content = dParsed.cleanText;
          }
          
          const cParsed = parseCardIds(content);
          if (cParsed) {
              cardIds = cParsed.ids;
              cardIsCached = cParsed.isCached;
              cardTurns = cParsed.turns;
              cardFlow = cParsed.flow;
              content = cParsed.cleanText;
          }

          // Final cleanup for any leftover legacy markers or accidental comments
          const cleanContent = content
            .replace(/<!--MEMORA_SEARCH_RESULTS:[\s\S]*?-->/g, "")
            .replace(/<!--[\s\S]*?-->/g, "")
            .trim();
            
          displayMsg = { ...displayMsg, content: cleanContent };
      }

      return (
        <ChatBubble
          msg={displayMsg}
          isUser={item.role === "user"}
          mdStyles={item.role === "user" ? userMdStyles : aiMdStyles}
          speakingId={speakingId}
          onSpeak={speakMessage}
          onCopy={copyMessage}
          token={token}
          deletionItems={deletionItems}
          cardIds={cardIds}
          cardIsCached={cardIsCached}
          cardTurns={cardTurns}
          cardFlow={cardFlow}
          onDeepSearch={handleDeepSearch}
          onEditMemory={handleEditMemory}
        />
      );
    },
    [aiMdStyles, userMdStyles, speakingId, speakMessage, copyMessage, token, handleDeepSearch, handleEditMemory],
  );

  const keyExtractor = useCallback((item: any) => item._id, []);

  // ── Input bar ──────────────────────────────────────────────────────────────
  const inputBar = (
    <KeyboardStickyView>
      <YStack
        backgroundColor="$background"
        borderTopWidth={1}
        borderTopColor="$borderColor"
        paddingHorizontal={16}
        paddingTop={10}
        paddingBottom={Math.max(insets.bottom, 12)}
        gap={8}
      >
        <ChatInputBar
          isSending={isSending}
          onSend={handleSend}
          chatInputMode={chatInputMode}
          setChatInputMode={setChatInputMode}
          attachments={fileAttachments.attachments}
          onRemoveAttachment={fileAttachments.removeAttachment}
          onPickImages={fileAttachments.pickImages}
          onPickCamera={fileAttachments.pickCamera}
          onPickDocument={fileAttachments.pickDocument}
          driveConnected={driveConnected}
          onRequestDriveAccess={handleRequestDriveAccess}
        />
      </YStack>
    </KeyboardStickyView>
  );

  // ── Empty state ────────────────────────────────────────────────────────────
  if (messages.length === 0 && !optimisticMessage && !isSending) {
    return (
      <YStack flex={1}>
        <YStack flex={1} overflow="hidden">
          <YStack
            marginHorizontal={CHAT.bodyPad}
            marginTop={12}
            marginBottom={8}
            borderRadius={CHAT.panelRadius}
            backgroundColor="$backgroundStrong"
            borderWidth={1}
            borderColor="$borderColor"
            overflow="hidden"
            style={getSurfaceShadow(theme.shadowColor.val)}
            flex={1}
          >
            <EmptyState />
          </YStack>
          <Animated.View style={keyboardSpacerStyle} />
        </YStack>
        {inputBar}
      </YStack>
    );
  }

  // ── Chat view ──────────────────────────────────────────────────────────────
  return (
    <YStack flex={1}>
      <YStack
        marginHorizontal={CHAT.bodyPad}
        marginTop={12}
        marginBottom={10}
        borderRadius={CHAT.panelRadius}
        borderWidth={1}
        borderColor="$borderColor"
        backgroundColor="$backgroundStrong"
        overflow="hidden"
        style={getSurfaceShadow(theme.shadowColor.val)}
        flex={1}
      >
        {/* Header */}
        <XStack
          alignItems="center"
          justifyContent="space-between"
          paddingHorizontal={CHAT.bodyPad}
          paddingVertical={11}
          borderBottomWidth={1}
          borderBottomColor="$borderColor"
          backgroundColor="$card"
        >
          <Text fontSize={12} fontFamily="$body" color="$colorMuted">
            {messages.length} {messages.length === 1 ? "message" : "messages"}
          </Text>
          <Pressable
            onPress={handleClearChat}
            hitSlop={8}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: 10,
              paddingVertical: 7,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: theme.borderColor.val,
              backgroundColor: theme.background.val,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Feather name="trash-2" size={14} color={theme.colorMuted.val} />
            <Text fontSize={12} fontFamily="$body" color="$colorMuted">
              Clear
            </Text>
          </Pressable>
        </XStack>

        {/* Message list + keyboard spacer */}
        <YStack flex={1} overflow="hidden" backgroundColor="$background">
          <FlatList
            ref={flatListRef}
            data={displayMessages}
            renderItem={renderMessage}
            keyExtractor={keyExtractor}
            inverted
            style={{ flex: 1 }}
            contentContainerStyle={{
              paddingHorizontal: CHAT.bodyPad + 2,
              paddingTop: CHAT.bodyPad + 6,
              paddingBottom: CHAT.bodyPad - 2,
            }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          />
          <Animated.View style={keyboardSpacerStyle} />
        </YStack>
      </YStack>

      {inputBar}
    </YStack>
  );
}
