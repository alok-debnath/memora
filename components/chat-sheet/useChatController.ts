import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import Clipboard from "@react-native-clipboard/clipboard";
import * as Haptics from "expo-haptics";
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

  const messages = useQuery(api.chat.list, token ? { token, limit: 100 } : "skip") ?? NO_MESSAGES;
  const searchStatus = useQuery(api.chat.getSearchStatus, token ? { token } : "skip");
  const googleIntegration = useQuery(
    api.integrations.getGoogleIntegration,
    token ? { token } : "skip",
  );
  const sendMessage = useAction(api.actions.memoryChat.chat);
  const clearChat = useMutation(api.chat.clear);

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
    [attachments, clearAttachments, sendMessage, showToast, token, uploadAllAttachments],
  );

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
    clearChat({ token })
      .then(() => {
        showToast({ title: "Chat cleared", tone: "info", duration: 2500 });
      })
      .catch(() => {
        showToast({ title: "Failed to clear chat", tone: "error", duration: 3000 });
      });
  }, [clearChat, showToast, token]);

  const handleEditMemory = useCallback((id: Id<"memories">) => {
    setEditTargetId(id);
  }, []);

  const displayMessages = useMemo<AIChatDisplayItem[]>(() => {
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

    // Once the assistant reply starts streaming into a message doc, the text
    // itself is the live feedback — drop the tool-progress/thinking rows.
    const lastMessage = base[base.length - 1];
    const isStreamingReply =
      !!lastMessage &&
      isChatMessage(lastMessage) &&
      lastMessage.role === "assistant" &&
      lastMessage.streaming === true;
    if (isStreamingReply) {
      return base;
    }

    if (searchStatus) {
      const progressRow: ToolProgressDisplayItem = {
        _id: "__tool_progress__",
        role: "tool_progress",
        status: searchStatus,
        _creationTime: Date.now(),
      };
      return [...base, progressRow];
    }

    if (isSending) {
      const thinkingRow: ThinkingDisplayItem = {
        _id: "__thinking__",
        role: "thinking",
        content: "",
        _creationTime: Date.now(),
      };
      return [...base, thinkingRow];
    }

    return base;
  }, [isSending, messages, optimisticMessage, searchStatus]);

  const renderMessage = useAIChatMessageRenderer({
    copyMessage,
    token,
    calendarSyncEnabled,
    onEditMemory: handleEditMemory,
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
    }),
    [
      attachments,
      displayMessages,
      driveConnected,
      handleClearChat,
      handleRequestDriveAccess,
      handleSend,
      isSending,
      keyExtractor,
      messages,
      pickCamera,
      pickDocument,
      pickImages,
      removeAttachment,
      renderMessage,
    ],
  );
}
