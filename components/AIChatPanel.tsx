import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  TextInput,
  FlatList,
  ScrollView,
  Pressable,
  Platform,
  Clipboard,
} from "react-native";
import { XStack, YStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";
import Markdown from "react-native-markdown-display";
import Animated, {
  FadeIn,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  withSpring,
  ZoomIn,
} from "react-native-reanimated";
import { useVoiceInput } from "@/hooks/useVoiceInput";
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

// ─── Constants ────────────────────────────────────────────────────────────────

const CHAT = {
  avatarSize: 32,
  bubbleRadius: 18,
  bubblePadding: 14,
  messageGap: 12,
  bodyPad: 16,
} as const;

const SUGGESTIONS = [
  "What did I note about the project?",
  "Search my documents",
  "Find travel memories",
  "Create a reminder",
  "How many memories do I have?",
];

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

// ─── Thinking Indicator ───────────────────────────────────────────────────────

// Each dot is its own component so hooks are called at the top level (not inside map)
function ThinkingDot({ delay, color }: { delay: number; color: string }) {
  const translateY = useSharedValue(0);

  useEffect(() => {
    translateY.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(-6, { duration: 350 }),
          withTiming(0, { duration: 350 }),
        ),
        -1,
        false,
      ),
    );
  }, [delay, translateY]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View
      style={[{ width: 7, height: 7, borderRadius: 4, backgroundColor: color, opacity: 0.75 }, style]}
    />
  );
}

function ThinkingIndicator() {
  const theme = useAppTheme();
  const color = theme.primary.val;

  return (
    <Animated.View entering={FadeInDown.duration(220)}>
      <XStack
        gap={8}
        alignSelf="flex-start"
        marginBottom={CHAT.messageGap}
        alignItems="flex-end"
      >
        {/* Avatar */}
        <XStack
          width={CHAT.avatarSize}
          height={CHAT.avatarSize}
          borderRadius={CHAT.avatarSize / 2}
          alignItems="center"
          justifyContent="center"
          backgroundColor={color + "15"}
        >
          <Feather name="zap" size={14} color={color} />
        </XStack>

        {/* Bubble with three bouncing dots */}
        <XStack
          paddingHorizontal={16}
          paddingVertical={14}
          borderRadius={CHAT.bubbleRadius}
          borderBottomLeftRadius={6}
          backgroundColor="$backgroundStrong"
          borderWidth={1}
          borderColor="$borderColor"
          gap={6}
          alignItems="center"
          shadowColor="#000"
          shadowOffset={{ width: 0, height: 2 }}
          shadowOpacity={0.05}
          shadowRadius={6}
          elevation={2}
        >
          <ThinkingDot delay={0}   color={color} />
          <ThinkingDot delay={160} color={color} />
          <ThinkingDot delay={320} color={color} />
        </XStack>
      </XStack>
    </Animated.View>
  );
}

// ─── Suggestion Chips ─────────────────────────────────────────────────────────

function SuggestionChips({
  chips,
  onPress,
  disabled,
}: {
  chips: string[];
  onPress: (chip: string) => void;
  disabled: boolean;
}) {
  const theme = useAppTheme();
  return (
    <YStack paddingBottom={8}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        contentContainerStyle={{ gap: 8, paddingHorizontal: CHAT.bodyPad }}
      >
        {chips.map((chip) => (
          <Pressable
            key={chip}
            onPress={() => onPress(chip)}
            disabled={disabled}
            style={({ pressed }) => ({
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: theme.borderColor.val,
              backgroundColor: theme.backgroundStrong.val,
              opacity: disabled || pressed ? 0.5 : 1,
            })}
          >
            <Text
              fontSize={13}
              fontFamily="$body"
              fontWeight="500"
              color="$color"
              numberOfLines={1}
            >
              {chip}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </YStack>
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
}: {
  msg: ChatMsg;
  isUser: boolean;
  mdStyles: any;
  speakingId: string | null;
  onSpeak: (id: string, text: string) => void;
  onCopy: (text: string) => void;
}) {
  const theme = useAppTheme();
  const isSpeaking = speakingId === msg._id;
  const [showActions, setShowActions] = useState(false);
  const scaleAnim = useSharedValue(1);

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
      entering={FadeInDown.duration(250).springify().damping(18)}
      style={{ marginBottom: CHAT.messageGap }}
    >
      <XStack
        maxWidth="82%"
        gap={8}
        alignSelf={isUser ? "flex-end" : "flex-start"}
      >
        {!isUser && (
          <XStack
            width={CHAT.avatarSize}
            height={CHAT.avatarSize}
            borderRadius={CHAT.avatarSize / 2}
            alignItems="center"
            justifyContent="center"
            marginTop={2}
            backgroundColor={theme.primary.val + "12"}
          >
            <Feather name="zap" size={14} color={theme.primary.val} />
          </XStack>
        )}

        <YStack flex={1} gap={4}>
          <XStack alignItems="center" gap={8} alignSelf={isUser ? "flex-end" : "flex-start"}>
            {/* Show speaker icon to the left of AI messages if it's currently speaking */}
            {!isUser && isSpeaking && (
              <Animated.View entering={ZoomIn.duration(200)}>
                 <Pressable
                  onPress={() => onSpeak(msg._id, msg.content)}
                  hitSlop={8}
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.6 : 1,
                    width: 24,
                    height: 24,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: theme.primary.val + "15",
                    borderRadius: 12,
                  })}
                >
                  <Feather name="volume-x" size={14} color={theme.primary.val} />
                </Pressable>
              </Animated.View>
            )}

            <Pressable onLongPress={handleLongPress} delayLongPress={400} style={{ flexShrink: 1 }}>
              <Animated.View style={bubbleStyle}>
                <YStack
                  paddingHorizontal={CHAT.bubblePadding}
                  paddingVertical={12}
                  borderRadius={CHAT.bubbleRadius}
                  backgroundColor={isUser ? theme.primary.val : theme.backgroundStrong.val}
                  borderWidth={isUser ? 0 : 1}
                  borderColor={isUser ? "transparent" : "$borderColor"}
                  style={isUser ? { borderBottomRightRadius: 6 } : { borderBottomLeftRadius: 6 }}
                  shadowColor={isUser ? theme.primary.val : "#000"}
                  shadowOffset={{ width: 0, height: 2 }}
                  shadowOpacity={isUser ? 0.2 : 0.05}
                  shadowRadius={6}
                  elevation={2}
                >
                  <Markdown style={mdStyles}>{msg.content}</Markdown>
                </YStack>
              </Animated.View>
            </Pressable>

            {/* Show speaker icon to the right of AI messages */}
            {!isUser && !isSpeaking && (
              <Animated.View entering={FadeIn.duration(200)}>
                <Pressable
                  onPress={() => onSpeak(msg._id, msg.content)}
                  hitSlop={8}
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.6 : 1,
                    width: 28,
                    height: 28,
                    alignItems: "center",
                    justifyContent: "center",
                  })}
                >
                  <Feather name="volume-2" size={14} color={theme.colorMuted.val} />
                </Pressable>
              </Animated.View>
            )}
          </XStack>

          {/* Inline action bar — shown on long press */}
          {showActions && (
            <Animated.View entering={ZoomIn.springify().damping(18)}>
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
        </YStack>
      </XStack>
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
        <YStack gap={8}>
          {voiceLiveTranscript ? (
            <YStack
              paddingHorizontal={14}
              paddingVertical={10}
              borderRadius={16}
              backgroundColor="$accent"
              borderWidth={1}
              borderColor="$primary"
            >
              <Text fontSize={15} fontFamily="$body" color="$color" lineHeight={22}>
                {voiceLiveTranscript}
              </Text>
            </YStack>
          ) : null}
          <XStack alignItems="center" justifyContent="center" position="relative" minHeight={80}>
             {/* Center Voice Button */}
             <VoiceRecorder
                onTranscription={setVoiceLiveTranscript}
                onTranscriptionComplete={(text) => {
                  setVoiceLiveTranscript("");
                  handleVoiceComplete(text);
                }}
                compact={false}
              />

              {/* Right Keyboard Button */}
              <Pressable
                onPress={() => setMode("keyboard")}
                hitSlop={12}
                style={({ pressed }) => ({
                  position: "absolute",
                  right: 16,
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: theme.backgroundStrong.val,
                  borderWidth: 1,
                  borderColor: theme.borderColor.val,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Feather name="type" size={20} color={theme.colorMuted.val} />
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
    >
      <Pressable
        onPress={onPickDoc}
        hitSlop={6}
        style={({ pressed }) => ({
          width: 36,
          height: 36,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 18,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Feather name="paperclip" size={18} color={theme.colorMuted.val} />
      </Pressable>
      <Pressable
        onPress={onPickImage}
        hitSlop={6}
        style={({ pressed }) => ({
          width: 36,
          height: 36,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 18,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Feather name="image" size={18} color={theme.colorMuted.val} />
      </Pressable>

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
        <Animated.View entering={ZoomIn.springify().damping(16)}>
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
          fontSize={22}
          fontFamily="$heading"
          fontWeight="700"
          textAlign="center"
          color="$color"
        >
          Ask Memora anything
        </Text>
        <Text
          fontSize={14}
          fontFamily="$body"
          lineHeight={20}
          textAlign="center"
          maxWidth={300}
          color="$colorMuted"
        >
          Search memories, inspect documents, analyze patterns, or create notes.
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
}

export function AIChatPanel({ compact, token: tokenProp, chatInputMode, setChatInputMode }: ExtendedAIChatPanelProps) {
  const theme = useAppTheme();
  const auth = useAuth();
  const { showToast } = useAppToast();
  const token = tokenProp ?? auth.token;
  const insets = useSafeAreaInsets();
  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();

  const keyboardSpacerStyle = useAnimatedStyle(() => ({
    height: Math.abs(keyboardHeight.value),
  }));

  const messages = useQuery(api.chat.list, token ? { token } : "skip") ?? [];
  const sendMessage = useAction(api.actions.memoryChat.chat);
  const clearChat = useMutation(api.chat.clear);

  const [isSending, setIsSending] = useState(false);
  const [optimisticMessage, setOptimisticMessage] = useState<ChatMsg | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);

  // Scroll to bottom when sending starts (to show thinking indicator) or when new messages arrive
  const prevCountRef = useRef(messages.length);
  useEffect(() => {
    if (messages.length > prevCountRef.current) {
      const timer = setTimeout(() => {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      }, 120);

      // Auto-readout logic
      if (lastInputModeRef.current === "voice" && messages.length > 0) {
        const lastMsg = messages[messages.length - 1]; // Assume latest message is at end of array (since query sorts ascending)
        if (lastMsg && lastMsg.role !== "user" && !unreadVoiceResponsesRef.current.has(lastMsg._id)) {
            unreadVoiceResponsesRef.current.add(lastMsg._id);
            speakMessage(lastMsg._id, lastMsg.content);
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
      if (speakingId === id) {
        Speech.stop();
        setSpeakingId(null);
        return;
      }
      Speech.stop(); // Stop any currently playing speech before starting a new one
      setSpeakingId(id);
      Speech.speak(text.replace(/\*\*/g, "").replace(/`/g, ""), {
        onDone: () => setSpeakingId(null),
        onStopped: () => setSpeakingId(null),
        onError: () => setSpeakingId(null),
      });
    },
    [speakingId],
  );

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
        await sendMessage({ token, message: text.trim() });
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

    if (isSending) {
      return [
        { _id: "__thinking__", role: "thinking", content: "", _creationTime: 0 } as any,
        ...base,
      ];
    }
    return base;
  }, [messages, isSending, optimisticMessage]);

  const renderMessage = useCallback(
    ({ item }: { item: any }) => {
      if (item.role === "thinking") return <ThinkingIndicator />;
      return (
        <ChatBubble
          msg={item}
          isUser={item.role === "user"}
          mdStyles={item.role === "user" ? userMdStyles : aiMdStyles}
          speakingId={speakingId}
          onSpeak={speakMessage}
          onCopy={copyMessage}
        />
      );
    },
    [aiMdStyles, userMdStyles, speakingId, speakMessage, copyMessage],
  );

  const keyExtractor = useCallback((item: any) => item._id, []);

  // ── Input bar ──────────────────────────────────────────────────────────────
  const inputBar = (
    <KeyboardStickyView>
      <YStack
        backgroundColor="$backgroundStrong"
        borderTopWidth={0.5}
        borderTopColor="$borderColor"
        paddingHorizontal={12}
        paddingTop={8}
        paddingBottom={Math.max(insets.bottom, 12)}
        gap={8}
      >
        <SuggestionChips
          chips={SUGGESTIONS.slice(0, 3)}
          onPress={handleSend}
          disabled={isSending}
        />
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
          <EmptyState onSuggestion={handleSend} />
          <Animated.View style={keyboardSpacerStyle} />
        </YStack>
        {inputBar}
      </YStack>
    );
  }

  // ── Chat view ──────────────────────────────────────────────────────────────
  return (
    <YStack flex={1}>
      {/* Header */}
      <XStack
        alignItems="center"
        justifyContent="space-between"
        paddingHorizontal={CHAT.bodyPad}
        paddingVertical={12}
        borderBottomWidth={0.5}
        borderBottomColor="$borderColor"
        backgroundColor="$backgroundStrong"
      >
        <YStack>
          <Text fontSize={17} fontFamily="$heading" fontWeight="700" color="$color">
            Memora AI
          </Text>
          <Text fontSize={12} fontFamily="$body" marginTop={1} color="$colorMuted">
            {messages.length} {messages.length === 1 ? "message" : "messages"}
          </Text>
        </YStack>
        <Pressable
          onPress={handleClearChat}
          hitSlop={8}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Feather name="trash-2" size={15} color={theme.colorMuted.val} />
          <Text fontSize={12} fontFamily="$body" color="$colorMuted">
            Clear
          </Text>
        </Pressable>
      </XStack>

      {/* Message list + keyboard spacer */}
      <YStack flex={1} overflow="hidden">
        <FlatList
          ref={flatListRef}
          data={displayMessages}
          renderItem={renderMessage}
          keyExtractor={keyExtractor}
          inverted
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: CHAT.bodyPad, paddingTop: 10 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        />
        <Animated.View style={keyboardSpacerStyle} />
      </YStack>

      {inputBar}
    </YStack>
  );
}
