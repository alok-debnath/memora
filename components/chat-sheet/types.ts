import type { ReactElement, RefObject } from "react";
import type { ListRenderItemInfo } from "react-native";
import type { BottomSheetFlatListMethods } from "@gorhom/bottom-sheet";
import type { PendingAttachment } from "@/hooks/useFileAttachments";
import type { AIChatDisplayItem, ChatMsg } from "@/components/ai-chat/types";

export type ChatConversation = {
  _id: string;
  _creationTime: number;
  title: string;
  lastMessageAt: number;
  archived?: boolean;
};

export type ChatSheetController = {
  messages: ChatMsg[];
  displayMessages: AIChatDisplayItem[];
  renderMessage: (info: ListRenderItemInfo<AIChatDisplayItem>) => ReactElement | null;
  keyExtractor: (item: AIChatDisplayItem) => string;
  flatListRef: RefObject<BottomSheetFlatListMethods | null>;
  handleClearChat: () => void;
  isSending: boolean;
  attachments: PendingAttachment[];
  onRemoveAttachment: (id: string) => void;
  onPickImages: () => void;
  onPickCamera: () => void;
  onPickDocument: () => void;
  driveConnected: boolean;
  onRequestDriveAccess: () => void;
  handleSend: (text: string) => Promise<void>;
  /** Cooperative stop for the in-flight turn. */
  handleStop: () => void;
  /** Edit-and-resend: one-shot composer prefill. */
  prefillText: string | null;
  consumePrefill: () => void;
  conversations: ChatConversation[];
  /** null = the main thread (messages without a conversationId). */
  activeConversationId: string | null;
  selectConversation: (conversationId: string | null) => void;
  createNewConversation: () => Promise<void>;
  renameConversation: (conversationId: string, title: string) => void;
  archiveConversation: (conversationId: string) => void;
};
