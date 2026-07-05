import type { ReactElement, RefObject } from "react";
import type { ListRenderItemInfo } from "react-native";
import type { BottomSheetFlatListMethods } from "@gorhom/bottom-sheet";
import type { PendingAttachment } from "@/hooks/useFileAttachments";
import type { AIChatDisplayItem, ChatMsg } from "@/components/ai-chat/types";

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
};
