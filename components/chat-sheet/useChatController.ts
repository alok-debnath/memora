import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import Clipboard from "@react-native-clipboard/clipboard";
import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";
import { useAction, useMutation, useQuery } from "convex/react";
import type { BottomSheetFlatListMethods } from "@gorhom/bottom-sheet";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { useAppToast } from "@/components/ui/toast";
import { useUIStore } from "@/store/ui";
import { useFileAttachments } from "@/hooks/useFileAttachments";
import { canUseGoogleCalendar, canUseGoogleDrive } from "@/lib/googleIntegration";
import type { MemoryNote } from "@/types/memory";
import { getReminderDate, inferMemoryEntryKind } from "@/types/memoryKind";
import type { Id } from "@/convex/_generated/dataModel";
import type {
  AIChatDisplayItem,
  ChatMsg,
  ThinkingDisplayItem,
  ToolProgressDisplayItem,
} from "@/components/ai-chat/types";
import { useAIChatMessageRenderer } from "@/components/ai-chat/MessageRenderer";
import type { ChatSheetController } from "./types";

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

function isChatMessage(item: AIChatDisplayItem): item is ChatMsg {
  return item.role !== "thinking" && item.role !== "tool_progress";
}

// Stable fallback so memo deps don't churn while the query is loading.
const NO_MESSAGES: ChatMsg[] = [];

export function useChatController(): ChatSheetController {
  const auth = useAuth();
  const { showToast } = useAppToast();
  const openEditMemory = useUIStore((state) => state.openEditMemory);
  const token = auth.token;

  // null = the main thread (messages without a conversationId).
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  const messages =
    useQuery(
      api.chat.list,
      token ? { token, conversationId: activeConversationId ?? undefined, limit: 100 } : "skip",
    ) ?? NO_MESSAGES;
  const conversations = useQuery(api.chat.listConversations, token ? { token } : "skip");
  const searchStatus = useQuery(api.chat.getSearchStatus, token ? { token } : "skip");
  const googleIntegration = useQuery(
    api.integrations.getGoogleIntegration,
    token ? { token } : "skip",
  );
  const sendMessage = useAction(api.actions.memoryChat.chat);
  const clearChat = useMutation(api.chat.clear);
  const requestCancel = useMutation(api.chat.requestCancel);
  const createConversationMutation = useMutation(api.chat.createConversation);
  const renameConversationMutation = useMutation(api.chat.renameConversation);
  const archiveConversationMutation = useMutation(api.chat.archiveConversation);

  const driveConnected = canUseGoogleDrive(googleIntegration ?? null);
  const calendarSyncEnabled = canUseGoogleCalendar(googleIntegration ?? null);
  // Destructured because the hook returns a fresh object each render; the
  // individual callbacks are stable and keep the memos below effective.
  const {
    attachments,
    pickImages,
    pickCamera,
    pickDocument,
    removeAttachment,
    uploadAll: uploadAllAttachments,
    clear: clearAttachments,
  } = useFileAttachments({ token: token ?? undefined });

  const [isSending, setIsSending] = useState(false);
  const [editTargetId, setEditTargetId] = useState<Id<"memories"> | null>(null);
  const [optimisticMessage, setOptimisticMessage] = useState<ChatMsg | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  // Composer prefill for edit-and-resend; consumed once by ChatComposer.
  const [prefillText, setPrefillText] = useState<string | null>(null);

  const flatListRef = useRef<BottomSheetFlatListMethods | null>(null);

  const editMemoryResult = useQuery(
    api.memories.listByIds,
    editTargetId && token ? { token, ids: [editTargetId] } : "skip",
  );
  const editMemoryNote = useMemo(() => {
    const doc = editMemoryResult?.[0];
    return doc ? chatToMemoryNote(doc as Record<string, unknown>) : null;
  }, [editMemoryResult]);

  useEffect(() => {
    if (editMemoryNote && editTargetId) {
      openEditMemory(editMemoryNote);
      setEditTargetId(null);
    }
  }, [editMemoryNote, editTargetId, openEditMemory]);

  const copyMessage = useCallback(
    (text: string) => {
      Clipboard.setString(text);
      showToast({
        title: "Copied to clipboard",
        tone: "success",
        duration: 2000,
      });
    },
    [showToast],
  );

  const speakMessage = useCallback(
    (id: string, text: string) => {
      void Speech.stop();
      if (speakingId === id) {
        setSpeakingId(null);
        return;
      }
      if (!text.trim()) return;
      setSpeakingId(id);
      Speech.speak(text, {
        language: "en",
        onDone: () => setSpeakingId((current) => (current === id ? null : current)),
        onStopped: () => setSpeakingId((current) => (current === id ? null : current)),
        onError: () => setSpeakingId((current) => (current === id ? null : current)),
      });
    },
    [speakingId],
  );

  // Stop any playback when the controller unmounts (sheet closes).
  useEffect(() => () => void Speech.stop(), []);

  const handleStop = useCallback(() => {
    if (!token) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    requestCancel({ token }).catch(() => {});
  }, [requestCancel, token]);

  const selectConversation = useCallback((conversationId: string | null) => {
    setActiveConversationId(conversationId);
  }, []);

  const createNewConversation = useCallback(async () => {
    if (!token) return;
    try {
      const id = await createConversationMutation({ token });
      setActiveConversationId(id);
    } catch {
      showToast({ title: "Couldn't create chat", tone: "error" });
    }
  }, [createConversationMutation, showToast, token]);

  const renameConversation = useCallback(
    (conversationId: string, title: string) => {
      if (!token) return;
      renameConversationMutation({ token, conversationId, title }).catch(() => {
        showToast({ title: "Couldn't rename chat", tone: "error" });
      });
    },
    [renameConversationMutation, showToast, token],
  );

  const archiveConversation = useCallback(
    (conversationId: string) => {
      if (!token) return;
      if (activeConversationId === conversationId) {
        setActiveConversationId(null);
      }
      archiveConversationMutation({ token, conversationId }).catch(() => {
        showToast({ title: "Couldn't archive chat", tone: "error" });
      });
    },
    [activeConversationId, archiveConversationMutation, showToast, token],
  );

  const handleSend = useCallback(
    async (text: string) => {
      const hasPendingAttachments = attachments.some(
        (attachment) =>
          attachment.uploadStatus === "idle" || attachment.uploadStatus === "compressing",
      );
      if ((!text.trim() && !hasPendingAttachments) || !token) return;

      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      setOptimisticMessage({
        _id: `optimistic_${Date.now()}`,
        role: "user",
        content: text.trim() || "📎",
        _creationTime: Date.now(),
      });
      setIsSending(true);

      try {
        let uploadedAttachments: Awaited<ReturnType<typeof uploadAllAttachments>> = [];
        if (hasPendingAttachments) {
          try {
            uploadedAttachments = await uploadAllAttachments();
          } catch (uploadError) {
            const message = uploadError instanceof Error ? uploadError.message : "Upload failed";
            showToast({ title: "Upload failed", message, tone: "error" });
            setOptimisticMessage(null);
            setIsSending(false);
            return;
          }
        }

        const response = await sendMessage({
          token,
          message: text.trim() || " ",
          conversationId: activeConversationId ?? undefined,
          currentTime: new Date().toISOString(),
          currentTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          attachments: uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
        });

        clearAttachments();

        if (Array.isArray(response?.attachmentFailures) && response.attachmentFailures.length > 0) {
          const [firstFailure] = response.attachmentFailures;
          showToast({
            title: firstFailure.reason,
            tone: "error",
            duration: 6500,
          });
        }
      } catch {
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
    [
      activeConversationId,
      attachments,
      clearAttachments,
      sendMessage,
      showToast,
      token,
      uploadAllAttachments,
    ],
  );

  /** Re-ask the last user question (retry after an error, or a fresh take). */
  const regenerateLastMessage = useCallback(() => {
    if (isSending) return;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i];
      if (message.role === "user" && message.content?.trim()) {
        void handleSend(message.content.trim());
        return;
      }
    }
  }, [handleSend, isSending, messages]);

  /** Put a previous user message back into the composer for editing. */
  const editAndResend = useCallback((text: string) => {
    if (!text.trim()) return;
    setPrefillText(text.trim());
  }, []);

  const consumePrefill = useCallback(() => setPrefillText(null), []);

  const handleRequestDriveAccess = useCallback(() => {
    showToast({
      title: googleIntegration?.connected
        ? "Google Drive uploads disabled"
        : "Google Drive not connected",
      message: googleIntegration?.connected
        ? googleIntegration.hasDriveScope
          ? "Turn Google Drive uploads back on in Profile → Integrations to attach files."
          : "Reconnect Google in Profile → Integrations to grant Drive access."
        : "Connect Google in Settings to attach files.",
      tone: "info",
    });
  }, [googleIntegration, showToast]);

  const handleClearChat = useCallback(() => {
    if (!token) return;
    clearChat({ token, conversationId: activeConversationId ?? undefined })
      .then(() => {
        showToast({ title: "Chat cleared", tone: "info", duration: 2500 });
      })
      .catch(() => {
        showToast({ title: "Failed to clear chat", tone: "error", duration: 3000 });
      });
  }, [activeConversationId, clearChat, showToast, token]);

  const handleEditMemory = useCallback((id: Id<"memories">) => {
    setEditTargetId(id);
  }, []);

  // Base list identity changes only when real messages / the optimistic send
  // change — status ticks must not rebuild it, or every memoized bubble
  // re-renders through the inverted list's reverse copy.
  const baseMessages = useMemo<AIChatDisplayItem[]>(() => {
    const base: AIChatDisplayItem[] = [...messages];

    if (
      optimisticMessage &&
      !base.some(
        (message) =>
          isChatMessage(message) &&
          message.role === "user" &&
          message._creationTime > optimisticMessage._creationTime - 5000 &&
          // Attachment-only sends persist as a single space (see memoryChat.ts's
          // `text.trim() || " "`), not the "📎" placeholder shown optimistically.
          (message.content === optimisticMessage.content ||
            (optimisticMessage.content === "📎" && !message.content?.trim())),
      )
    ) {
      base.push(optimisticMessage);
    }

    return base;
  }, [messages, optimisticMessage]);

  // Transient tail rows keep stable object identity per status value so the
  // list's keyed rows don't churn on unrelated re-renders.
  const progressRow = useMemo<ToolProgressDisplayItem | null>(
    () =>
      searchStatus
        ? {
            _id: "__tool_progress__",
            role: "tool_progress",
            status: searchStatus,
            _creationTime: Date.now(),
          }
        : null,
    [searchStatus],
  );

  const thinkingRow = useMemo<ThinkingDisplayItem | null>(
    () =>
      isSending
        ? {
            _id: "__thinking__",
            role: "thinking",
            content: "",
            _creationTime: Date.now(),
          }
        : null,
    [isSending],
  );

  const displayMessages = useMemo<AIChatDisplayItem[]>(() => {
    // Once the assistant reply starts streaming into a message doc, the text
    // itself is the live feedback — drop the tool-progress/thinking rows.
    const lastMessage = baseMessages[baseMessages.length - 1];
    const isStreamingReply =
      !!lastMessage &&
      isChatMessage(lastMessage) &&
      lastMessage.role === "assistant" &&
      lastMessage.streaming === true;
    if (isStreamingReply) {
      return baseMessages;
    }

    if (progressRow) return [...baseMessages, progressRow];
    if (thinkingRow) return [...baseMessages, thinkingRow];
    return baseMessages;
  }, [baseMessages, progressRow, thinkingRow]);

  const renderMessage = useAIChatMessageRenderer({
    copyMessage,
    speakingId,
    speakMessage,
    token,
    calendarSyncEnabled,
    onEditMemory: handleEditMemory,
    onRegenerate: regenerateLastMessage,
    onEditResend: editAndResend,
  });

  // The list is inverted (offset 0 = newest message), so "scroll to bottom"
  // means scroll to offset 0.
  const prevCountRef = useRef(messages.length);
  useEffect(() => {
    if (messages.length > prevCountRef.current) {
      const timer = setTimeout(() => {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      }, 120);

      prevCountRef.current = messages.length;
      if (isSending) {
        setOptimisticMessage(null);
      }

      return () => clearTimeout(timer);
    }

    prevCountRef.current = messages.length;
  }, [isSending, messages]);

  useEffect(() => {
    if (isSending || optimisticMessage) {
      const timer = setTimeout(() => {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isSending, optimisticMessage]);

  const keyExtractor = useCallback((item: AIChatDisplayItem) => item._id, []);

  return useMemo<ChatSheetController>(
    () => ({
      messages,
      displayMessages,
      renderMessage,
      keyExtractor,
      flatListRef,
      handleClearChat,
      isSending,
      attachments,
      onRemoveAttachment: removeAttachment,
      onPickImages: pickImages,
      onPickCamera: pickCamera,
      onPickDocument: pickDocument,
      driveConnected,
      onRequestDriveAccess: handleRequestDriveAccess,
      handleSend,
      handleStop,
      prefillText,
      consumePrefill,
      conversations: conversations ?? [],
      activeConversationId,
      selectConversation,
      createNewConversation,
      renameConversation,
      archiveConversation,
    }),
    [
      activeConversationId,
      archiveConversation,
      attachments,
      consumePrefill,
      conversations,
      createNewConversation,
      displayMessages,
      driveConnected,
      handleClearChat,
      handleRequestDriveAccess,
      handleSend,
      handleStop,
      isSending,
      keyExtractor,
      messages,
      pickCamera,
      pickDocument,
      pickImages,
      prefillText,
      removeAttachment,
      renameConversation,
      renderMessage,
      selectConversation,
    ],
  );
}
