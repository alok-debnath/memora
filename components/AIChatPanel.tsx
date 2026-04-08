import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  TextInput,
  FlatList,
  Pressable,
  Platform,
  Alert,
  View,
} from "react-native";
import Clipboard from "@react-native-clipboard/clipboard";
import { XStack, YStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";
import Markdown from "react-native-markdown-display";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  LinearTransition,
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
import { logDevError } from "@/lib/devLog";
import { Badge } from "@/components/ui/Badge";
import { ContextMenu, type ContextMenuHandle, type ContextMenuItemDef } from "@/components/ui/ContextMenu";
import { EditMemorySheet } from "@/components/EditMemorySheet";
import type { MemoryNote } from "@/types/memory";
import { getReminderDate, inferMemoryEntryKind } from "@/types/memoryKind";

// ─── Constants ────────────────────────────────────────────────────────────────

const CHAT = {
  bubbleRadius: 18,
  bubblePadding: 14,
  messageGap: 14,
  bodyPad: 18,
  panelRadius: 22,
} as const;

const SUGGESTIONS = [
  "Remember my WiFi password is starlight42",
  "What did I save about my passport?",
  "Show all my work memories",
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

const SURFACE_SHADOW = Platform.select({
  ios: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
  },
  android: {
    elevation: 1,
  },
  default: {},
});

const BUBBLE_SHADOW = Platform.select({
  ios: {
    shadowColor: "#000",
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
    attachments: [],
    isPublic: m.isPublic as boolean | undefined,
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
  // Strip deletion proposal marker
  const dParsed = parseDeletionProposal(content);
  let text = dParsed ? dParsed.cleanText : content;
  // Strip card IDs marker
  const cParsed = parseCardIds(text);
  text = cParsed ? cParsed.cleanText : text;
  // Strip any remaining HTML comments (safety net)
  text = text.replace(/<!--[\s\S]*?-->/g, "").trim();
  return text;
}

function parseCardIds(content: string): { ids: string[]; isCached: boolean; cleanText: string } | null {
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
    const cleanText = content.slice(0, startIdx).trim();
    return ids.length > 0 ? { ids, isCached, cleanText } : null;
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
          borderColor="rgba(52, 199, 89, 0.35)"
          borderRadius={16}
          padding={14}
          gap={12}
          alignItems="center"
          style={BUBBLE_SHADOW}
        >
          <View style={{
            width: 34, height: 34, borderRadius: 17,
            backgroundColor: "rgba(52, 199, 89, 0.15)",
            alignItems: "center", justifyContent: "center",
          }}>
            <Feather name="check" size={16} color="#34C759" />
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
          style={BUBBLE_SHADOW}
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
        style={BUBBLE_SHADOW}
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
                    {isSelected && <Feather name="check" size={12} color="#FFFFFF" />}
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
              backgroundColor: selectedCount === 0 ? theme.accent.val : "#FF3B30",
              opacity: pressed || cardState === "deleting" || selectedCount === 0 ? 0.6 : 1,
            })}
          >
            <Text
              fontSize={13}
              fontFamily={FontFamily.semiBold}
              color={selectedCount === 0 ? "$colorMuted" : "#FFFFFF"}
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
}: {
  item: SearchResultItem;
  index: number;
  theme: ReturnType<typeof useAppTheme>;
  token?: string | null;
  isCompleted: boolean;
  onComplete: (item: SearchResultItem) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
}) {
  const menuRef = useRef<ContextMenuHandle>(null);
  const isReminder = item.entry_kind === "reminder";
  const SUCCESS = theme.success?.val ?? "#22C55E";

  const menuItems: ContextMenuItemDef[] = [
    ...(isReminder && !isCompleted
      ? [{
          label: "Mark as Completed",
          icon: "check-circle" as const,
          iconColor: SUCCESS,
          onPress: () => onComplete(item),
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
      backgroundColor="$card"
      borderColor="$borderColor"
      borderWidth={1}
      borderRadius={16}
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
    </YStack>
  );

  return (
    <Animated.View entering={FadeInDown.duration(260).delay(index * 55)}>
      <ContextMenu ref={menuRef} items={menuItems} preview={previewCard}>
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
          <YStack flex={1} gap={2}>
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

// ─── Search Results Card ──────────────────────────────────────────────────────

function SearchResultsCard({
  ids,
  isCached,
  token,
  theme,
  onDeepSearch,
  onEdit,
}: {
  ids: string[];
  isCached: boolean;
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
  const { showToast } = useAppToast();

  // Fetch full memory docs by ID reactively
  const fetchedDocs = useQuery(
    api.memories.listByIds,
    token && ids.length > 0 ? { token, ids: ids as any[] } : "skip"
  );
  const items: SearchResultItem[] = (fetchedDocs ?? []).map((doc) => ({
    id: doc._id,
    title: doc.title,
    content: doc.content,
    entry_kind: doc.entryKind ?? "memory",
  }));

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

  const handleDelete = useCallback((id: string) => {
    if (!token) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert("Delete Memory", "This will move the memory to trash.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteMemory({ token, id: id as any });
            showToast({ title: "Memory deleted", tone: "success" });
          } catch {
            showToast({ title: "Couldn't delete — try again", tone: "error" });
          }
        },
      },
    ]);
  }, [token, deleteMemory, showToast]);

  const handleEdit = useCallback((id: string) => {
    onEdit?.(id);
  }, [onEdit]);

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

  const badgeLabel = isCached ? "⚡ Fast" : "✓ Full scan";
  const badgeColor = isCached ? "#F59E0B" : theme.primary.val;

  return (
    <Animated.View entering={FadeInDown.duration(320)} style={{ marginTop: 8 }}>
      <YStack
        backgroundColor={theme.backgroundStrong.val}
        borderWidth={1}
        borderColor="$borderColor"
        borderRadius={16}
        overflow="hidden"
        style={BUBBLE_SHADOW}
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
              {items.length} {items.length === 1 ? "memory" : "memories"} found
            </Text>
          </XStack>
          <XStack gap={6} alignItems="center">
            <Badge label={badgeLabel} color={badgeColor} small />
            {isCached && onDeepSearch && (
              <Pressable
                onPress={handleDeepSearch}
                disabled={isDeepSearching}
                hitSlop={6}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: theme.primary.val + "50",
                  backgroundColor: pressed ? theme.primary.val + "25" : theme.primary.val + "12",
                  opacity: isDeepSearching ? 0.5 : 1,
                })}
              >
                <Feather name="refresh-cw" size={10} color={theme.primary.val} />
                <Text style={{ fontSize: 11, fontFamily: FontFamily.semiBold, color: theme.primary.val }}>
                  {isDeepSearching ? "Scanning..." : "Deep scan"}
                </Text>
              </Pressable>
            )}
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
              onComplete={handleComplete}
              onDelete={handleDelete}
              onEdit={handleEdit}
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
  if (status.source) {
    parts.push(status.source);
  }
  if (status.cacheState) {
    parts.push(status.cacheState);
  }
  if (typeof status.resultCount === "number") {
    parts.push(`${status.resultCount} ${status.resultCount === 1 ? "result" : "results"}`);
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
    })
    .slice(0, 3);
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
  if (phase === "writing") return "#F59E0B";
  if (phase === "finalizing") return "#10B981";
  if (phase === "analyzing") return "#8B5CF6";
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
            style={BUBBLE_SHADOW}
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
    if (!status.startedAt) {
      return;
    }
    const timer = setInterval(() => {
      setElapsedLabel(formatElapsedTime(status.startedAt));
    }, 1000);
    return () => clearInterval(timer);
  }, [status.startedAt]);

  const dotStyle = useAnimatedStyle(() => ({ opacity: 0.35 + shimmer.value * 0.65 }));
  const title = getProgressTitle(status);
  const iconName = getProgressIcon(status);
  const accentColor = getAccentColor(status, theme.primary.val);
  const queryLabel =
    status.query?.trim() && status.query.trim() !== status.detail?.trim()
      ? `Query: "${status.query.trim()}"`
      : null;
  const metaLabel = formatMetaLabel(status);
  const events = getUsefulEvents(status);
  const previewItems = (status.previewItems ?? []).filter(Boolean).slice(0, 2);

  return (
    <Animated.View
      entering={FadeInDown.duration(220)}
      layout={PROGRESS_LAYOUT}
      style={{ marginBottom: CHAT.messageGap }}
    >
      <XStack gap={8} alignSelf="flex-start" alignItems="flex-end">
        <Animated.View layout={PROGRESS_LAYOUT}>
          <YStack
            paddingHorizontal={14}
            paddingVertical={12}
            borderRadius={CHAT.bubbleRadius}
            borderBottomLeftRadius={6}
            backgroundColor="$backgroundStrong"
            borderWidth={1}
            borderColor="$borderColor"
            gap={10}
            style={[BUBBLE_SHADOW, { maxWidth: 300, minWidth: 250, position: "relative" }]}
          >
            {elapsedLabel ? (
              <Text
                fontSize={9}
                color="$colorMuted"
                opacity={0.65}
                style={{ position: "absolute", top: 12, right: 14 }}
              >
                {elapsedLabel}
              </Text>
            ) : null}
            <Animated.View layout={PROGRESS_LAYOUT}>
              <XStack gap={10} alignItems="flex-start">
                <Animated.View style={dotStyle}>
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      backgroundColor: `${accentColor}18`,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Feather name={iconName as any} size={13} color={accentColor} />
                  </View>
                </Animated.View>
                <YStack gap={2} flex={1} paddingRight={32}>
                    <AnimatedSwapText
                      text={title}
                      fontSize={13}
                      color="$color"
                      fontFamily={FontFamily.semiBold}
                      maxWidth={212}
                      numberOfLines={1}
                    />
                    <AnimatedSwapText
                      text={status.detail?.trim() || "Working on your request"}
                      fontSize={11}
                      color="$colorMuted"
                      maxWidth={226}
                      numberOfLines={2}
                    />
                    {queryLabel ? (
                      <AnimatedSwapText
                        text={queryLabel}
                        fontSize={10}
                        color="$colorMuted"
                        maxWidth={226}
                        numberOfLines={1}
                        opacity={0.78}
                      />
                    ) : null}
                </YStack>
              </XStack>
            </Animated.View>

            {metaLabel ? (
              <Animated.View layout={PROGRESS_LAYOUT}>
                <Text fontSize={10} color="$colorMuted" opacity={0.76}>
                  {metaLabel}
                </Text>
              </Animated.View>
            ) : null}

            {events.length > 0 ? (
              <Animated.View layout={PROGRESS_LAYOUT}>
                <YStack gap={4}>
                  {events.map((event, index) => (
                    <XStack key={`${event.label}_${event.value ?? "value"}_${index}`} gap={7} alignItems="flex-start">
                      <View
                        style={{
                          width: 4,
                          height: 4,
                          borderRadius: 2,
                          backgroundColor: accentColor,
                          opacity: 0.75,
                          marginTop: 6,
                        }}
                      />
                      <Text fontSize={10} color="$colorMuted" opacity={0.84} flex={1}>
                        <Text fontFamily={FontFamily.medium} color="$colorMuted">
                          {event.label}
                        </Text>
                        {event.value ? `: ${event.value}` : ""}
                      </Text>
                    </XStack>
                  ))}
                </YStack>
              </Animated.View>
            ) : null}

            {previewItems.length > 0 ? (
              <Animated.View layout={PROGRESS_LAYOUT}>
                <YStack gap={5}>
                  <Text fontSize={10} color="$colorMuted" opacity={0.76}>
                    Matches
                  </Text>
                  {previewItems.map((item, index) => (
                    <XStack key={`${item}_${index}`} gap={8} alignItems="center">
                      <View
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: 3,
                          backgroundColor: accentColor,
                          opacity: 0.85,
                        }}
                      />
                      <Text fontSize={10} color="$color" numberOfLines={1} maxWidth={250}>
                        {item}
                      </Text>
                    </XStack>
                  ))}
                </YStack>
              </Animated.View>
            ) : (
              <Animated.View layout={PROGRESS_LAYOUT} />
            )}
          </YStack>
        </Animated.View>
      </XStack>
    </Animated.View>
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
      entering={FadeInDown.duration(220)}
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
                    BUBBLE_SHADOW,
                  ]}
                >
                  <Markdown style={mdStyles}>{msg.content}</Markdown>
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
  onPickImage,
  onPickDoc,
  chatInputMode,
  setChatInputMode,
}: {
  isSending: boolean;
  onSend: (text: string) => void;
  onPickImage: () => void;
  onPickDoc: () => void;
  chatInputMode?: "voice" | "keyboard";
  setChatInputMode?: (mode: "voice" | "keyboard") => void;
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

  const canSend = text.trim().length > 0 && !isSending;

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;
    (onSend as any)(trimmed, false);
    setText("");
  }, [text, isSending, onSend]);

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
    <XStack
      alignItems="flex-end"
      padding={8}
      gap={6}
      borderWidth={1}
      borderRadius={24}
      borderColor="$borderColor"
      backgroundColor="$backgroundStrong"
      style={SURFACE_SHADOW}
    >
      <PopoverMenu
        items={[
          { label: "Attach document", icon: "paperclip", onPress: onPickDoc },
          { label: "Pick image", icon: "image", onPress: onPickImage },
        ]}
      >
        <YStack
          width={36}
          height={36}
          alignItems="center"
          justifyContent="center"
          borderRadius={18}
        >
          <Feather name="paperclip" size={18} color={theme.colorMuted.val} />
        </YStack>
      </PopoverMenu>

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
          color={canSend ? "#FFFFFF" : theme.colorMuted.val}
        />
      </Pressable>
    </XStack>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ onSuggestion }: { onSuggestion: (text: string) => void }) {
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

      <YStack gap={8} width="100%">
        {SUGGESTIONS.map((s, i) => (
          <Animated.View
            key={s}
            entering={FadeInDown.delay(i * 50).duration(250)}
          >
            <Pressable
              onPress={() => onSuggestion(s)}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                paddingHorizontal: 16,
                paddingVertical: 14,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: theme.borderColor.val,
                backgroundColor: theme.backgroundStrong.val,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Feather name="chevron-right" size={14} color={theme.colorMuted.val} />
              <Text fontSize={14} fontFamily="$body" flex={1} color="$color">
                {s}
              </Text>
            </Pressable>
          </Animated.View>
        ))}
      </YStack>
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
  const token = tokenProp ?? auth.token;
  const insets = useSafeAreaInsets();
  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();

  const keyboardSpacerStyle = useAnimatedStyle(() => ({
    height: Math.abs(keyboardHeight.value),
  }));

  const messages = useQuery(api.chat.list, token ? { token, limit: 100 } : "skip") ?? [];
  const searchStatus = useQuery(api.chat.getSearchStatus, token ? { token } : "skip");
  const sendMessage = useAction(api.actions.memoryChat.chat);
  const runDeepSearch = useAction(api.chat.deepSearch);
  const clearChat = useMutation(api.chat.clear);
  const updateMemory = useMutation(api.memories.update);
  const deleteMemoryMutation = useMutation(api.memories.remove);

  const [isSending, setIsSending] = useState(false);
  const [editTargetId, setEditTargetId] = useState<string | null>(null);
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false);
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
    if (editMemoryNote && editTargetId && !isEditSheetOpen) {
      setIsEditSheetOpen(true);
    }
  }, [editMemoryNote, editTargetId, isEditSheetOpen]);

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
      if (!text.trim() || !token) return;
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      lastInputModeRef.current = isVoice ? "voice" : "keyboard";

      const optimisticMsg: ChatMsg = {
        _id: `optimistic_${Date.now()}`,
        role: "user",
        content: text.trim(),
        _creationTime: Date.now(),
      };

      setOptimisticMessage(optimisticMsg);
      setIsSending(true);
      try {
        await sendMessage({
          token,
          message: text.trim(),
          currentTime: new Date().toISOString(),
          currentTimezone:
            Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        });
        // Optimistic message will be cleared by the useEffect when real messages arrive
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
    [token, sendMessage, showToast],
  );

  const pickImage = useCallback(async () => {
    try {
      const ImagePicker = await import("expo-image-picker");
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        handleSend(
          `[Attached image: ${result.assets[0].fileName || "photo"} — ${result.assets[0].uri}]`,
        );
      }
    } catch {
      showToast({ title: "Could not open image picker", tone: "error" });
    }
  }, [handleSend, showToast]);

  const pickDocument = useCallback(async () => {
    try {
      const DocumentPicker = await import("expo-document-picker");
      const result = await DocumentPicker.getDocumentAsync();
      if (!result.canceled && result.assets[0]) {
        handleSend(
          `[Attached document: ${result.assets[0].name} — ${result.assets[0].uri}]`,
        );
      }
    } catch {
      showToast({ title: "Could not open document picker", tone: "error" });
    }
  }, [handleSend, showToast]);

  const handleClearChat = useCallback(() => {
    if (!token) return;
    clearChat({ token });
    showToast({ title: "Chat cleared", tone: "info", duration: 2500 });
  }, [token, clearChat, showToast]);

  const handleEditMemory = useCallback((id: string) => {
    setEditTargetId(id);
  }, []);

  const handleCloseEdit = useCallback(() => {
    setIsEditSheetOpen(false);
    setEditTargetId(null);
  }, []);

  const handleSaveEdit = useCallback(async (data: Record<string, unknown>) => {
    if (!editTargetId || !token) return;
    try {
      if (data._delete) {
        await deleteMemoryMutation({ token, id: editTargetId as any });
        showToast({ title: "Memory deleted", tone: "success" });
      } else {
        await updateMemory({ token, id: editTargetId as any, ...data });
        showToast({ title: "Memory updated", tone: "success" });
      }
    } catch {
      showToast({ title: "Couldn't save — try again", tone: "error" });
    }
    handleCloseEdit();
  }, [editTargetId, token, updateMemory, deleteMemoryMutation, showToast, handleCloseEdit]);

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
        color: "#FFFFFF",
        fontSize: compact ? 13 : 14,
        fontFamily: FontFamily.regular,
        lineHeight: compact ? 18 : 20,
      },
      strong: { fontFamily: FontFamily.bold, color: "#FFFFFF" },
      code_inline: {
        fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
        backgroundColor: "rgba(255,255,255,0.15)",
        color: "#FFFFFF",
        fontSize: 13,
      },
      code_block: {
        fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
        backgroundColor: "rgba(255,255,255,0.15)",
        color: "#FFFFFF",
        fontSize: 13,
        padding: 8,
        borderRadius: 6,
      },
      link: { color: "#FFFFFF" },
    }),
    [compact],
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

      if (item.role !== "user") {
          const dParsed = parseDeletionProposal(item.content ?? "");
          if (dParsed) {
              deletionItems = dParsed.items;
              displayMsg = { ...displayMsg, content: dParsed.cleanText };
          }
          const cParsed = parseCardIds(displayMsg.content ?? "");
          if (cParsed) {
              cardIds = cParsed.ids;
              cardIsCached = cParsed.isCached;
              displayMsg = { ...displayMsg, content: cParsed.cleanText };
          }
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
          onPickImage={pickImage}
          onPickDoc={pickDocument}
          chatInputMode={chatInputMode}
          setChatInputMode={setChatInputMode}
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
            style={SURFACE_SHADOW}
            flex={1}
          >
            <EmptyState onSuggestion={handleSend} />
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
        style={SURFACE_SHADOW}
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

      {/* Edit memory sheet — opens when user taps Edit on a search result card */}
      <EditMemorySheet
        memory={editMemoryNote ?? undefined}
        visible={isEditSheetOpen}
        onClose={handleCloseEdit}
        onSave={handleSaveEdit}
      />
    </YStack>
  );
}
